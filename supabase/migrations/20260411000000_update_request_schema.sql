-- 20260411000000_update_request_schema.sql
DO $$ 
BEGIN
  -- Add Assigned to ENUM if utilizing postgres Type, otherwise relying on text.
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
    ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'assigned';
  END IF;
END $$;

-- Add Receiver Dropoff coordinates directly to food_requests to map receiver locations correctly natively 
ALTER TABLE public.food_requests ADD COLUMN IF NOT EXISTS latitude FLOAT8;
ALTER TABLE public.food_requests ADD COLUMN IF NOT EXISTS longitude FLOAT8;
