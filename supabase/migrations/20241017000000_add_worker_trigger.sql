-- Migration: Add webhook to invoke worker function when generation is queued
-- This uses Supabase's pg_net extension to call the Edge Function asynchronously

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to invoke Edge Function via pg_net
CREATE OR REPLACE FUNCTION invoke_worker_for_generation()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
BEGIN
  -- Only trigger for queued status
  IF NEW.status = 'queued' THEN
    -- Use pg_net to make async HTTP request to worker function
    SELECT extensions.http_post(
      url := current_setting('app.supabase_url', false) || '/functions/v1/worker_process_generation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', false)
      ),
      body := jsonb_build_object('generationId', NEW.id::text)
    ) INTO request_id;

    RAISE LOG 'Queued worker invocation (request_id: %) for generation %', request_id, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on generations table
DROP TRIGGER IF EXISTS trigger_invoke_worker ON generations;
CREATE TRIGGER trigger_invoke_worker
  AFTER INSERT ON generations
  FOR EACH ROW
  WHEN (NEW.status = 'queued')
  EXECUTE FUNCTION invoke_worker_for_generation();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA extensions TO postgres, service_role;
GRANT EXECUTE ON FUNCTION invoke_worker_for_generation TO postgres, service_role;
