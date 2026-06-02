-- =============================================================================
-- Zero Food Waste: Volunteer Abort Flow
-- Implements an atomic cancellation flow for assigned/picked_up volunteer tasks
-- =============================================================================

BEGIN;

-- 1. Add cancellation_reason and cancelled_at columns if they don't exist
ALTER TABLE public.volunteer_tasks
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_cancelled_at
ON public.volunteer_tasks (cancelled_at)
WHERE cancelled_at IS NOT NULL;

-- 2. Create the abort RPC
CREATE OR REPLACE FUNCTION public.abort_volunteer_task(
    p_task_id UUID,
    p_volunteer_id UUID,
    p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_request RECORD;
    v_listing RECORD;
    v_volunteer_name TEXT;
    v_other_requests_count INT;
BEGIN
    -- Input validation
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RETURN json_build_object('success', false, 'error', 'Cancellation reason is required.');
    END IF;

    -- Lock the task for update to prevent races
    SELECT * INTO v_task
    FROM public.volunteer_tasks
    WHERE id = p_task_id AND volunteer_id = p_volunteer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Task not found or you are not authorized to abort it.');
    END IF;

    -- Guard against aborting completed/delivered tasks
    IF v_task.status IN ('delivered', 'completed') THEN
        RETURN json_build_object('success', false, 'error', 'Cannot abort a task that is already completed or delivered.');
    END IF;

    -- If already cancelled, do nothing but return success
    IF v_task.status = 'cancelled' THEN
        RETURN json_build_object('success', true, 'message', 'Task was already cancelled.');
    END IF;

    -- Get associated request and lock it
    SELECT * INTO v_request
    FROM public.food_requests
    WHERE id = v_task.request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Associated food request not found.');
    END IF;

    -- Get listing and lock it
    SELECT * INTO v_listing
    FROM public.food_listings
    WHERE id = v_request.listing_id
    FOR UPDATE;

    -- Get volunteer name for notifications
    SELECT full_name INTO v_volunteer_name
    FROM public.profiles
    WHERE id = p_volunteer_id;

    -- Update the task: mark as cancelled, set reason, fully invalidate QR tokens, and set cancelled_at
    UPDATE public.volunteer_tasks
    SET status = 'cancelled',
        cancellation_reason = p_reason,
        cancelled_at = NOW(),
        pickup_qr_token = NULL,
        delivery_qr_token = NULL,
        pickup_qr_used = TRUE,
        delivery_qr_used = TRUE,
        pickup_qr_expires_at = NOW(),
        delivery_qr_expires_at = NOW(),
        updated_at = NOW()
    WHERE id = p_task_id;

    -- Revert the food request to pending ONLY if no other volunteer is actively handling it
    IF NOT EXISTS (
        SELECT 1 FROM public.volunteer_tasks vt
        WHERE vt.request_id = v_task.request_id
        AND vt.status NOT IN ('cancelled', 'completed', 'delivered')
        AND vt.id != p_task_id
    ) THEN
        UPDATE public.food_requests
        SET status = 'pending',
            updated_at = NOW()
        WHERE id = v_task.request_id;
    END IF;

    IF v_listing IS NOT NULL THEN
        -- Check if there are other active requests for this listing
        SELECT COUNT(*) INTO v_other_requests_count
        FROM public.food_requests
        WHERE listing_id = v_request.listing_id
          AND status NOT IN ('cancelled', 'delivered')
          AND id != v_task.request_id;

        -- If no other active requests, ensure listing is 'active' (it might have been 'reserved')
        IF v_other_requests_count = 0 AND v_listing.status = 'reserved' THEN
            UPDATE public.food_listings
            SET status = 'active',
                updated_at = NOW()
            WHERE id = v_request.listing_id;
        END IF;

        -- Notify the Donor
        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (
            v_listing.donor_id,
            'Volunteer Aborted Task',
            'The assigned volunteer (' || COALESCE(v_volunteer_name, 'Unknown') || ') had to cancel the pickup for ' || v_listing.title || '. Reason: ' || p_reason || '. The listing is available again.',
            'status_update',
            '/dashboard'
        );

        -- Notify the Receiver
        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (
            v_request.receiver_id,
            'Delivery Cancelled',
            'The volunteer (' || COALESCE(v_volunteer_name, 'Unknown') || ') assigned to deliver ' || v_listing.title || ' had to cancel. Reason: ' || p_reason || '. Your request is back in the pool for another volunteer.',
            'status_update',
            '/requests'
        );
    END IF;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Internal server error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.abort_volunteer_task(UUID, UUID, TEXT) TO authenticated;

COMMIT;
