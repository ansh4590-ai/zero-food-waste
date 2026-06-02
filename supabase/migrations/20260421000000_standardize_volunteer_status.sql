-- =============================================================================
-- Zero Food Waste: Standardize Volunteer Status
-- Drops legacy fallback for 'in_progress' and 'completed' on volunteer_tasks.
-- Replaces them strictly with 'picked_up' and 'delivered'.
-- =============================================================================

-- Migrate existing data
UPDATE public.volunteer_tasks SET status = 'picked_up' WHERE status = 'in_progress';
UPDATE public.volunteer_tasks SET status = 'delivered' WHERE status = 'completed';

-- ─── UPDATE QR TOKEN GENERATION RPC ─────────────────────────────────────────
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
    IF p_type NOT IN ('pickup', 'delivery') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid type. Use pickup or delivery.');
    END IF;

    SELECT * INTO v_task FROM public.volunteer_tasks WHERE id = p_task_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Task not found.');
    END IF;

    IF p_type = 'delivery' AND v_task.status != 'picked_up' THEN
        RETURN json_build_object('success', false, 'error', 'Pickup must be completed before generating delivery QR.');
    END IF;

    v_token := gen_random_uuid()::TEXT;
    v_expires_at := NOW() + INTERVAL '10 minutes';

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

-- ─── UPDATE QR TOKEN VERIFICATION RPC ───────────────────────────────────────
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
    SELECT * INTO v_task FROM public.volunteer_tasks WHERE pickup_qr_token = p_token FOR UPDATE;
    IF FOUND THEN
        v_type := 'pickup';
    ELSE
        SELECT * INTO v_task FROM public.volunteer_tasks WHERE delivery_qr_token = p_token FOR UPDATE;
        IF NOT FOUND THEN
            RETURN json_build_object('success', false, 'error', 'Invalid or unknown QR code.');
        END IF;
        v_type := 'delivery';
    END IF;

    IF v_task.volunteer_id != p_volunteer_id THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: You are not assigned to this task.');
    END IF;

    IF v_type = 'pickup' AND v_task.pickup_qr_used THEN
        RETURN json_build_object('success', false, 'error', 'This QR code has already been used.');
    END IF;
    IF v_type = 'delivery' AND v_task.delivery_qr_used THEN
        RETURN json_build_object('success', false, 'error', 'This QR code has already been used.');
    END IF;

    IF v_type = 'pickup' AND v_task.pickup_qr_expires_at < NOW() THEN
        RETURN json_build_object('success', false, 'error', 'QR code has expired. Please ask for a new one.');
    END IF;
    IF v_type = 'delivery' AND v_task.delivery_qr_expires_at < NOW() THEN
        RETURN json_build_object('success', false, 'error', 'QR code has expired. Please ask for a new one.');
    END IF;

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

        UPDATE public.food_requests
        SET status = 'picked_up', updated_at = NOW()
        WHERE id = v_task.request_id;

    ELSE -- delivery
        IF v_task.status != 'picked_up' THEN
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

-- --- UPDATE OTP VERIFICATION RPC --------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_task_otp(
    p_task_id      UUID,
    p_volunteer_id UUID,
    p_otp_type     TEXT,   -- 'pickup' or 'delivery'
    p_otp_value    TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_hash TEXT;
    v_attempts INT;
    v_max_attempts INT := 3;
BEGIN
    IF p_otp_type NOT IN ('pickup', 'delivery') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid OTP type.');
    END IF;

    SELECT * INTO v_task FROM public.volunteer_tasks WHERE id = p_task_id AND volunteer_id = p_volunteer_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Task not found or you are not the assigned volunteer.');
    END IF;

    IF p_otp_type = 'pickup' THEN
        v_hash := v_task.pickup_otp_hash;
        v_attempts := COALESCE(v_task.pickup_otp_attempts, 0);
    ELSE
        v_hash := v_task.delivery_otp_hash;
        v_attempts := COALESCE(v_task.delivery_otp_attempts, 0);
    END IF;

    IF v_attempts >= v_max_attempts THEN
        RETURN json_build_object('success', false, 'error', 'Too many failed attempts. Contact support.', 'locked', true);
    END IF;

    IF v_hash IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No OTP has been generated for this step.');
    END IF;

    IF MD5(p_otp_value) != v_hash THEN
        IF p_otp_type = 'pickup' THEN
            UPDATE public.volunteer_tasks SET pickup_otp_attempts = v_attempts + 1 WHERE id = p_task_id;
        ELSE
            UPDATE public.volunteer_tasks SET delivery_otp_attempts = v_attempts + 1 WHERE id = p_task_id;
        END IF;
        RETURN json_build_object(
            'success', false,
            'error', 'Incorrect OTP. ' || (v_max_attempts - v_attempts - 1)::TEXT || ' attempts remaining.',
            'remaining', v_max_attempts - v_attempts - 1
        );
    END IF;

    IF p_otp_type = 'pickup' THEN
        IF v_task.status != 'assigned' THEN
            RETURN json_build_object('success', false, 'error', 'Invalid status for pickup verification: ' || v_task.status);
        END IF;

        UPDATE public.volunteer_tasks
        SET status = 'picked_up', picked_up_at = NOW(), updated_at = NOW()
        WHERE id = p_task_id;

        UPDATE public.food_requests
        SET status = 'picked_up', updated_at = NOW()
        WHERE id = v_task.request_id;
    ELSE -- delivery
        IF v_task.status != 'picked_up' THEN
            RETURN json_build_object('success', false, 'error', 'Invalid status for delivery verification: ' || v_task.status);
        END IF;

        UPDATE public.volunteer_tasks
        SET status = 'delivered', delivered_at = NOW(), completed_at = NOW(), updated_at = NOW()
        WHERE id = p_task_id;

        UPDATE public.food_requests
        SET status = 'delivered', updated_at = NOW()
        WHERE id = v_task.request_id;

        UPDATE public.food_listings fl
        SET status = 'completed', updated_at = NOW()
        FROM public.food_requests fr
        WHERE fr.id = v_task.request_id AND fl.id = fr.listing_id;
    END IF;

    RETURN json_build_object('success', true, 'new_status', CASE WHEN p_otp_type = 'pickup' THEN 'picked_up' ELSE 'delivered' END);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;
