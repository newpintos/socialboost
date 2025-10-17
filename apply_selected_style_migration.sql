-- Add selected_style column to generations table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generations' AND column_name = 'selected_style'
    ) THEN
        ALTER TABLE generations ADD COLUMN selected_style TEXT;
    END IF;
END $$;

-- Update the start_generation_tx function to accept selected_style parameter
CREATE OR REPLACE FUNCTION start_generation_tx(
  p_uid UUID,
  p_product_description TEXT,
  p_reference_image_url TEXT DEFAULT NULL,
  p_selected_style TEXT DEFAULT NULL,
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
    RAISE EXCEPTION 'Product description contains blocked term: %', v_blocked_term;
  END IF;

  -- 3. Check daily generation limit
  v_today := CURRENT_DATE;
  SELECT COUNT(*)
  INTO v_current_count
  FROM generations
  WHERE uid = p_uid
    AND created_at::DATE = v_today;

  IF v_current_count >= p_daily_limit THEN
    RAISE EXCEPTION 'Daily generation limit exceeded (% per day)', p_daily_limit;
  END IF;

  -- 4. Deduct credit (atomic)
  UPDATE profiles
  SET credits = credits - 1
  WHERE uid = p_uid AND credits >= 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  -- 5. Create generation record
  INSERT INTO generations (
    uid,
    product_description,
    reference_image_url,
    selected_style,
    status,
    cost_credits
  )
  VALUES (
    p_uid,
    p_product_description,
    p_reference_image_url,
    p_selected_style,
    'queued',
    1
  )
  RETURNING id INTO v_gen_id;

  RETURN v_gen_id;
END;
$$;
