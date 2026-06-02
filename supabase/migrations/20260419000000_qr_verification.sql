-- =============================================================================
-- Zero Food Waste: QR Code Verification System
-- Adds QR token columns, timestamp tracking, and atomic verification RPCs
-- to volunteer_tasks. Zero-cost replacement for SMS OTP.
-- =============================================================================

-- ─── 1. NEW COLUMNS ─────────────────────────────────────────────────────────

ALTER TABLE public.volunteer_tasks
  ADD COLUMN IF NOT EXISTS pickup_qr_token TEXT,
  ADD COLUMN IF NOT EXISTS pickup_qr_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_qr_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_qr_token TEXT,
  ADD COLUMN IF NOT EXISTS delivery_qr_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_qr_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_verified_at TIMESTAMPTZ;

-- Index tokens for fast lookup during verification
CREATE INDEX IF NOT EXISTS idx_vt_pickup_qr_token ON public.volunteer_tasks (pickup_qr_token) WHERE pickup_qr_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vt_delivery_qr_token ON public.volunteer_tasks (delivery_qr_token) WHERE delivery_qr_token IS NOT NULL;

-- ─── 2. QR TOKEN GENERATION RPC ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_qr_token(
    p_task_id UUID,
    p_type TEXT  -- 'pickup' or 'delivery'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_token TEXT;
    v_expires_at TIMESTAMPTZ;
    v_task RECORD;
BEGIN
    -- Validate type
    IF p_type NOT IN ('pickup', 'delivery') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid type. Use pickup or delivery.');
    END IF;

    -- Verify task exists
    SELECT * INTO v_task FROM public.volunteer_tasks WHERE id = p_task_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Task not found.');
    END IF;

    -- For delivery: ensure pickup is already completed
    IF p_type = 'delivery' AND v_task.status NOT IN ('picked_up', 'in_progress') THEN
        RETURN json_build_object('success', false, 'error', 'Pickup must be completed before generating delivery QR.');
    END IF;

    -- Generate cryptographic token and 10-minute expiry
    v_token := gen_random_uuid()::TEXT;
    v_expires_at := NOW() + INTERVAL '10 minutes';

    -- Store token
    IF p_type = 'pickup' THEN
        UPDATE public.volunteer_tasks
        SET pickup_qr_token = v_token,
            pickup_qr_expires_at = v_expires_at,
            pickup_qr_used = false,
            updated_at = NOW()
        WHERE id = p_task_id;
    ELSE
        UPDATE public.volunteer_tasks
        SET delivery_qr_token = v_token,
            delivery_qr_expires_at = v_expires_at,
            delivery_qr_used = false,
            updated_at = NOW()
        WHERE id = p_task_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'token', v_token,
        'expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_qr_token(UUID, TEXT) TO authenticated;

-- ─── 3. QR TOKEN VERIFICATION RPC ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.verify_qr_token(
    p_token TEXT,
    p_volunteer_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_type TEXT;
BEGIN
    -- Find task by pickup token
    SELECT * INTO v_task
    FROM public.volunteer_tasks
    WHERE pickup_qr_token = p_token
    FOR UPDATE;

    IF FOUND THEN
        v_type := 'pickup';
    ELSE
        -- Try delivery token
        SELECT * INTO v_task
        FROM public.volunteer_tasks
        WHERE delivery_qr_token = p_token
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN json_build_object('success', false, 'error', 'Invalid or unknown QR code.');
        END IF;
        v_type := 'delivery';
    END IF;

    -- Volunteer authorization check
    IF v_task.volunteer_id != p_volunteer_id THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: You are not assigned to this task.');
    END IF;

    -- Check if already used
    IF v_type = 'pickup' AND v_task.pickup_qr_used THEN
        RETURN json_build_object('success', false, 'error', 'This QR code has already been used.');
    END IF;
    IF v_type = 'delivery' AND v_task.delivery_qr_used THEN
        RETURN json_build_object('success', false, 'error', 'This QR code has already been used.');
    END IF;

    -- Check expiry
    IF v_type = 'pickup' AND v_task.pickup_qr_expires_at < NOW() THEN
        RETURN json_build_object('success', false, 'error', 'QR code has expired. Please ask for a new one.');
    END IF;
    IF v_type = 'delivery' AND v_task.delivery_qr_expires_at < NOW() THEN
        RETURN json_build_object('success', false, 'error', 'QR code has expired. Please ask for a new one.');
    END IF;

    -- Status gate: advance status atomically
    IF v_type = 'pickup' THEN
        IF v_task.status != 'assigned' THEN
            RETURN json_build_object('success', false, 'error', 'Task is not in the correct state for pickup verification (current: ' || v_task.status || ').');
        END IF;

        UPDATE public.volunteer_tasks
        SET status = 'picked_up',
            pickup_qr_used = true,
            pickup_verified_at = NOW(),
            picked_up_at = NOW(),
            updated_at = NOW()
        WHERE id = v_task.id;

        -- Mirror to food_requests
        UPDATE public.food_requests
        SET status = 'picked_up', updated_at = NOW()
        WHERE id = v_task.request_id;

    ELSE -- delivery
        IF v_task.status NOT IN ('picked_up', 'in_progress') THEN
            RETURN json_build_object('success', false, 'error', 'Pickup must be completed before delivery verification (current: ' || v_task.status || ').');
        END IF;

        UPDATE public.volunteer_tasks
        SET status = 'delivered',
            delivery_qr_used = true,
            delivery_verified_at = NOW(),
            delivered_at = NOW(),
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = v_task.id;

        UPDATE public.food_requests
        SET status = 'delivered', updated_at = NOW()
        WHERE id = v_task.request_id;

        -- Mark listing completed
        UPDATE public.food_listings fl
        SET status = 'completed', updated_at = NOW()
        FROM public.food_requests fr
        WHERE fr.id = v_task.request_id AND fl.id = fr.listing_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'new_status', CASE WHEN v_type = 'pickup' THEN 'picked_up' ELSE 'delivered' END,
        'task_id', v_task.id,
        'type', v_type
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_qr_token(TEXT, UUID) TO authenticated;
