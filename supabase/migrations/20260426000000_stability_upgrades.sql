-- ============================================================================
-- ZERO FOOD WASTE — MASTER PRODUCTION SQL PACK (TAILORED & SAFE VERSION)
-- Safe for YOUR exact Supabase Schema
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: CLEAN OLD OBJECTS
-- ============================================================================

ALTER TABLE public.food_listings
DROP CONSTRAINT IF EXISTS future_expiry_check;

DROP INDEX IF EXISTS unique_active_request_per_listing;
DROP INDEX IF EXISTS idx_food_listings_status_expiry;
DROP INDEX IF EXISTS idx_food_requests_status_listing;
DROP INDEX IF EXISTS idx_volunteer_tasks_status_request;

DROP VIEW IF EXISTS public.admin_platform_metrics;

DROP TRIGGER IF EXISTS trg_validate_future_expiry ON public.food_listings;
DROP FUNCTION IF EXISTS public.validate_future_expiry();
DROP FUNCTION IF EXISTS public.auto_expire_listings();
DROP FUNCTION IF EXISTS public.cleanup_stale_requests();

-- Drop all possible signatures of claim_volunteer_task to prevent duplicates
DROP FUNCTION IF EXISTS public.claim_volunteer_task(UUID);
DROP FUNCTION IF EXISTS public.claim_volunteer_task(UUID, UUID);

-- (Notice we intentionally DO NOT drop the `create_food_request` trigger,
-- because your frontend relies on `.insert()` to preserve delivery coordinates!)

-- ============================================================================
-- SECTION 2: FUTURE EXPIRY PROTECTION
-- ============================================================================

ALTER TABLE public.food_listings
ADD CONSTRAINT future_expiry_check
CHECK (
  expiry_time IS NULL
  OR expiry_time > created_at
);

CREATE OR REPLACE FUNCTION public.validate_future_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expiry_time IS NOT NULL
     AND NEW.expiry_time <= NOW()
  THEN
    RAISE EXCEPTION 'expiry_time must be in the future';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_future_expiry
BEFORE INSERT OR UPDATE
ON public.food_listings
FOR EACH ROW
EXECUTE FUNCTION public.validate_future_expiry();

-- ============================================================================
-- SECTION 3: AUTO EXPIRE LISTINGS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_expire_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.food_listings
  SET status = 'expired'
  WHERE expiry_time <= NOW()
    AND status IN ('active', 'reserved');
END;
$$;

-- ============================================================================
-- SECTION 4: ONLY ONE ACTIVE REQUEST PER LISTING
-- Patched to use your specific enums safely (NOT IN 'cancelled', 'delivered')
-- ============================================================================

CREATE UNIQUE INDEX unique_active_request_per_listing
ON public.food_requests(listing_id)
WHERE status NOT IN ('cancelled', 'delivered');

-- ============================================================================
-- SECTION 5: VOLUNTEER CLAIM RPC
-- Signature explicitly patched to (UUID, UUID) to match Volunteer.tsx
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_volunteer_task(
    p_request_id  UUID,
    p_volunteer_id UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task      RECORD;
  v_request   RECORD;
  v_new_task_id UUID;
  v_listing   RECORD;
BEGIN
    -- 1. Lock the food_request row FIRST
    SELECT * INTO v_request
    FROM public.food_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'This food request no longer exists.');
    END IF;

    IF v_request.status != 'pending' THEN
        RETURN json_build_object('success', false, 'error', 'This request has already been assigned to another volunteer.');
    END IF;

    -- Guard: block claiming if the associated listing has expired
    SELECT * INTO v_listing
    FROM public.food_listings
    WHERE id = v_request.listing_id;
    
    IF v_listing.expiry_time <= NOW() THEN
        RETURN json_build_object('success', false, 'error', 'This food listing has expired and is no longer safe to claim.');
    END IF;

    -- 2. Try to find an existing volunteer_tasks row for this request
    SELECT * INTO v_task
    FROM public.volunteer_tasks
    WHERE request_id = p_request_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_task.status != 'open' THEN
            RETURN json_build_object('success', false, 'error', 'This task was already claimed by another volunteer.');
        END IF;

        UPDATE public.volunteer_tasks
        SET status       = 'assigned',
            volunteer_id = p_volunteer_id,
            updated_at   = NOW()
        WHERE id = v_task.id;
    ELSE
        INSERT INTO public.volunteer_tasks (request_id, volunteer_id, status, created_at, updated_at)
        VALUES (p_request_id, p_volunteer_id, 'assigned', NOW(), NOW())
        RETURNING id INTO v_new_task_id;
    END IF;

    -- 3. Advance the food_request to assigned
    UPDATE public.food_requests
    SET status     = 'assigned',
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_volunteer_task(UUID, UUID) TO authenticated;

-- ============================================================================
-- SECTION 6: CLEANUP STALE REQUESTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.food_requests
  SET status = 'cancelled', updated_at = NOW()
  WHERE status = 'pending'
    AND created_at <= NOW() - INTERVAL '20 minutes';
END;
$$;

-- ============================================================================
-- SECTION 7: PERFORMANCE INDEXES & ADMIN VIEW
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_food_listings_status_expiry ON public.food_listings(status, expiry_time);
CREATE INDEX IF NOT EXISTS idx_food_requests_status_listing ON public.food_requests(status, listing_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_status_request ON public.volunteer_tasks(status, request_id);

CREATE OR REPLACE VIEW public.admin_platform_metrics AS
SELECT
  (SELECT COUNT(*) FROM public.profiles) AS total_users,
  (SELECT COUNT(*) FROM public.food_listings) AS total_listings,
  (SELECT COUNT(*) FROM public.food_listings WHERE status='active') AS active_listings,
  (SELECT COUNT(*) FROM public.food_requests WHERE status='pending') AS pending_requests,
  (SELECT COUNT(*) FROM public.volunteer_tasks WHERE status='assigned') AS active_deliveries,
  (
    SELECT COUNT(*)
    FROM public.food_listings
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  ) AS listings_last_24h;

-- ============================================================================
-- SECTION 8: AUTO-EXPIRY CRON JOB
-- ============================================================================

SELECT cron.schedule('auto-expire-listings', '* * * * *', 'SELECT public.auto_expire_listings();') 
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-expire-listings');

SELECT cron.schedule('cleanup-stale-requests', '*/5 * * * *', 'SELECT public.cleanup_stale_requests();') 
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-requests');

COMMIT;
