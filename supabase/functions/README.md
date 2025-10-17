# Supabase Edge Functions

This directory contains the Edge Functions for SocialBoost AI, written in Deno/TypeScript.

## Functions Overview

### 1. `start_generation`

**Purpose**: Initiate a new generation job

**Trigger**: HTTP POST from frontend
**Auth**: User JWT (Bearer token)
**Input**:
```json
{
  "productDescription": "string (10-2000 chars)",
  "referenceImageUrl": "string (optional)"
}
```

**Flow**:
1. Verify user authentication
2. Validate request body
3. Call `start_generation_tx` RPC with service role
4. Return generation ID

**Error Handling**:
- 401: Invalid/missing token
- 400: Invalid input or blocked content
- 402: Insufficient credits
- 429: Rate limit exceeded

### 2. `worker_process_generation`

**Purpose**: Process queued generation jobs

**Trigger**:
- HTTP GET/POST (manual)
- Scheduled cron (production)

**Auth**: None required (but should be secured in production)

**Flow**:
1. Claim one job atomically using `FOR UPDATE SKIP LOCKED`
2. Call AI adapter to get 3 variants (prompt + caption)
3. Generate images for each variant
4. Upload images to Storage bucket `generated`
5. Update generation status to `succeeded` with result
6. On error: mark as `failed` with error message

**Concurrency**: Safe to run multiple instances (atomic job claiming)

### 3. `payments_webhook`

**Purpose**: Handle payment provider webhooks

**Trigger**: HTTP POST from Stripe/Razorpay
**Auth**: None (validates event structure)

**Supported Providers**:
- **Stripe**: Detects `payment_intent.succeeded` events
- **Razorpay**: Detects `payment.captured` events

**Flow**:
1. Parse webhook payload (auto-detect provider)
2. Extract: `provider_event_id`, `uid`, `amount`, `status`
3. Insert payment record (idempotent via unique constraint)
4. If succeeded: call `upgrade_user_plan` RPC (+500 credits)
5. Return 200 (always, for idempotency)

**Idempotency**: Duplicate event IDs are ignored (unique constraint)

## AI Adapters

Located in `_shared/ai.ts`, implements:

```typescript
interface AIAdapter {
  getVariants(description: string, referenceUrl?: string): Promise<AIVariantResponse>;
  getImageBytes(prompt: string): Promise<Uint8Array>;
}
```

### NanoBanana Adapter (Default)

- **Provider**: NanoBanana API
- **Env Vars**: `NANO_BANANA_API_URL`, `NANO_BANANA_API_KEY`
- **Fallback**: Mock mode if keys missing

### Gemini Adapter (Alternative)

- **Provider**: Gemini 2.x Flash
- **Env Vars**: `GEMINI_API_KEY`
- **Fallback**: Mock mode if key missing
- **Note**: Image generation not yet implemented via Gemini (uses mock)

### Mock Mode

When API keys are missing, both adapters return:
- 3 variants with descriptive prompts/captions
- 1x1 transparent PNG placeholder images

## Environment Variables

Create `supabase/functions/.env`:

```bash
# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...

# AI Provider
AI_PROVIDER=nanobanana  # or 'gemini'

# NanoBanana (optional)
NANO_BANANA_API_URL=https://api.nanobanana.ai
NANO_BANANA_API_KEY=...

# Gemini (optional)
GEMINI_API_KEY=...

# Payments (optional)
STRIPE_SECRET=sk_test_...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

## Local Development

### Serve All Functions

```bash
# Terminal 1
supabase functions serve start_generation --env-file supabase/functions/.env --no-verify-jwt

# Terminal 2
supabase functions serve worker_process_generation --env-file supabase/functions/.env --no-verify-jwt

# Terminal 3
supabase functions serve payments_webhook --env-file supabase/functions/.env --no-verify-jwt
```

### Test Functions

```bash
# Start generation (requires valid JWT)
curl -X POST http://localhost:54321/functions/v1/start_generation \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"productDescription": "A beautiful handcrafted ceramic mug"}'

# Process worker (no auth)
curl http://localhost:54321/functions/v1/worker_process_generation

# Test webhook (no auth)
curl -X POST http://localhost:54321/functions/v1/payments_webhook \
  -H "Content-Type: application/json" \
  -d '{"id": "evt_test", "type": "payment_intent.succeeded", ...}'
```

## Deployment

```bash
# Deploy individual function
supabase functions deploy start_generation

# Deploy all functions
supabase functions deploy

# Set secrets
supabase secrets set AI_PROVIDER=nanobanana
supabase secrets set NANO_BANANA_API_KEY=...
```

## Security

- **start_generation**: Validates JWT, uses service role for RPC
- **worker_process_generation**: Should be secured in production (API key or internal-only)
- **payments_webhook**: Validates event structure (add signature verification in production)

## Monitoring

Check logs:

```bash
# Local
supabase functions logs start_generation

# Production
supabase functions logs start_generation --project-ref YOUR_PROJECT
```

## Common Issues

### "RPC error: Insufficient credits"
- User has 0 credits; direct them to billing page

### "No work available"
- No queued jobs; this is normal when idle

### Worker stuck/not processing
- Check logs for errors
- Verify AI adapter is working (check API keys)
- Ensure Storage bucket `generated` exists and is public

### Webhook not upgrading plan
- Verify `uid` in metadata/notes
- Check RPC logs: `SELECT * FROM payments;`
- Ensure webhook payload format matches parser

## Architecture Notes

- **Atomic Job Claiming**: Uses `FOR UPDATE SKIP LOCKED` for safe concurrency
- **Idempotent Webhooks**: Unique constraint on `(provider, provider_event_id)`
- **Graceful Degradation**: Mock adapters allow full local testing without external APIs
