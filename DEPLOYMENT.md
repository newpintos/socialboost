# Deployment Guide

## Environment Variables

### Public Variables (NEXT_PUBLIC_*)
These variables are **intentionally public** and will be embedded in the client-side JavaScript bundle. This is by design in Next.js and is safe for:

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key (designed to be public)
- `NEXT_PUBLIC_APP_URL` - Your application URL
- `NEXT_PUBLIC_STORAGE_PUBLIC_BUCKET` - Public storage bucket name

**Why is this safe?**
- The `anon` key is designed to be public and only provides row-level security access
- Supabase protects your data with Row Level Security (RLS) policies
- All sensitive operations use the service role key (which is NOT public)

### Private Variables
These should NEVER be exposed to the client:

- `SUPABASE_SERVICE_ROLE_KEY` - Server-side only, full database access

## Netlify Deployment

### Step 1: Configure Environment Variables
In your Netlify dashboard (Site settings → Environment variables), add:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=https://your-site.netlify.app
NEXT_PUBLIC_STORAGE_PUBLIC_BUCKET=generations
```

### Step 2: Disable Secret Detection
Netlify may flag `NEXT_PUBLIC_*` variables as "exposed secrets". This is a false positive because these variables are meant to be public in Next.js applications.

To fix this:
1. Go to Site settings → Build & deploy → Build settings
2. Under "Sensitive variable policy", select "Permissive" or disable secret detection
3. Or acknowledge the warning and deploy anyway - it's safe!

### Step 3: Deploy
Push to GitHub and Netlify will automatically build and deploy.

## Supabase Deployment

Already configured! Your Supabase backend includes:
- Database migrations
- Edge Functions
- Row Level Security policies

Refer to the main README for Supabase setup instructions.
