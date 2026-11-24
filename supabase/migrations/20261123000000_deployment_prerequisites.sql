BEGIN;

-- The app stores pickup and drop-off separately from legacy location fields.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.food_listings
  ADD COLUMN IF NOT EXISTS pickup_lat double precision,
  ADD COLUMN IF NOT EXISTS pickup_lng double precision;
ALTER TABLE public.food_requests
  ADD COLUMN IF NOT EXISTS drop_lat double precision,
  ADD COLUMN IF NOT EXISTS drop_lng double precision;

-- Donation photos are displayed on public listings. Identity and proof
-- documents continue to use their dedicated private buckets.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('food_images', 'food_images', true, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Donors upload listing photos" ON storage.objects;
CREATE POLICY "Donors upload listing photos" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'food_images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.has_permission(auth.uid(), 'food.create')
);

-- One row per account. Concurrent calls serialize on its primary key.
CREATE TABLE public.ai_account_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  requests integer NOT NULL
);
ALTER TABLE public.ai_account_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_account_usage FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.consume_ai_quota(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  window_cutoff timestamptz := statement_timestamp() - interval '1 minute';
BEGIN
  INSERT INTO public.ai_account_usage AS usage (user_id, window_start, requests)
  VALUES (p_user_id, statement_timestamp(), 1)
  ON CONFLICT (user_id) DO UPDATE SET
    requests = CASE WHEN usage.window_start <= window_cutoff THEN 1 ELSE usage.requests + 1 END,
    window_start = CASE WHEN usage.window_start <= window_cutoff THEN EXCLUDED.window_start ELSE usage.window_start END
  WHERE usage.window_start <= window_cutoff OR usage.requests < 10;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid) TO service_role;

COMMIT;
