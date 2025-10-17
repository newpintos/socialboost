# SocialBoost AI - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                             │
│                                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Dashboard  │  │  Generate  │  │  Results   │  │   Billing  │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │
│         │                │                │               │       │
│         └────────────────┴────────────────┴───────────────┘       │
│                          │                                        │
│                  Next.js App Router                               │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            │ HTTP / WebSocket (Realtime)
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                      SUPABASE CLOUD                               │
│                                                                   │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │   Auth      │   │  Postgres   │   │   Storage   │           │
│  │  (Google    │   │   + RLS     │   │  (Images)   │           │
│  │   OAuth)    │   │             │   │             │           │
│  └─────────────┘   └─────────────┘   └─────────────┘           │
│         │                 │                  │                    │
│         │                 │                  │                    │
│  ┌──────▼─────────────────▼──────────────────▼─────────┐        │
│  │             Edge Functions (Deno)                    │        │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────┐ │        │
│  │  │ start_         │  │ worker_process │  │payments│ │        │
│  │  │ generation     │  │ _generation    │  │_webhook│ │        │
│  │  └────────────────┘  └────────────────┘  └────────┘ │        │
│  └──────────────────────────┬────────────────────────────┘       │
│                             │                                     │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
                              │ HTTP API Calls
                              │
        ┌─────────────────────┴──────────────────────┐
        │                                             │
        ▼                                             ▼
┌───────────────┐                           ┌──────────────────┐
│  NanoBanana   │                           │  Gemini 2.x      │
│     API       │                           │   Flash API      │
│  (Default)    │                           │  (Alternative)   │
└───────────────┘                           └──────────────────┘
        │                                             │
        └─────────────────┬───────────────────────────┘
                          │
                          ▼
                  3 Image Variants
                  + Captions
```

## Data Flow: Generation Lifecycle

```
┌────────────┐
│   User     │
│  Browser   │
└─────┬──────┘
      │
      │ 1. POST /generate
      │    { description, image? }
      │
      ▼
┌─────────────────────┐
│  Next.js Frontend   │
│  - Upload image     │
│  - Get JWT token    │
└─────┬───────────────┘
      │
      │ 2. POST /functions/v1/start_generation
      │    Authorization: Bearer <JWT>
      │
      ▼
┌──────────────────────────┐
│ start_generation Edge Fn │
│  - Verify JWT            │
│  - Validate input        │
│  - Call RPC with service │
│    role                  │
└─────┬────────────────────┘
      │
      │ 3. RPC: start_generation_tx()
      │    - Check blocklist
      │    - Check rate limits
      │    - Deduct 1 credit
      │    - Insert generation (queued)
      │
      ▼
┌─────────────────┐
│   Database      │
│  generations    │
│  status=queued  │
└─────┬───────────┘
      │
      │ 4. Worker polls (scheduled/manual)
      │    SELECT ... FOR UPDATE SKIP LOCKED
      │
      ▼
┌──────────────────────────────┐
│ worker_process_generation    │
│  - Claim job atomically      │
│  - Update to 'processing'    │
│  - Call AI adapter           │
│    * getVariants() → 3x      │
│    * getImageBytes() → 3x    │
│  - Upload to Storage         │
│  - Update to 'succeeded'     │
└─────┬────────────────────────┘
      │
      │ 5. Result with 3 variants
      │    { image_url, caption, prompt }
      │
      ▼
┌─────────────────┐
│   Database      │
│  generations    │
│  status=        │
│  succeeded      │
│  result=jsonb   │
└─────┬───────────┘
      │
      │ 6. Realtime subscription
      │    (WebSocket)
      │
      ▼
┌────────────┐
│   User     │
│  Browser   │
│  Results   │
│   Page     │
└────────────┘
```

## Database Schema

```
┌─────────────────────────────────────────────────┐
│                   profiles                      │
├─────────────────────────────────────────────────┤
│ uid (PK, FK to auth.users)                     │
│ email                                           │
│ plan (free | pro)                              │
│ credits (integer)                               │
│ created_at, updated_at                          │
│                                                 │
│ RLS: Users can SELECT own row only             │
│      No client writes allowed                   │
└─────────────────┬───────────────────────────────┘
                  │
                  │ 1:N
                  │
┌─────────────────▼───────────────────────────────┐
│                generations                      │
├─────────────────────────────────────────────────┤
│ id (PK)                                         │
│ uid (FK to profiles)                            │
│ product_description                             │
│ reference_image_url                             │
│ status (queued|processing|succeeded|failed)     │
│ result (jsonb: { variants[], safety_flags[] })  │
│ error                                           │
│ cost_credits (default 1)                        │
│ created_at, updated_at                          │
│ started_at, finished_at                         │
│                                                 │
│ RLS: Users can SELECT own rows only            │
│      No client writes allowed                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                  payments                       │
├─────────────────────────────────────────────────┤
│ id (PK)                                         │
│ uid (FK to profiles)                            │
│ provider (stripe | razorpay)                   │
│ provider_event_id                               │
│ amount_cents                                    │
│ currency                                        │
│ status                                          │
│ created_at                                      │
│                                                 │
│ UNIQUE(provider, provider_event_id)            │
│ RLS: Users can SELECT own rows only            │
│      No client writes allowed                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                daily_usage                      │
├─────────────────────────────────────────────────┤
│ uid (PK, FK to profiles)                       │
│ day (PK)                                        │
│ generations_count                               │
│                                                 │
│ RLS: No client access (service role only)      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                 blocklist                       │
├─────────────────────────────────────────────────┤
│ term (PK)                                       │
│                                                 │
│ RLS: No client access (service role only)      │
└─────────────────────────────────────────────────┘
```

## Security Model

```
┌────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                        │
│  (Browser with JWT from Supabase Auth)                 │
│                                                         │
│  Permissions:                                           │
│  ✓ SELECT profiles WHERE uid = auth.uid()             │
│  ✓ SELECT generations WHERE uid = auth.uid()          │
│  ✓ SELECT payments WHERE uid = auth.uid()             │
│  ✗ INSERT/UPDATE/DELETE (all blocked by RLS)          │
└────────────────────────┬───────────────────────────────┘
                         │
                         │ All writes must go through
                         │ Edge Functions
                         │
┌────────────────────────▼───────────────────────────────┐
│               EDGE FUNCTIONS LAYER                     │
│  (Service Role Key - bypasses RLS)                     │
│                                                         │
│  Capabilities:                                          │
│  ✓ Verify user JWT                                     │
│  ✓ Call SECURITY DEFINER RPCs                         │
│  ✓ Write to any table (as service role)               │
│  ✓ Upload to Storage                                   │
│                                                         │
│  Security:                                              │
│  - Input validation (Zod schemas)                      │
│  - Rate limiting via RPC                                │
│  - Blocklist enforcement via RPC                        │
│  - Idempotency (unique constraints)                    │
└────────────────────────┬───────────────────────────────┘
                         │
                         │
┌────────────────────────▼───────────────────────────────┐
│                  DATABASE LAYER                        │
│  (Postgres with RLS enabled)                           │
│                                                         │
│  Row-Level Security Policies:                          │
│  - profiles: SELECT WHERE uid = auth.uid()            │
│  - generations: SELECT WHERE uid = auth.uid()         │
│  - payments: SELECT WHERE uid = auth.uid()            │
│  - daily_usage: USING (false) - no client access      │
│  - blocklist: USING (false) - no client access        │
│                                                         │
│  SECURITY DEFINER RPCs:                                 │
│  - start_generation_tx(): Atomic credit deduction      │
│  - upgrade_user_plan(): Idempotent plan upgrade        │
└─────────────────────────────────────────────────────────┘
```

## AI Adapter Pattern

```
┌────────────────────────────────────────────────┐
│              AIAdapter Interface               │
├────────────────────────────────────────────────┤
│  getVariants(desc, ref?)                      │
│    → Promise<{ variants: [{               }] }>│
│                                                 │
│  getImageBytes(prompt)                         │
│    → Promise<Uint8Array>                       │
└───────┬────────────────────────────────────────┘
        │
        │ Implemented by
        │
        ├─────────────────┬──────────────────────┐
        │                 │                      │
        ▼                 ▼                      ▼
┌──────────────┐  ┌──────────────┐  ┌─────────────────┐
│ NanoBanana   │  │   Gemini     │  │  Mock Adapter   │
│   Adapter    │  │   Adapter    │  │  (Fallback)     │
├──────────────┤  ├──────────────┤  ├─────────────────┤
│ Real API     │  │ Real API     │  │ No API calls    │
│ calls        │  │ calls        │  │ Returns         │
│              │  │              │  │ placeholders    │
│ If API key   │  │ If API key   │  │                 │
│ missing:     │  │ missing:     │  │ Used when:      │
│ → Mock mode  │  │ → Mock mode  │  │ - No keys set   │
└──────────────┘  └──────────────┘  │ - Local dev     │
                                     │ - Testing       │
                                     └─────────────────┘
```

## Payment Flow

```
┌────────────────┐
│  User clicks   │
│  "Buy Pro"     │
└───────┬────────┘
        │
        ▼
┌────────────────────────┐
│ Stripe/Razorpay        │
│ Checkout Session       │
│                        │
│ metadata/notes:        │
│   uid = user.id        │
└───────┬────────────────┘
        │
        │ User completes payment
        │
        ▼
┌────────────────────────┐
│ Payment Provider       │
│ Webhook                │
│                        │
│ POST /payments_webhook │
│ {                      │
│   event_id,            │
│   uid,                 │
│   amount,              │
│   status               │
│ }                      │
└───────┬────────────────┘
        │
        ▼
┌────────────────────────────┐
│ payments_webhook Edge Fn   │
│                            │
│ 1. Parse webhook           │
│ 2. INSERT into payments    │
│    (idempotent via unique  │
│     constraint)            │
│ 3. If succeeded:           │
│    CALL upgrade_user_plan  │
│       (p_uid, 500)         │
└───────┬────────────────────┘
        │
        ▼
┌────────────────────────────┐
│ Database RPC               │
│ upgrade_user_plan()        │
│                            │
│ UPDATE profiles SET        │
│   plan = 'pro',            │
│   credits = credits + 500  │
│ WHERE uid = p_uid          │
└───────┬────────────────────┘
        │
        ▼
┌────────────────┐
│ User Dashboard │
│ Shows:         │
│ - Plan: Pro    │
│ - Credits: 550 │
│   (50 + 500)   │
└────────────────┘
```

## Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Auth**: Supabase Auth (Google OAuth)
- **State**: React hooks + Supabase Realtime

### Backend
- **Database**: Supabase Postgres
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage
- **Functions**: Supabase Edge Functions (Deno)
- **Security**: Row-Level Security (RLS)

### AI
- **Primary**: NanoBanana API
- **Alternative**: Gemini 2.x Flash
- **Fallback**: Mock adapters (for local dev)

### Payments
- **Providers**: Stripe + Razorpay
- **Integration**: Webhooks
- **Idempotency**: Unique constraints

### DevOps
- **Package Manager**: PNPM (workspaces)
- **Linting**: ESLint + Prettier
- **Type Safety**: TypeScript (strict mode)
- **Deployment**: Vercel (frontend) + Supabase (backend)

## Key Design Decisions

### 1. Service Role Only Mutations
**Why**: Prevent client from forging credits or bypassing rate limits
**How**: All writes through Edge Functions with service role key

### 2. Atomic Transactions via RPCs
**Why**: Ensure credit deduction and job creation happen together
**How**: SECURITY DEFINER RPCs with proper isolation

### 3. Idempotent Webhooks
**Why**: Prevent double-crediting on replay attacks
**How**: Unique constraint on (provider, provider_event_id)

### 4. Pluggable AI Adapters
**Why**: Easy to swap providers or add new ones
**How**: Interface-based design with env flag selection

### 5. Mock Adapters for Local Dev
**Why**: Full functionality without external API keys
**How**: Fallback to placeholder generation when keys missing

### 6. Realtime Updates
**Why**: Better UX for long-running generations
**How**: Supabase Realtime subscriptions on generations table

### 7. Rate Limiting in Database
**Why**: Prevent abuse, ensure fair usage
**How**: daily_usage table with atomic increment in RPC

### 8. Monorepo with Shared Types
**Why**: Type safety across frontend/backend
**How**: PNPM workspaces + shared package

## Scalability Considerations

- **Concurrent Workers**: Atomic job claiming with `FOR UPDATE SKIP LOCKED`
- **Database Indexing**: Indexes on status, uid, created_at
- **Storage CDN**: Supabase Storage with public bucket
- **Serverless Functions**: Auto-scaling Edge Functions
- **Connection Pooling**: Built-in Supabase pooling
- **Rate Limiting**: Per-user daily limits

## Security Checklist

- ✅ Row-Level Security on all tables
- ✅ Service role mutations only
- ✅ JWT validation in Edge Functions
- ✅ Input validation (Zod schemas)
- ✅ Content blocklist
- ✅ Rate limiting
- ✅ Idempotent payment processing
- ✅ No secrets in client code
- ✅ CORS headers configured
- ✅ Atomic transactions (RPCs)

---

**Architecture Pattern**: Jamstack + Serverless + RLS Security
**Development Time**: ~6 hours (with full testing)
**Production Ready**: Yes (with proper configuration)
