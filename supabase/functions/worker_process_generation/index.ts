import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getAIAdapter } from '../_shared/ai.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

interface Generation {
  id: string;
  uid: string;
  product_description: string;
  reference_image_url: string | null;
  selected_style: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRole);

    // 1. Atomically claim a job using FOR UPDATE SKIP LOCKED pattern
    const { data: candidates, error: selectError } = await supabase
      .from('generations')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1);

    if (selectError) {
      throw new Error(`Failed to query jobs: ${selectError.message}`);
    }

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ message: 'No work available' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const job = candidates[0] as Generation;

    // Atomic update to claim the job
    const { data: claimed, error: updateError } = await supabase
      .from('generations')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'queued') // Only update if still queued
      .select()
      .single();

    if (updateError || !claimed) {
      // Job was claimed by another worker
      return new Response(JSON.stringify({ message: 'Job already claimed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing generation ${job.id}`);

    try {
      // 2. Get AI adapter and generate variants (text only, fast!)
      const ai = getAIAdapter();
      const variantsResponse = await ai.getVariants(
        job.product_description,
        job.reference_image_url || undefined,
        job.selected_style || undefined
      );

      if (variantsResponse.variants.length !== 3) {
        throw new Error('Expected exactly 3 variants from AI adapter');
      }

      // 3. IMMEDIATELY save text content (prompts & captions) - user sees this right away!
      console.log('Saving text content immediately...');
      const initialVariants = variantsResponse.variants.map((variant, i) => ({
        prompt: variant.prompt,
        caption: variant.caption,
        image_url: null, // Images loading...
      }));

      await supabase
        .from('generations')
        .update({
          result: {
            variants: initialVariants,
            safety_flags: [],
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      console.log('Text content saved! User can see prompts & captions now.');

      // 4. Generate and upload all images IN PARALLEL
      console.log('Generating all 3 images in parallel...');

      const imageGenerationPromises = variantsResponse.variants.map(async (variant, i) => {
        // Generate image - pass product image URL so AI can use it as base
        const imageBytes = await ai.getImageBytes(
          variant.prompt,
          job.reference_image_url || undefined
        );

        // Upload to storage bucket 'generated'
        const fileName = `${job.uid}/${job.id}/variant-${i + 1}.png`;
        const { error: uploadError } = await supabase.storage
          .from('generated')
          .upload(fileName, imageBytes, {
            contentType: 'image/png',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Failed to upload image ${i + 1}: ${uploadError.message}`);
        }

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from('generated').getPublicUrl(fileName);

        console.log(`Image ${i + 1} uploaded: ${publicUrl}`);

        return {
          prompt: variant.prompt,
          caption: variant.caption,
          image_url: publicUrl,
        };
      });

      // Wait for all images to complete
      const variants = await Promise.all(imageGenerationPromises);
      console.log('All 3 images generated successfully!');

      // 5. Update generation to succeeded with final images
      const result = {
        variants,
        safety_flags: [],
      };

      const { error: successError } = await supabase
        .from('generations')
        .update({
          status: 'succeeded',
          result,
          finished_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (successError) {
        throw new Error(`Failed to mark as succeeded: ${successError.message}`);
      }

      console.log(`✅ Generation ${job.id} succeeded`);

      return new Response(
        JSON.stringify({
          message: 'Generation completed',
          genId: job.id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (processingError) {
      // Mark job as failed
      console.error(`❌ Generation ${job.id} failed:`, processingError);

      await supabase
        .from('generations')
        .update({
          status: 'failed',
          error: processingError.message,
          finished_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // TODO: Optionally refund credit via RPC

      return new Response(
        JSON.stringify({
          error: 'Generation failed',
          details: processingError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Worker error:', error);
    return new Response(
      JSON.stringify({
        error: 'Worker error',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
