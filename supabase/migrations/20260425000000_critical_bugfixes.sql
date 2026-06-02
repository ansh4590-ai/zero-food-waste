-- =============================================================================
-- CRITICAL PATCH: Fix Volunteer Claim Deadlock + Multi-Receiver Exploit
-- Date: 2026-04-25
-- =============================================================================

-- ─── BUG A FIX: Volunteer Claim Deadlock ─────────────────────────────────────
-- 
-- ROOT CAUSE: When auto-dispatch assigns a volunteer who then DECLINES,
-- handle_task_assignment DELETEs the volunteer_tasks row and reverts
-- food_requests.status to 'pending'. The request re-enters the broadcast
-- pool but NO volunteer_tasks row exists anymore. Any subsequent manual
-- claim via claim_volunteer_task hits NOT FOUND and permanently fails.
--
-- FIX: Rewrite claim_volunteer_task to handle BOTH cases:
--   Case 1: volunteer_tasks row exists with status='open' → claim it (original path)
--   Case 2: no volunteer_tasks row exists → atomically INSERT one + claim it
-- Also lock food_requests first to prevent concurrent insert races.

-- Drop BOTH overloaded versions to avoid ambiguous calls
DROP FUNCTION IF EXISTS public.claim_volunteer_task(UUID, UUID);

CREATE OR REPLACE FUNCTION public.claim_volunteer_task(
    p_request_id  UUID,
    p_volunteer_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task      RECORD;
    v_request   RECORD;
    v_new_task_id UUID;
BEGIN
    -- 1. Lock the food_request row FIRST to serialize all concurrent claims
    SELECT * INTO v_request
    FROM public.food_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This food request no longer exists.'
        );
    END IF;

    -- Guard: only claim if request is still pending
    IF v_request.status != 'pending' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This request has already been assigned to another volunteer.'
        );
    END IF;

    -- Guard: block claiming if the associated listing has expired
    IF EXISTS (
        SELECT 1 FROM public.food_listings 
        WHERE id = v_request.listing_id 
        AND expiry_time <= NOW()
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This food listing has expired and is no longer safe to claim.'
        );
    END IF;

    -- 2. Try to find an existing volunteer_tasks row for this request
    SELECT * INTO v_task
    FROM public.volunteer_tasks
    WHERE request_id = p_request_id
    FOR UPDATE;

    IF FOUND THEN
        -- Case 1: Row exists — only claim if still open
        IF v_task.status != 'open' THEN
            RETURN json_build_object(
                'success', false,
                'error', 'This task was already claimed by another volunteer.'
            );
        END IF;

        -- Claim the existing row
        UPDATE public.volunteer_tasks
        SET status       = 'assigned',
            volunteer_id = p_volunteer_id,
            updated_at   = NOW()
        WHERE id = v_task.id;
    ELSE
        -- Case 2: No row exists (post-decline scenario) — create one atomically
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
    RETURN json_build_object(
        'success', false,
        'error', 'Database error during claim: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_volunteer_task(UUID, UUID) TO authenticated;


-- ─── BUG B FIX: Multiple Receivers Request Same Food ─────────────────────────
--
-- ROOT CAUSE: food_listings.status stays 'active' until final delivery.
-- Nothing prevents N different receivers from inserting N food_requests
-- for the same listing_id, each spawning its own volunteer dispatch.
--
-- FIX: Two-layer protection:
--   Layer 1: DB trigger on food_requests AFTER INSERT that atomically
--            sets food_listings.status = 'reserved' on the FIRST request.
--   Layer 2: Unique partial index on food_requests(listing_id) to prevent
--            multiple non-cancelled requests per listing (not per user).
--
-- Browse.tsx already filters .eq('status', 'active'), so reserved listings
-- automatically disappear from the browse page with zero frontend changes.

-- Layer 1: Trigger to reserve listing on first request
CREATE OR REPLACE FUNCTION public.reserve_listing_on_request()
RETURNS TRIGGER AS $$
DECLARE
    v_listing_status TEXT;
BEGIN
    -- Lock the listing row to prevent concurrent inserts from racing
    SELECT status INTO v_listing_status
    FROM public.food_listings
    WHERE id = NEW.listing_id
    FOR UPDATE;

    IF v_listing_status IS NULL THEN
        -- Listing doesn't exist — let the FK constraint handle it
        RETURN NEW;
    END IF;

    IF v_listing_status != 'active' THEN
        -- Listing already reserved/completed — reject this request
        RAISE EXCEPTION 'This food listing is no longer available (status: %).',
            v_listing_status
            USING ERRCODE = 'P0001';
    END IF;

    -- Atomically transition listing to reserved
    UPDATE public.food_listings
    SET status = 'reserved', updated_at = NOW()
    WHERE id = NEW.listing_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fire BEFORE INSERT so we can RAISE EXCEPTION to abort the insert
DROP TRIGGER IF EXISTS trigger_reserve_listing_on_request ON public.food_requests;
CREATE TRIGGER trigger_reserve_listing_on_request
    BEFORE INSERT ON public.food_requests
    FOR EACH ROW EXECUTE FUNCTION public.reserve_listing_on_request();

-- Trigger to release reservation if the request is cancelled
CREATE OR REPLACE FUNCTION public.release_listing_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.food_requests
            WHERE listing_id = NEW.listing_id
              AND id != NEW.id
              AND status NOT IN ('cancelled', 'delivered')
        ) THEN
            UPDATE public.food_listings
            SET status = 'active', updated_at = NOW()
            WHERE id = NEW.listing_id AND status = 'reserved';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_release_listing_on_cancel ON public.food_requests;
CREATE TRIGGER trigger_release_listing_on_cancel
    AFTER UPDATE OF status ON public.food_requests
    FOR EACH ROW EXECUTE FUNCTION public.release_listing_on_cancel();

-- Layer 2: Hard constraint — only ONE non-terminal request per listing (any receiver)
-- This catches any edge case the trigger might miss (e.g., direct SQL inserts)

-- Clean up existing duplicate active requests before creating the unique index
WITH Duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER(PARTITION BY listing_id ORDER BY created_at ASC) as row_num
    FROM public.food_requests
    WHERE status NOT IN ('cancelled', 'delivered')
)
UPDATE public.food_requests
SET status = 'cancelled', updated_at = NOW()
WHERE id IN (
    SELECT id FROM Duplicates WHERE row_num > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_request_per_listing
ON public.food_requests (listing_id)
WHERE status NOT IN ('cancelled', 'delivered');

-- Update RLS: Allow volunteers and receivers to see 'reserved' listings
-- (they need to see the listing details for their active tasks/requests)
DROP POLICY IF EXISTS "listings_select" ON public.food_listings;
CREATE POLICY "listings_select" ON public.food_listings
  FOR SELECT USING (
    status IN ('active', 'reserved')
    OR auth.uid() = donor_id
    OR public.has_permission(auth.uid(), 'food.read_all')
  );

DROP POLICY IF EXISTS "listings_select_volunteer" ON public.food_listings;
CREATE POLICY "listings_select_volunteer" ON public.food_listings
  FOR SELECT USING (
    (status IN ('active', 'reserved', 'completed') AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'volunteer'))
    OR auth.uid() = donor_id
    OR public.has_permission(auth.uid(), 'food.read_all')
  );

-- Update the advance_task_status function to transition reserved -> completed
-- (not just active -> completed) when delivery is confirmed
CREATE OR REPLACE FUNCTION public.advance_task_status(
    p_task_id      UUID,
    p_volunteer_id UUID,
    p_new_status   TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task    RECORD;
    v_allowed BOOLEAN;
BEGIN
    -- Verify ownership
    SELECT * INTO v_task
    FROM public.volunteer_tasks
    WHERE id = p_task_id AND volunteer_id = p_volunteer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Task not found or you are not the assigned volunteer.'
        );
    END IF;

    -- Validate task transition
    v_allowed := CASE
        WHEN v_task.status = 'assigned'  AND p_new_status = 'picked_up'  THEN true
        WHEN v_task.status = 'picked_up' AND p_new_status = 'delivered'  THEN true
        ELSE false
    END;

    IF NOT v_allowed THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Invalid status transition: ' || v_task.status || ' → ' || p_new_status
        );
    END IF;

    -- Update volunteer_task
    UPDATE public.volunteer_tasks
    SET
        status       = p_new_status,
        updated_at   = NOW(),
        completed_at = CASE WHEN p_new_status = 'delivered' THEN NOW() ELSE completed_at END
    WHERE id = p_task_id;

    -- Mirror to food_requests
    UPDATE public.food_requests
    SET
        status     = p_new_status,
        updated_at = NOW()
    WHERE id = v_task.request_id;

    -- If delivered, also mark the food_listing as completed
    -- Now handles both 'active' and 'reserved' source states
    IF p_new_status = 'delivered' THEN
        UPDATE public.food_listings fl
        SET status = 'completed', updated_at = NOW()
        FROM public.food_requests fr
        WHERE fr.id = v_task.request_id
          AND fl.id = fr.listing_id;
    END IF;

    RETURN json_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'A database error occurred: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_task_status(UUID, UUID, TEXT) TO authenticated;
