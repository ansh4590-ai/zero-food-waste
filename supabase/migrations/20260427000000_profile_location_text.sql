-- =============================================================================
-- Zero Food Waste: Add location_text to profiles for reverse geocoding
-- =============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS location_text TEXT;

COMMENT ON COLUMN public.profiles.location_text IS
  'Human-readable address obtained via reverse geocoding (Nominatim) from location_lat/location_lng';
