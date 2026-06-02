-- =============================================================================
-- Migration: Structured Pickup Windows & Auto-Expiry
-- =============================================================================

-- 1. Add structured time columns to food_listings
ALTER TABLE public.food_listings 
  ADD COLUMN IF NOT EXISTS pickup_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_window_end TIMESTAMPTZ;

-- 2. Add validation constraint
ALTER TABLE public.food_listings
  ADD CONSTRAINT chk_pickup_window_order 
  CHECK (pickup_window_start IS NULL OR pickup_window_end IS NULL OR pickup_window_start < pickup_window_end);

-- 3. Replace claim_volunteer_task to strictly enforce the pickup window
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

    -- Guard: check listing availability and strict pickup window
    SELECT * INTO v_listing
    FROM public.food_listings
    WHERE id = v_request.listing_id;
    
    -- Check expiry
    IF v_listing.expiry_time <= NOW() THEN
        RETURN json_build_object('success', false, 'error', 'This food listing has expired and is no longer safe to claim.');
    END IF;

    -- NEW: Strict pickup window validation (no grace period for claiming)
    -- If the listing uses the new structured window, strictly enforce it.
    -- If the legacy text field is used (and start/end are null), we allow it to bypass for now, 
    -- as per the 30-day transitional legacy strategy.
    IF v_listing.pickup_window_start IS NOT NULL AND v_listing.pickup_window_end IS NOT NULL THEN
        IF NOW() < v_listing.pickup_window_start THEN
            RETURN json_build_object('success', false, 'error', 'The pickup window has not opened yet.');
        END IF;
        IF NOW() > v_listing.pickup_window_end THEN
            RETURN json_build_object('success', false, 'error', 'The pickup window has already closed.');
        END IF;
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

-- 4. Create Auto-Expiry Function
CREATE OR REPLACE FUNCTION public.auto_expire_stale_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- This function handles auto-expiring listings that have passed their pickup_window_end + grace period (15 mins)
    -- or passed their explicit expiry_time.
    
    -- Update listings to expired
    UPDATE public.food_listings
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'active' 
      AND (
        (pickup_window_end IS NOT NULL AND NOW() > pickup_window_end + interval '15 minutes')
        OR 
        (expiry_time IS NOT NULL AND NOW() > expiry_time)
      );

    -- Cancel associated open tasks and requests for the expired listings
    UPDATE public.volunteer_tasks vt
    SET status = 'cancelled',
        updated_at = NOW()
    FROM public.food_requests fr
    JOIN public.food_listings fl ON fl.id = fr.listing_id
    WHERE vt.request_id = fr.id
      AND vt.status = 'open'
      AND fl.status = 'expired';

    UPDATE public.food_requests fr
    SET status = 'cancelled',
        updated_at = NOW()
    FROM public.food_listings fl
    WHERE fl.id = fr.listing_id
      AND fr.status = 'pending'
      AND fl.status = 'expired';
END;
$$;

-- We can create a trigger that runs this occasionally, or run it via pg_cron if enabled.
-- Since pg_cron availability varies, we will execute this function automatically whenever ANY user selects food_listings.
-- To avoid heavy load, we'll wrap it in a lightweight trigger, OR we just let the frontend edge functions call it.
-- A cleaner approach without pg_cron is to just rely on the frontend filtering (Browse.tsx) and the claim_volunteer_task validation.
-- However, we still created the auto_expire_stale_listings() function for the backend to use.
