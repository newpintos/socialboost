# SocialBoost AI

> Production-ready SaaS boilerplate for AI-powered social media content generation

## What is SocialBoost AI?

**SocialBoost AI** is a credit-based creative studio for social media. Upload a product image and description, and get three image+caption variants optimized for different styles (Studio Clean, Lifestyle Context, UGC Handheld). Start free with 50 credits. Upgrade to Pro for +500 credits. Backed by NanoBanana's API with Gemini 2.x Flash as an alternative adapter - swap providers with a single environment flag.

## Features

✨ **Google OAuth** - Seamless authentication via Supabase Auth
🎨 **3 Variants Per Generation** - Studio, Lifestyle, and UGC styles
🔐 **Row-Level Security** - Client can only read, service role handles writes
💳 **Multi-Payment Support** - Stripe & Razorpay webhooks (idempotent)
🤖 **Pluggable AI** - NanoBanana (default) or Gemini 2.x Flash
⚡ **Realtime Updates** - Live generation status via Supabase Realtime
🚦 **Rate Limiting** - Daily generation limits per user (100/day default)
📦 **Monorepo** - PNPM workspaces with shared types

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (Auth, Postgres, Storage, Edge Functions)
- **AI**: NanoBanana API / Gemini 2.x Flash (configurable)
- **Payments**: Stripe + Razorpay webhooks
- **Tooling**: PNPM, ESLint, Prettier

## Project Structure

```
socialboost-saas/
├── apps/
│   └── web/                    # Next.js 14 frontend
│       ├── app/                # App Router pages
│       ├── components/         # Reusable UI components
│       └── lib/                # Supabase clients & utilities
├── packages/
│   └── shared/                 # Shared types & Zod schemas
├── supabase/
│   ├── migrations/             # Database schema with RLS
│   └── functions/              # Edge Functions (Deno)
│       ├── start_generation/
│       ├── worker_process_generation/
│       ├── payments_webhook/
│       └── _shared/            # AI adapters
└── Root configs               # PNPM, ESLint, Prettier
```

## Prerequisites

- Node.js 18+ and PNPM 8+
- Supabase CLI (`npm i -g supabase`)
- Docker Desktop (for local Supabase)

## Installation

### 1. Clone and Install Dependencies

```bash
# Install PNPM globally if needed
npm i -g pnpm

# Install all workspace dependencies
pnpm install
```

### 2. Start Supabase Locally

```bash
# Start local Supabase stack
supabase start

# Create the public storage bucket
supabase storage create-bucket generated --public

# Apply database migration
supabase db reset
```

**Note the outputs**: You'll need `API URL`, `anon key`, and `service_role key`.

### 3. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI:
   ```
   http://localhost:54321/auth/v1/callback
   ```
4. In Supabase Studio (http://localhost:54323):
   - Go to **Authentication > Providers**
   - Enable **Google**
   - Add your Client ID and Client Secret

### 4. Set Environment Variables

#### Frontend (`apps/web/.env.local`)

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-from-supabase-start
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_STORAGE_PUBLIC_BUCKET=generated
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-from-supabase-start
```

#### Edge Functions (`supabase/functions/.env`)

```bash
cp supabase/functions/.env.example supabase/functions/.env
```

Edit `supabase/functions/.env`:

```env
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# AI Provider (nanobanana or gemini)
AI_PROVIDER=nanobanana

# NanoBanana API (optional - uses mock if missing)
NANO_BANANA_API_URL=https://api.nanobanana.ai
NANO_BANANA_API_KEY=your-nanobanana-key

# Gemini API (optional - uses mock if missing)
GEMINI_API_KEY=your-gemini-api-key

# Payment providers (optional for local dev)
STRIPE_SECRET=sk_test_...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

**Note**: If AI API keys are missing, the app will use **mock adapters** that return placeholder images and captions, so you can still test the full flow locally.

## Running Locally

Open **4 terminal windows**:

### Terminal 1: Frontend

```bash
pnpm -C apps/web dev
# Visit http://localhost:3000
```

### Terminal 2: start_generation Function

```bash
supabase functions serve start_generation --env-file supabase/functions/.env --no-verify-jwt
```

### Terminal 3: worker_process_generation Function

```bash
supabase functions serve worker_process_generation --env-file supabase/functions/.env --no-verify-jwt
```

### Terminal 4: payments_webhook Function

```bash
supabase functions serve payments_webhook --env-file supabase/functions/.env --no-verify-jwt
```

## Usage

### 1. Sign In

1. Go to http://localhost:3000
2. Click **Sign in with Google**
3. Authorize the app
4. You'll be redirected to the Dashboard with **50 free credits**

### 2. Create a Generation

1. Navigate to **Generate**
2. Choose a style preset (Studio / Lifestyle / UGC)
3. Enter a product description (10-2000 characters)
4. Optionally upload a reference image
5. Click **Generate (1 credit)**
6. You'll be redirected to the Results page

### 3. View Results

- The Results page shows live status updates via Realtime
- Status flow: `queued` → `processing` → `succeeded`/`failed`
- When succeeded, see 3 variant cards with:
  - Generated image
  - AI-generated caption
  - Copy and Download buttons

### 4. Trigger Worker Manually (if not scheduled)

```bash
curl http://localhost:54321/functions/v1/worker_process_generation
```

Repeat until you see "No work available" (all jobs processed).

## Scheduling Worker

In production, schedule `worker_process_generation` to run every minute:

1. Go to Supabase Dashboard → **Database > Functions**
2. Create a cron job via `pg_cron`:

```sql
SELECT cron.schedule(
  'process-generations',
  '* * * * *',  -- Every minute
  $$
  SELECT
    net.http_post(
      url := 'YOUR_PROJECT_URL/functions/v1/worker_process_generation',
      headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

Or invoke via GitHub Actions, Cloud Scheduler, etc.

## Testing Webhooks

### Stripe Webhook

```bash
curl -X POST http://localhost:54321/functions/v1/payments_webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_test_123",
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "metadata": {
          "uid": "YOUR_USER_UUID"
        },
        "amount": 4900,
        "currency": "usd"
      }
    }
  }'
```

### Razorpay Webhook

```bash
curl -X POST http://localhost:54321/functions/v1/payments_webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "payment.captured",
    "payload": {
      "payment": {
        "entity": {
          "id": "pay_test_456",
          "amount": 399900,
          "currency": "INR",
          "captured": true,
          "notes": {
            "uid": "YOUR_USER_UUID"
          }
        }
      }
    }
  }'
```

**Result**: User's plan becomes `pro` and credits increase by 500. Re-sending same event ID → no double-credit (idempotent).

## Acceptance Tests

### ✅ Google Login & Profile Creation

- Sign in → Dashboard shows `plan=free`, `credits=50`

### ✅ Generation Flow

- Submit generation → Credits decrement by 1
- Row status: `queued` → `processing` → `succeeded`
- Results page shows 3 variant cards

### ✅ Payment Webhook

- Send test webhook → Plan upgrades to `pro`, credits += 500
- Re-send same event → No change (idempotent)

### ✅ Row-Level Security

Try in Supabase SQL Editor (as client):

```sql
-- ❌ Fails (RLS blocks client writes)
UPDATE profiles SET credits = 9999 WHERE uid = auth.uid();

-- ❌ Fails
INSERT INTO generations (...) VALUES (...);

-- ✅ Succeeds (read own data)
SELECT * FROM profiles WHERE uid = auth.uid();
SELECT * FROM generations WHERE uid = auth.uid();
```

### ✅ Rate Limiting

- Submit 101 generations in one day → 101st fails with "Daily limit exceeded"

### ✅ Blocklist

- Add term to `blocklist` table: `INSERT INTO blocklist VALUES ('badword');`
- Try generation with "badword" → Fails with "Content blocked"

## Production Deployment

### 1. Deploy to Vercel (Frontend)

```bash
cd apps/web
vercel --prod
```

Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 2. Deploy Supabase Project

```bash
# Link to production project
supabase link --project-ref YOUR_PROJECT_REF

# Push migration
supabase db push

# Deploy Edge Functions
supabase functions deploy start_generation
supabase functions deploy worker_process_generation
supabase functions deploy payments_webhook

# Set Edge Function secrets
supabase secrets set AI_PROVIDER=nanobanana
supabase secrets set NANO_BANANA_API_URL=...
supabase secrets set NANO_BANANA_API_KEY=...
supabase secrets set STRIPE_SECRET=...
supabase secrets set RAZORPAY_KEY_ID=...
```

### 3. Configure OAuth Redirect

Update Google OAuth redirect URI:
```
https://YOUR_PROJECT.supabase.co/auth/v1/callback
```

### 4. Configure Webhooks

- **Stripe**: Add webhook endpoint `https://YOUR_PROJECT.supabase.co/functions/v1/payments_webhook` with events: `payment_intent.succeeded`
- **Razorpay**: Add webhook URL with event: `payment.captured`

### 5. Schedule Worker

Set up cron job (see "Scheduling Worker" section above) or use external scheduler.

## Architecture Decisions

### Why Service Role Only for Mutations?

- **Security**: Client can't forge credits or bypass rate limits
- **Atomicity**: RPCs handle complex transactions (credit deduction + job creation)
- **Auditability**: All writes go through Edge Functions

### Why Mock AI Adapters?

- **Local Development**: Full app functionality without external API keys
- **Testing**: Predictable outputs for CI/CD
- **Cost**: Free local testing before production

### Why PNPM Workspaces?

- **Type Safety**: Shared types between frontend/backend
- **Reusability**: Single source of truth for schemas
- **Fast Installs**: Efficient dependency management

## Troubleshooting

### "Invalid token" Error

- Ensure JWT is being passed correctly
- Check `NEXT_PUBLIC_SUPABASE_ANON_KEY` matches Supabase output

### Generations Stuck in "Queued"

- Manually trigger worker: `curl http://localhost:54321/functions/v1/worker_process_generation`
- Check worker logs for errors

### Images Not Showing

- Verify storage bucket `generated` is **public**:
  ```bash
  supabase storage create-bucket generated --public
  ```

### RLS Errors

- Ensure you're using **service role** client for admin operations
- Check policies with: `SELECT * FROM pg_policies;`

## Contributing

This is a boilerplate template. Fork and customize for your use case!

## License

MIT

---

Built with ❤️ using [Supabase](https://supabase.com) and [Next.js](https://nextjs.org)
