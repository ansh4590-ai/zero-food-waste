-- =============================================================================
-- Zero Food Waste: Production Dispatch Engine Migration
-- Adds canonical lifecycle enums, atomic claim RPC, and delivered status
-- Safe to run multiple times (idempotent)
-- =============================================================================

-- ─── 1. CANONICAL LIFECYCLE ENUMS ────────────────────────────────────────────
-- food_requests lifecycle: pending → assigned → picked_up → delivered → cancelled
-- volunteer_tasks lifecycle: open → assigned → picked_up → delivered → completed

-- Add new enum values to request_status (text column in our schema, so just document states)
-- Our schema uses TEXT for status columns, so no ALTER TYPE needed.
-- We enforce valid transitions at the application layer + RLS.

-- ─── 2. ADD MISSING COLUMNS ──────────────────────────────────────────────────

-- Ensure food_requests has receiver coordinates (might already exist from 20260411000000)
ALTER TABLE public.food_requests ADD COLUMN IF NOT EXISTS latitude  FLOAT8;
ALTER TABLE public.food_requests ADD COLUMN IF NOT EXISTS longitude FLOAT8;

-- Add updated_at trigger support
ALTER TABLE public.volunteer_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add expiry_time to food_listings for urgency scoring
ALTER TABLE public.food_listings ADD COLUMN IF NOT EXISTS expiry_time TIMESTAMPTZ;

-- ─── 3. ATOMIC CLAIM RPC ─────────────────────────────────────────────────────
-- Replaces the unsafe two-step update with a single locked transaction.
-- Prevents race conditions where two volunteers claim the same task.

DROP FUNCTION IF EXISTS public.claim_volunteer_task(UUID, UUID);
CREATE FUNCTION public.claim_volunteer_task(
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
BEGIN
    -- Acquire row lock on the volunteer_task to prevent concurrent claims
    SELECT * INTO v_task
    FROM public.volunteer_tasks
    WHERE request_id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No dispatch task found for this request. Please refresh.'
        );
    END IF;

    -- Guard: only claim if still open
    IF v_task.status != 'open' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This task was already claimed by another volunteer.'
        );
    END IF;

    -- Verify food_request is still pending
    SELECT * INTO v_request
    FROM public.food_requests
    WHERE id = p_request_id;

    IF NOT FOUND OR v_request.status != 'pending' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This food request is no longer available.'
        );
    END IF;

    -- Atomically update both tables in the same transaction
    UPDATE public.volunteer_tasks
    SET
        status       = 'assigned',
        volunteer_id = p_volunteer_id,
        updated_at   = NOW()
    WHERE request_id = p_request_id;

    UPDATE public.food_requests
    SET
        status     = 'assigned',
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN json_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'A database error occurred. Please try again.'
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.claim_volunteer_task(UUID, UUID) TO authenticated;

-- ─── 4. STATUS TRANSITION VALIDATOR ─────────────────────────────────────────
-- Helper used by application layer to validate state machine transitions.

CREATE OR REPLACE FUNCTION public.validate_request_transition(
    p_old_status TEXT,
    p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN CASE
        WHEN p_old_status = 'pending'   AND p_new_status IN ('assigned', 'cancelled') THEN true
        WHEN p_old_status = 'assigned'  AND p_new_status IN ('picked_up', 'cancelled') THEN true
        WHEN p_old_status = 'picked_up' AND p_new_status IN ('delivered', 'cancelled') THEN true
        WHEN p_old_status = 'delivered' THEN false  -- terminal state
        WHEN p_old_status = 'cancelled' THEN false  -- terminal state
        -- Legacy compat
        WHEN p_old_status = 'fulfilled' THEN false
        ELSE false
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_request_transition(TEXT, TEXT) TO authenticated;

-- ─── 5. TASK STATUS ADVANCE RPC ──────────────────────────────────────────────
-- Advances a volunteer_task status and mirrors it to food_requests atomically.

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

-- ─── 6. UPDATE RLS POLICIES for volunteers to read food_requests ──────────────
-- Volunteers need to read pending food_requests to see the dispatch pool.

DROP POLICY IF EXISTS "requests_select_volunteer" ON public.food_requests;
CREATE POLICY "requests_select_volunteer" ON public.food_requests
  FOR SELECT USING (
    auth.uid() = receiver_id
    OR status = 'pending'    -- volunteers can see pending requests to claim
    OR EXISTS (
      SELECT 1 FROM public.volunteer_tasks vt
      WHERE vt.request_id = food_requests.id
        AND vt.volunteer_id = auth.uid()
    )
    OR public.has_permission(auth.uid(), 'requests.read_all')
  );

-- Allow volunteers to see food_listings for dispatch
DROP POLICY IF EXISTS "listings_select_volunteer" ON public.food_listings;
CREATE POLICY "listings_select_volunteer" ON public.food_listings
  FOR SELECT USING (
    status IN ('active', 'accepted', 'completed')
    OR auth.uid() = donor_id
    OR public.has_permission(auth.uid(), 'food.read_all')
  );

-- ─── 7. ENSURE REALTIME IS ENABLED ───────────────────────────────────────────
-- NOTE: If these fail it means they are already added. That's fine.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.food_listings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.food_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.volunteer_tasks;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
