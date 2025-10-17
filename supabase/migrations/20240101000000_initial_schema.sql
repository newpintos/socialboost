-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for generation status
CREATE TYPE generation_status AS ENUM ('queued', 'processing', 'succeeded', 'failed');

-- ============================================================================
-- TABLES
-- ============================================================================

-- Profiles table
CREATE TABLE profiles (
  uid UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  credits INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_plan ON profiles(plan);

-- Generations table
CREATE TABLE generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_description TEXT NOT NULL,
  reference_image_url TEXT,
  status generation_status NOT NULL DEFAULT 'queued',
  result JSONB,
  error TEXT,
  cost_credits INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX idx_generations_uid ON generations(uid);
CREATE INDEX idx_generations_status ON generations(status);
CREATE INDEX idx_generations_created_at ON generations(created_at DESC);
CREATE INDEX idx_generations_queued ON generations(status, created_at) WHERE status = 'queued';

-- Payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid UUID NOT NULL REFERENCES auth.users(id),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
  provider_event_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX idx_payments_uid ON payments(uid);
CREATE INDEX idx_payments_provider_event ON payments(provider, provider_event_id);

-- Daily usage table for rate limiting
CREATE TABLE daily_usage (
  uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE,
  generations_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(uid, day)
);

CREATE INDEX idx_daily_usage_day ON daily_usage(day);

-- Blocklist table for content moderation
CREATE TABLE blocklist (
  term TEXT PRIMARY KEY
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to profiles
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Apply updated_at trigger to generations
CREATE TRIGGER trigger_generations_updated_at
  BEFORE UPDATE ON generations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- RPC FUNCTIONS (SECURITY DEFINER)
-- ============================================================================

-- RPC: Start generation transaction
-- Atomically checks blocklist, rate limits, deducts credits, and creates generation
CREATE OR REPLACE FUNCTION start_generation_tx(
  p_uid UUID,
  p_product_description TEXT,
  p_reference_image_url TEXT DEFAULT NULL,
  p_daily_limit INTEGER DEFAULT 100
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gen_id UUID;
  v_today DATE;
  v_current_count INTEGER;
  v_blocked_term TEXT;
  v_profile_exists BOOLEAN;
BEGIN
  -- 1. Check if profile exists
  SELECT EXISTS(SELECT 1 FROM profiles WHERE uid = p_uid) INTO v_profile_exists;
  IF NOT v_profile_exists THEN
    RAISE EXCEPTION 'Profile not found for user';
  END IF;

  -- 2. Blocklist check (case-insensitive)
  SELECT term INTO v_blocked_term
  FROM blocklist
  WHERE LOWER(p_product_description) LIKE '%' || LOWER(term) || '%'
  LIMIT 1;

  IF v_blocked_term IS NOT NULL THEN
    RAISE EXCEPTION 'Content contains blocked term: %', v_blocked_term;
  END IF;

  -- 3. Rate limit check
  v_today := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;

  INSERT INTO daily_usage (uid, day, generations_count)
  VALUES (p_uid, v_today, 0)
  ON CONFLICT (uid, day) DO NOTHING;

  SELECT generations_count INTO v_current_count
  FROM daily_usage
  WHERE uid = p_uid AND day = v_today
  FOR UPDATE;

  IF v_current_count >= p_daily_limit THEN
    RAISE EXCEPTION 'Daily generation limit exceeded (% per day)', p_daily_limit;
  END IF;

  -- 4. Deduct credit
  UPDATE profiles
  SET credits = credits - 1
  WHERE uid = p_uid AND credits >= 1
  RETURNING uid INTO p_uid;

  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  -- 5. Increment daily usage
  UPDATE daily_usage
  SET generations_count = generations_count + 1
  WHERE uid = p_uid AND day = v_today;

  -- 6. Create generation
  INSERT INTO generations (uid, product_description, reference_image_url, status, cost_credits)
  VALUES (p_uid, p_product_description, p_reference_image_url, 'queued', 1)
  RETURNING id INTO v_gen_id;

  RETURN v_gen_id;
END;
$$;

-- RPC: Upgrade user plan
-- Idempotently upgrades user to pro and adds credits
CREATE OR REPLACE FUNCTION upgrade_user_plan(
  p_uid UUID,
  p_add_credits INTEGER DEFAULT 500
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET
    plan = 'pro',
    credits = credits + p_add_credits
  WHERE uid = p_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user: %', p_uid;
  END IF;
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocklist ENABLE ROW LEVEL SECURITY;

-- Profiles policies: users can SELECT their own, no client writes
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = uid);

-- Generations policies: users can SELECT their own, no client writes
CREATE POLICY "Users can view own generations"
  ON generations FOR SELECT
  USING (auth.uid() = uid);

-- Payments policies: users can SELECT their own, no client writes
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = uid);

-- Daily usage policies: no client access (service role only)
CREATE POLICY "No client access to daily_usage"
  ON daily_usage FOR ALL
  USING (false)
  WITH CHECK (false);

-- Blocklist policies: no client access (service role only)
CREATE POLICY "No client access to blocklist"
  ON blocklist FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================================
-- SAMPLE DATA (optional, for testing)
-- ============================================================================

-- Insert some common blocked terms
INSERT INTO blocklist (term) VALUES
  ('violence'),
  ('explicit'),
  ('illegal')
ON CONFLICT DO NOTHING;

-- Grant execute permissions on RPCs to authenticated users
GRANT EXECUTE ON FUNCTION start_generation_tx TO authenticated;
GRANT EXECUTE ON FUNCTION upgrade_user_plan TO authenticated;

-- Comment on tables
COMMENT ON TABLE profiles IS 'User profiles with plan and credits';
COMMENT ON TABLE generations IS 'AI generation jobs with lifecycle tracking';
COMMENT ON TABLE payments IS 'Payment records with idempotency';
COMMENT ON TABLE daily_usage IS 'Rate limiting tracker per user per day';
COMMENT ON TABLE blocklist IS 'Content moderation blocklist';
