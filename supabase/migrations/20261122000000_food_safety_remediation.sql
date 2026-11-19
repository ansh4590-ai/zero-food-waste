-- =============================================================================
-- Migration: 20261122000000_food_safety_remediation.sql
-- Description: Revoke donor UPDATE privileges on AI food-safety estimates
--              (estimated_safe_hours, spoilage_risk, freshness_score, etc.)
--              to prevent manipulation of safety metrics.
-- =============================================================================

BEGIN;

-- ─── 1. REVOKE UPDATE PRIVILEGES ON FOOD SAFETY FIELDS ────────────────────────
-- Donors and authenticated users must NEVER be able to alter food safety estimates
-- (estimated_safe_hours, spoilage_risk, freshness_score, quality_status, priority_score).
REVOKE UPDATE ON TABLE public.food_listings FROM PUBLIC, anon, authenticated;

-- Grant column-level UPDATE only on non-safety, user-editable listing metadata
GRANT UPDATE (
  title,
  quantity_description,
  food_category,
  location_name,
  image_url,
  pickup_window,
  pickup_window_start,
  pickup_window_end,
  expiry_time,
  updated_at
) ON TABLE public.food_listings TO authenticated;

-- Ensure service_role retains administrative maintenance capabilities
GRANT ALL PRIVILEGES ON TABLE public.food_listings TO service_role;

-- ─── 2. REFRESH PUBLIC BROWSE VIEW ───────────────────────────────────────────
-- Public browse view exposes safe listing attributes and advisory estimates.
-- These estimates are clearly documented as non-authoritative advisory metrics.
CREATE OR REPLACE VIEW public.food_listings_public AS
SELECT
  id,
  title,
  food_category,
  quantity_description,
  NULL::text AS location_name,
  freshness_score,
  quality_status,
  spoilage_risk,
  estimated_safe_hours,
  pickup_window,
  pickup_window_start,
  pickup_window_end,
  expiry_time,
  image_url,
  status,
  created_at,
  updated_at
FROM public.food_listings
WHERE status = 'active'::public.listing_status;

COMMENT ON VIEW public.food_listings_public IS
  'Public listing view. freshness_score, quality_status, spoilage_risk, and estimated_safe_hours are advisory estimates, not verified safety certifications.';

REVOKE ALL ON TABLE public.food_listings_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.food_listings_public TO anon, authenticated;

COMMIT;
