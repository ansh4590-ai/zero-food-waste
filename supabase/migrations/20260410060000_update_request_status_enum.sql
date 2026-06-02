DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
    ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'cancelled';
  END IF;
END $$;
