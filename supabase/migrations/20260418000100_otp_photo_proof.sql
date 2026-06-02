-- =============================================================================
-- Zero Food Waste: OTP Verification & Photo Proof Migration
-- Adds OTP hashes, attempt counters, proof image URLs, and timestamp columns
-- to volunteer_tasks. Creates RPCs for OTP lifecycle and stale task cleanup.
-- =============================================================================

-- ─── 1. NEW COLUMNS ─────────────────────────────────────────────────────────

ALTER TABLE public.volunteer_tasks
  ADD COLUMN IF NOT EXISTS pickup_otp_hash TEXT,
  ADD COLUMN IF NOT EXISTS delivery_otp_hash TEXT,
  ADD COLUMN IF NOT EXISTS pickup_otp_attempts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_otp_attempts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickup_image_url TEXT,
  ADD COLUMN IF NOT EXISTS delivery_image_url TEXT,
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- ─── 2. OTP GENERATION RPC ──────────────────────────────────────────────────
-- Generates a random 4-digit OTP, stores its MD5 hash, and returns the
-- plaintext OTP for display to the donor/receiver.

CREATE OR REPLACE FUNCTION public.generate_task_otp(
    p_task_id UUID,
    p_otp_type TEXT  -- 'pickup' or 'delivery'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_otp TEXT;
    v_hash TEXT;
    v_task RECORD;
BEGIN
    -- Validate type
    IF p_otp_type NOT IN ('pickup', 'delivery') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid OTP type. Use pickup or delivery.');
    END IF;

    -- Verify task exists
    SELECT * INTO v_task FROM public.volunteer_tasks WHERE id = p_task_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Task not found.');
    END IF;

    -- Generate 4-digit OTP
    v_otp := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    v_hash := MD5(v_otp);

    -- Store hash and reset attempts
    IF p_otp_type = 'pickup' THEN
        UPDATE public.volunteer_tasks
        SET pickup_otp_hash = v_hash, pickup_otp_attempts = 0, updated_at = NOW()
        WHERE id = p_task_id;
    ELSE
        UPDATE public.volunteer_tasks
        SET delivery_otp_hash = v_hash, delivery_otp_attempts = 0, updated_at = NOW()
        WHERE id = p_task_id;
    END IF;

    RETURN json_build_object('success', true, 'otp', v_otp);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_task_otp(UUID, TEXT) TO authenticated;

-- ─── 3. OTP VERIFICATION RPC ────────────────────────────────────────────────
-- Verifies OTP, atomically advances task status, and records timestamps.
-- Locks out after 3 failed attempts.

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
    -- Validate type
    IF p_otp_type NOT IN ('pickup', 'delivery') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid OTP type.');
    END IF;

    -- Lock row for update
    SELECT * INTO v_task
    FROM public.volunteer_tasks
    WHERE id = p_task_id AND volunteer_id = p_volunteer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Task not found or you are not the assigned volunteer.');
    END IF;

    -- Extract hash and attempts for the type
    IF p_otp_type = 'pickup' THEN
        v_hash := v_task.pickup_otp_hash;
        v_attempts := COALESCE(v_task.pickup_otp_attempts, 0);
    ELSE
        v_hash := v_task.delivery_otp_hash;
        v_attempts := COALESCE(v_task.delivery_otp_attempts, 0);
    END IF;

    -- Check lock-out
    IF v_attempts >= v_max_attempts THEN
        RETURN json_build_object('success', false, 'error', 'Too many failed attempts. Contact support.', 'locked', true);
    END IF;

    -- No OTP generated yet
    IF v_hash IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No OTP has been generated for this step.');
    END IF;

    -- Verify
    IF MD5(p_otp_value) != v_hash THEN
        -- Increment attempt counter
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

    -- OTP correct — advance status atomically
    IF p_otp_type = 'pickup' THEN
        -- Validate current status
        IF v_task.status != 'assigned' THEN
            RETURN json_build_object('success', false, 'error', 'Invalid status for pickup verification: ' || v_task.status);
        END IF;

        UPDATE public.volunteer_tasks
        SET status = 'picked_up', picked_up_at = NOW(), updated_at = NOW()
        WHERE id = p_task_id;

        -- Mirror to food_requests
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

        -- Mark listing completed
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

GRANT EXECUTE ON FUNCTION public.verify_task_otp(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ─── 4. AUTO-EXPIRE STALE TASKS ─────────────────────────────────────────────
-- Re-opens tasks stuck in pending_acceptance for >10 minutes.
-- Can be called by pg_cron or a scheduled edge function.

CREATE OR REPLACE FUNCTION public.auto_expire_stale_tasks()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT;
BEGIN
    -- Find pending_acceptance tasks older than 10 minutes
    WITH stale AS (
        SELECT id, request_id, volunteer_id
        FROM public.volunteer_tasks
        WHERE status = 'pending_acceptance'
          AND created_at < NOW() - INTERVAL '10 minutes'
    )
    -- Delete stale assignments and revert food_requests to pending
    , deleted AS (
        DELETE FROM public.volunteer_tasks
        WHERE id IN (SELECT id FROM stale)
        RETURNING request_id, volunteer_id
    )
    -- Revert food_requests
    , reverted AS (
        UPDATE public.food_requests
        SET status = 'pending', updated_at = NOW()
        WHERE id IN (SELECT request_id FROM deleted)
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM reverted;

    -- Notify affected volunteers
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT volunteer_id, 'Assignment Expired', 'A dispatch assignment timed out because it was not accepted within 10 minutes.', 'system', '/tasks'
    FROM (
        SELECT DISTINCT volunteer_id
        FROM public.volunteer_tasks
        WHERE status = 'pending_acceptance'
          AND created_at < NOW() - INTERVAL '10 minutes'
    ) expired_vols
    WHERE volunteer_id IS NOT NULL;

    RETURN json_build_object('success', true, 'expired_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_expire_stale_tasks() TO authenticated;

-- ─── 5. STORAGE BUCKET (documentation — run manually in Supabase dashboard) ──
-- Create a bucket called 'task_proofs' for pickup/delivery photos.
-- In Supabase Dashboard → Storage → New Bucket → 'task_proofs' (public: false)
-- Or via CLI: supabase storage create task_proofs --public=false
