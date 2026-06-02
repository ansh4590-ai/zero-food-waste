-- =============================================================================
-- Zero Food Waste: Lifecycle Guards & KYC Enhancements
-- =============================================================================

-- Add submitted_at for wait-time calculation in KYC queue
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ;

-- Backfill: set kyc_submitted_at = created_at where it's null and verification_status exists
UPDATE public.profiles
SET kyc_submitted_at = created_at
WHERE kyc_submitted_at IS NULL
  AND verification_status IN ('pending', 'approved', 'rejected');

-- ─── HELPER: seconds since KYC was submitted ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.kyc_wait_seconds(p_submitted_at TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT EXTRACT(EPOCH FROM (NOW() - COALESCE(p_submitted_at, NOW())))::INTEGER;
$$;

GRANT EXECUTE ON FUNCTION public.kyc_wait_seconds(TIMESTAMPTZ) TO authenticated;

-- ─── ENSURE volunteer_tasks has completed_at (idempotent) ────────────────────
ALTER TABLE public.volunteer_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
