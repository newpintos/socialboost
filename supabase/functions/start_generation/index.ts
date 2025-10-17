import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

interface StartGenerationRequest {
  productDescription: string;
  referenceImageUrl?: string;
  selectedStyle?: string;
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // 1. Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create client with user's token to verify auth
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse and validate request body
    const body: StartGenerationRequest = await req.json();

    if (!body.productDescription || body.productDescription.trim().length < 10) {
      return new Response(
        JSON.stringify({
          error: 'Product description must be at least 10 characters',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (body.productDescription.length > 2000) {
      return new Response(
        JSON.stringify({
          error: 'Product description must be less than 2000 characters',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Use service role to call RPC
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

    const { data: genId, error: rpcError } = await supabaseAdmin.rpc('start_generation_tx', {
      p_uid: user.id,
      p_product_description: body.productDescription.trim(),
      p_reference_image_url: body.referenceImageUrl || null,
      p_selected_style: body.selectedStyle || null,
      p_daily_limit: 100,
    });

    if (rpcError) {
      console.error('RPC error:', rpcError);

      // Handle specific error cases
      if (rpcError.message.includes('Insufficient credits')) {
        return new Response(
          JSON.stringify({
            error: 'Insufficient credits',
            details: 'You need at least 1 credit to start a generation',
          }),
          {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (rpcError.message.includes('Daily generation limit exceeded')) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded',
            details: 'You have reached your daily generation limit',
          }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (rpcError.message.includes('blocked term')) {
        return new Response(
          JSON.stringify({
            error: 'Content blocked',
            details: 'Your description contains prohibited content',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'Failed to start generation',
          details: rpcError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 4. Invoke worker function immediately (don't wait for webhook)
    console.log(`Invoking worker for generation ${genId}`);

    // Fire and forget - invoke worker asynchronously
    fetch(`${supabaseUrl}/functions/v1/worker_process_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceRole}`,
      },
      body: JSON.stringify({ generationId: genId }),
    }).catch((err) => {
      console.error('Failed to invoke worker:', err);
      // Don't block the response if worker invocation fails
    });

    // 5. Return generation ID immediately
    return new Response(JSON.stringify({ genId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
