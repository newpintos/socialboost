import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

interface PaymentData {
  provider: 'stripe' | 'razorpay';
  provider_event_id: string;
  uid: string;
  amount_cents: number;
  currency: string;
  succeeded: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body = await req.json();

    // Detect provider and parse webhook data
    const paymentData = parseWebhook(req, body);

    if (!paymentData) {
      return new Response(JSON.stringify({ error: 'Invalid webhook payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Received ${paymentData.provider} webhook:`, paymentData.provider_event_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRole);

    // 1. Insert payment record (idempotent via unique constraint)
    const { error: insertError } = await supabase.from('payments').insert({
      uid: paymentData.uid,
      provider: paymentData.provider,
      provider_event_id: paymentData.provider_event_id,
      amount_cents: paymentData.amount_cents,
      currency: paymentData.currency,
      status: paymentData.succeeded ? 'succeeded' : 'pending',
    });

    // Ignore duplicate key errors (idempotency)
    if (insertError && !insertError.message.includes('duplicate key')) {
      console.error('Failed to insert payment:', insertError);
      return new Response(
        JSON.stringify({
          error: 'Failed to record payment',
          details: insertError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. If payment succeeded, upgrade user plan
    if (paymentData.succeeded) {
      const { error: upgradeError } = await supabase.rpc('upgrade_user_plan', {
        p_uid: paymentData.uid,
        p_add_credits: 500,
      });

      if (upgradeError) {
        console.error('Failed to upgrade user:', upgradeError);
        // Don't return error - payment was recorded successfully
      } else {
        console.log(`✅ User ${paymentData.uid} upgraded to Pro (+500 credits)`);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({
        error: 'Webhook processing failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function parseWebhook(req: Request, body: any): PaymentData | null {
  // Check for provider header
  const providerHeader = req.headers.get('X-Provider')?.toLowerCase();

  // Try Stripe format
  if (providerHeader === 'stripe' || body.type?.startsWith('payment_intent')) {
    return parseStripeWebhook(body);
  }

  // Try Razorpay format
  if (providerHeader === 'razorpay' || body.event?.startsWith('payment')) {
    return parseRazorpayWebhook(body);
  }

  // Auto-detect by structure
  if (body.type && body.data?.object) {
    return parseStripeWebhook(body);
  }

  if (body.event && body.payload?.payment) {
    return parseRazorpayWebhook(body);
  }

  return null;
}

function parseStripeWebhook(body: any): PaymentData | null {
  try {
    const succeeded = body.type === 'payment_intent.succeeded';
    const obj = body.data?.object;

    if (!obj) return null;

    const uid = obj.metadata?.uid;
    if (!uid) {
      console.warn('Stripe webhook missing uid in metadata');
      return null;
    }

    return {
      provider: 'stripe',
      provider_event_id: body.id,
      uid,
      amount_cents: obj.amount || 0,
      currency: obj.currency?.toUpperCase() || 'USD',
      succeeded,
    };
  } catch (error) {
    console.error('Failed to parse Stripe webhook:', error);
    return null;
  }
}

function parseRazorpayWebhook(body: any): PaymentData | null {
  try {
    const payment = body.payload?.payment?.entity;
    if (!payment) return null;

    const uid = payment.notes?.uid;
    if (!uid) {
      console.warn('Razorpay webhook missing uid in notes');
      return null;
    }

    return {
      provider: 'razorpay',
      provider_event_id: payment.id,
      uid,
      amount_cents: payment.amount,
      currency: payment.currency?.toUpperCase() || 'INR',
      succeeded: payment.captured === true,
    };
  } catch (error) {
    console.error('Failed to parse Razorpay webhook:', error);
    return null;
  }
}
