# 🚀 Quick Start Guide

Get SocialBoost AI running locally in 5 minutes!

## Prerequisites

```bash
# Install required tools
npm i -g pnpm supabase

# Verify installations
pnpm --version    # Should be 8.0.0+
supabase --version # Should be 1.0.0+
docker --version   # Docker Desktop must be running
```

## Step 1: Install Dependencies (30 seconds)

```bash
pnpm install
```

## Step 2: Start Supabase (60 seconds)

```bash
# Start local Supabase (first time takes ~2 minutes)
supabase start

# Save the output! You'll need:
# - API URL (usually http://localhost:54321)
# - anon key
# - service_role key
```

## Step 3: Setup Database (10 seconds)

```bash
# Create storage bucket
supabase storage create-bucket generated --public

# Apply migrations
supabase db reset
```

## Step 4: Configure Environment Variables (60 seconds)

### Frontend (.env.local)

```bash
cd apps/web
cp .env.local.example .env.local
```

Edit `apps/web/.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb... (from supabase start)
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_STORAGE_PUBLIC_BUCKET=generated
SUPABASE_SERVICE_ROLE_KEY=eyJhb... (from supabase start)
```

### Backend (.env)

```bash
cd ../../supabase/functions
cp .env.example .env
```

Edit `supabase/functions/.env`:

```env
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=eyJhb... (same as above)
SUPABASE_ANON_KEY=eyJhb... (same as above)
AI_PROVIDER=nanobanana

# Leave API keys empty - will use mock mode
NANO_BANANA_API_URL=
NANO_BANANA_API_KEY=
```

## Step 5: Configure Google OAuth (2 minutes)

1. Open Supabase Studio: http://localhost:54323
2. Go to **Authentication → Providers**
3. Enable **Google**
4. For testing, you can:
   - **Option A**: Use your own Google OAuth credentials
   - **Option B**: Skip for now (you can test other features)

To get Google OAuth credentials:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 Client ID
3. Authorized redirect URI: `http://localhost:54321/auth/v1/callback`
4. Copy Client ID and Secret to Supabase

## Step 6: Run the App (4 terminals)

Open 4 terminal windows/tabs:

### Terminal 1: Frontend
```bash
cd apps/web
pnpm dev
```

### Terminal 2: Start Generation Function
```bash
supabase functions serve start_generation \
  --env-file supabase/functions/.env \
  --no-verify-jwt
```

### Terminal 3: Worker Function
```bash
supabase functions serve worker_process_generation \
  --env-file supabase/functions/.env \
  --no-verify-jwt
```

### Terminal 4: Payments Webhook
```bash
supabase functions serve payments_webhook \
  --env-file supabase/functions/.env \
  --no-verify-jwt
```

## Step 7: Test the App! 🎉

1. Open http://localhost:3000
2. Click **Sign in with Google** (or skip if OAuth not configured)
3. You should see Dashboard with **50 credits**

## Testing Without Google OAuth

If you skipped Google OAuth setup, you can still test with manual database entries:

```sql
-- In Supabase Studio SQL Editor (http://localhost:54323)

-- 1. Create a test user (get UUID from auth.users after any auth attempt)
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'test@example.com')
ON CONFLICT DO NOTHING;

-- 2. Create profile
INSERT INTO profiles (uid, email, plan, credits)
VALUES ('00000000-0000-0000-0000-000000000001', 'test@example.com', 'free', 50)
ON CONFLICT DO NOTHING;
```

## Testing Generation Flow

### Method 1: Via UI
1. Go to http://localhost:3000/generate
2. Enter product description: "A beautiful handcrafted ceramic mug with blue glaze"
3. Click **Generate (1 credit)**
4. Watch the generation process in realtime!

### Method 2: Via cURL (if not authenticated)

```bash
# Get your access token first (from browser DevTools → Application → Local Storage → access_token)

curl -X POST http://localhost:54321/functions/v1/start_generation \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productDescription": "A beautiful handcrafted ceramic mug with blue glaze"
  }'

# Get the genId from response, then trigger worker:
curl http://localhost:54321/functions/v1/worker_process_generation
```

## Testing Payment Webhook

```bash
# Get your user UUID from Supabase Studio (auth.users table)

curl -X POST http://localhost:54321/functions/v1/payments_webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_test_12345",
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "metadata": {
          "uid": "YOUR_USER_UUID_HERE"
        },
        "amount": 4900,
        "currency": "usd"
      }
    }
  }'

# Check in Supabase Studio:
# - profiles table: plan should be 'pro', credits should be +500
# - payments table: new row inserted
```

## Common Issues

### "Port already in use"
```bash
# Kill existing Supabase instance
supabase stop
supabase start
```

### "Database error"
```bash
# Reset database
supabase db reset
```

### "Function not found"
```bash
# Make sure all 3 functions are running (check 3 terminals)
```

### Images not showing
```bash
# Recreate storage bucket as public
supabase storage delete-bucket generated
supabase storage create-bucket generated --public
```

## What's Happening Behind the Scenes?

1. **Sign In** → Supabase Auth creates user → API route creates profile with 50 credits
2. **Generate** → Edge Function calls RPC → Deducts 1 credit → Creates job in `queued` status
3. **Worker** → Polls for jobs → Claims job → Calls AI (mock) → Uploads images → Updates to `succeeded`
4. **Results** → Realtime subscription shows live updates → Displays 3 variants
5. **Payment** → Webhook validates → Inserts payment → Calls RPC → Upgrades to Pro (+500 credits)

## Next Steps

- ✅ Read the full [README.md](README.md) for detailed documentation
- ✅ Check [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for complete feature list
- ✅ Review [supabase/functions/README.md](supabase/functions/README.md) for Edge Functions architecture
- ✅ Configure real AI providers (NanoBanana or Gemini) for production use
- ✅ Setup Stripe/Razorpay for real payments
- ✅ Deploy to production (Vercel + Supabase)

## Need Help?

- Check the main README for troubleshooting
- Review Supabase logs: `supabase functions logs <function-name>`
- Check browser console for frontend errors
- Verify all 4 services are running (frontend + 3 functions)

---

**Estimated Setup Time**: 5 minutes
**Mock Mode**: Fully functional without AI API keys
**Production Ready**: Yes, with proper configuration

🎉 Happy Building!
