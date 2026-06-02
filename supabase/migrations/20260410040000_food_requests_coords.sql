-- Add latitude and longitude to food_requests to support accurate logistics dropoff routing
ALTER TABLE public.food_requests
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Ensure profiles has location fields for volunteer GPS tracking if missing
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;
