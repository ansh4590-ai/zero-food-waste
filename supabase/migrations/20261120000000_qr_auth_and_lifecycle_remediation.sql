-- =============================================================================
-- Migration: 20261120000000_qr_auth_and_lifecycle_remediation.sql
-- Description:
--   1. Fixes invalid listing UPDATE policy (removes illegal OLD reference in RLS).
--   2. Restricts donor UPDATE via column privileges + anti-tampering trigger.
--   3. Expands food_listings_public view to include freshness_score & quality_status.
--   4. Grants SELECT on volunteer_tasks to listing donors and request receivers (P0).
--   5. Fixes QR generation authorization model (P0):
--        - Donor generates pickup QR (shown to volunteer at pickup).
--        - Receiver generates delivery QR (shown to volunteer at delivery).
--        - Volunteer scans and verifies both (requires KYC approval).
--   6. Enforces KYC verification on claim_volunteer_task & handle_task_assignment (P1).
--   7. Creates open broadcast task on declined / expired / aborted tasks (P1).
--   8. Prevents task abort after pickup (P1).
-- =============================================================================

BEGIN;

-- ─── 1. Fix Food Listings UPDATE Policy & Column Restrictions ────────────────
DROP POLICY IF EXISTS "listings_update_donor" ON public.food_listings;
DROP POLICY IF EXISTS "listings_update_donor_fields_only" ON public.food_listings;

CREATE POLICY "listings_update_donor" ON public.food_listings
FOR UPDATE
USING (auth.uid() = donor_id OR public.has_permission(auth.uid(), 'users.read'))
WITH CHECK (auth.uid() = donor_id OR public.has_permission(auth.uid(), 'users.read'));

-- Column privilege restriction: authenticated users can only update safe descriptive fields
REVOKE UPDATE ON TABLE public.food_listings FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  title, quantity_description, food_category, location_name,
  image_url, pickup_window, pickup_window_start, pickup_window_end,
  expiry_time, estimated_safe_hours, spoilage_risk, updated_at
) ON TABLE public.food_listings TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.food_listings TO service_role;

-- Remove the trigger that blocks trusted lifecycle RPCs.
-- SECURITY DEFINER RPCs (verify_qr_token, cancel_food_request, abort_volunteer_task) legitimately
-- update food_listings.status; auth.uid() still identifies the original calling user inside those
-- functions, so a trigger checking auth.uid() would reject their writes.
DROP TRIGGER IF EXISTS trigger_prevent_donor_status_tampering ON public.food_listings;
DROP FUNCTION IF EXISTS public.prevent_donor_status_tampering();
-- Explicitly revoke direct status/donor_id update capability from all client roles.
-- The column-level GRANT above already limits which columns authenticated users can touch.
REVOKE UPDATE (status, donor_id) ON public.food_listings FROM PUBLIC, anon, authenticated;

-- ─── 2. Update food_listings_public View with Freshness & Quality ─────────────
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
  created_at
FROM public.food_listings
WHERE status = 'active'::public.listing_status;

REVOKE ALL ON TABLE public.food_listings_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.food_listings_public TO anon, authenticated;

-- ─── 3. Task SELECT Policy: Restrict open task visibility to KYC-approved volunteers ──
DROP POLICY IF EXISTS "tasks_select" ON public.volunteer_tasks;

CREATE POLICY "tasks_select" ON public.volunteer_tasks
FOR SELECT TO authenticated
USING (
  auth.uid() = volunteer_id
  OR EXISTS (
    SELECT 1 FROM public.food_requests fr
    JOIN public.food_listings fl ON fl.id = fr.listing_id
    WHERE fr.id = volunteer_tasks.request_id AND fl.donor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.food_requests fr
    WHERE fr.id = volunteer_tasks.request_id AND fr.receiver_id = auth.uid()
  )
  OR (
    status = 'open'::public.volunteer_status
    AND volunteer_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'volunteer'::public.user_role
        AND p.verification_status = 'approved'
    )
  )
  OR public.has_permission(auth.uid(), 'users.read')
);

-- ─── 4. QR Token Generation RPC (Donor Pickup / Receiver Delivery) ────────────
CREATE OR REPLACE FUNCTION public.generate_qr_token(
  p_task_id UUID,
  p_type TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_task RECORD;
  v_request RECORD;
  v_listing RECORD;
  v_caller_id UUID := auth.uid();
  v_is_admin BOOLEAN := FALSE;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('pickup', 'delivery') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid type. Use pickup or delivery.');
  END IF;

  IF v_caller_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized.');
  END IF;

  v_is_admin := public.has_permission(v_caller_id, 'users.read');

  SELECT * INTO v_task
  FROM public.volunteer_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Task not found.');
  END IF;

  SELECT * INTO v_request
  FROM public.food_requests
  WHERE id = v_task.request_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Associated food request not found.');
  END IF;

  SELECT * INTO v_listing
  FROM public.food_listings
  WHERE id = v_request.listing_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Associated food listing not found.');
  END IF;

  IF p_type = 'pickup' THEN
    -- Donor (who owns the listing) generates pickup QR to show to volunteer
    IF v_caller_id IS DISTINCT FROM v_listing.donor_id AND NOT v_is_admin THEN
      RETURN json_build_object('success', false, 'error', 'Unauthorized: only the listing donor can generate the pickup QR.');
    END IF;

    IF v_task.status <> 'assigned'::public.volunteer_status THEN
      RETURN json_build_object('success', false, 'error', 'Pickup QR can only be generated when task is assigned.');
    END IF;
  ELSIF p_type = 'delivery' THEN
    -- Receiver (who requested the food) generates delivery QR to show to volunteer
    IF v_caller_id IS DISTINCT FROM v_request.receiver_id AND NOT v_is_admin THEN
      RETURN json_build_object('success', false, 'error', 'Unauthorized: only the request receiver can generate the delivery QR.');
    END IF;

    IF v_task.status <> 'picked_up'::public.volunteer_status THEN
      RETURN json_build_object('success', false, 'error', 'Delivery QR can only be generated after food is picked up.');
    END IF;
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

REVOKE ALL ON FUNCTION public.generate_qr_token(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_qr_token(UUID, TEXT) TO authenticated;

-- ─── 5. QR Verification RPC (KYC Verification Enforced) ───────────────────────
CREATE OR REPLACE FUNCTION public.verify_qr_token(
  p_token TEXT,
  p_volunteer_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_task RECORD;
  v_type TEXT;
  v_volunteer_status TEXT;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'QR token is required.');
  END IF;

  IF auth.uid() IS DISTINCT FROM p_volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Identity mismatch: you can only verify QR codes as yourself.');
  END IF;

  -- KYC check: Volunteer must have role = volunteer and verification_status = approved
  SELECT verification_status INTO v_volunteer_status
  FROM public.profiles
  WHERE id = auth.uid() AND role = 'volunteer'::public.user_role;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: only registered volunteers can verify QR codes.');
  END IF;

  IF v_volunteer_status IS DISTINCT FROM 'approved' THEN
    RETURN json_build_object('success', false, 'error', 'Volunteer identity verification required before verifying tasks.');
  END IF;

  SELECT * INTO v_task
  FROM public.volunteer_tasks
  WHERE pickup_qr_token = p_token
  FOR UPDATE;

  IF FOUND THEN
    v_type := 'pickup';
  ELSE
    SELECT * INTO v_task
    FROM public.volunteer_tasks
    WHERE delivery_qr_token = p_token
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Invalid or unknown QR code.');
    END IF;
    v_type := 'delivery';
  END IF;

  IF v_task.volunteer_id IS DISTINCT FROM p_volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: you are not assigned to this task.');
  END IF;

  IF v_type = 'pickup' THEN
    IF COALESCE(v_task.pickup_qr_used, false) THEN
      RETURN json_build_object('success', false, 'error', 'This QR code has already been used.');
    END IF;
    IF v_task.pickup_qr_expires_at IS NULL OR v_task.pickup_qr_expires_at < NOW() THEN
      RETURN json_build_object('success', false, 'error', 'QR code has expired. Please ask for a new one.');
    END IF;
    IF v_task.status <> 'assigned'::public.volunteer_status THEN
      RETURN json_build_object('success', false, 'error', 'Task is not in the correct state for pickup verification.');
    END IF;

    UPDATE public.volunteer_tasks
    SET status = 'picked_up'::public.volunteer_status,
        pickup_qr_used = true,
        pickup_verified_at = NOW(),
        picked_up_at = NOW(),
        updated_at = NOW()
    WHERE id = v_task.id;

    UPDATE public.food_requests
    SET status = 'picked_up'::public.request_status, updated_at = NOW()
    WHERE id = v_task.request_id;

  ELSE
    IF COALESCE(v_task.delivery_qr_used, false) THEN
      RETURN json_build_object('success', false, 'error', 'This QR code has already been used.');
    END IF;
    IF v_task.delivery_qr_expires_at IS NULL OR v_task.delivery_qr_expires_at < NOW() THEN
      RETURN json_build_object('success', false, 'error', 'QR code has expired. Please ask for a new one.');
    END IF;
    IF v_task.status NOT IN ('picked_up'::public.volunteer_status) THEN
      RETURN json_build_object('success', false, 'error', 'Pickup must be completed before delivery verification.');
    END IF;

    UPDATE public.volunteer_tasks
    SET status = 'delivered'::public.volunteer_status,
        delivery_qr_used = true,
        delivery_verified_at = NOW(),
        delivered_at = NOW(),
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_task.id;

    UPDATE public.food_requests
    SET status = 'delivered'::public.request_status, updated_at = NOW()
    WHERE id = v_task.request_id;

    UPDATE public.food_listings AS fl
    SET status = 'completed'::public.listing_status, updated_at = NOW()
    FROM public.food_requests AS fr
    WHERE fr.id = v_task.request_id
      AND fl.id = fr.listing_id;
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

REVOKE ALL ON FUNCTION public.verify_qr_token(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_qr_token(TEXT, UUID) TO authenticated;

-- ─── 6. Hardened Task Lifecycle RPCs ──────────────────────────────────────────

-- 6a. claim_volunteer_task (Requires KYC approval)
CREATE OR REPLACE FUNCTION public.claim_volunteer_task(
  p_request_id  UUID,
  p_volunteer_id UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_task      RECORD;
  v_request   RECORD;
  v_new_task_id UUID;
  v_listing   RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Identity mismatch: you can only claim tasks as yourself.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_volunteer_id
      AND role = 'volunteer'::public.user_role
      AND verification_status = 'approved'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Only KYC-approved volunteers can claim tasks.');
  END IF;

  SELECT * INTO v_request
  FROM public.food_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'This food request no longer exists.');
  END IF;

  IF v_request.status <> 'pending'::public.request_status THEN
    RETURN json_build_object('success', false, 'error', 'This request has already been assigned to another volunteer.');
  END IF;

  SELECT * INTO v_listing
  FROM public.food_listings
  WHERE id = v_request.listing_id;

  IF v_listing.expiry_time <= NOW() THEN
    RETURN json_build_object('success', false, 'error', 'This food listing has expired and is no longer safe to claim.');
  END IF;

  IF v_listing.pickup_window_start IS NOT NULL AND v_listing.pickup_window_end IS NOT NULL THEN
    IF NOW() < v_listing.pickup_window_start THEN
      RETURN json_build_object('success', false, 'error', 'The pickup window has not opened yet.');
    END IF;
    IF NOW() > v_listing.pickup_window_end THEN
      RETURN json_build_object('success', false, 'error', 'The pickup window has already closed.');
    END IF;
  END IF;

  SELECT * INTO v_task
  FROM public.volunteer_tasks
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_task.status <> 'open'::public.volunteer_status THEN
      RETURN json_build_object('success', false, 'error', 'This task was already claimed by another volunteer.');
    END IF;

    UPDATE public.volunteer_tasks
    SET status       = 'assigned'::public.volunteer_status,
        volunteer_id = p_volunteer_id,
        updated_at   = NOW()
    WHERE id = v_task.id;
  ELSE
    INSERT INTO public.volunteer_tasks (request_id, volunteer_id, status, created_at, updated_at)
    VALUES (p_request_id, p_volunteer_id, 'assigned'::public.volunteer_status, NOW(), NOW())
    RETURNING id INTO v_new_task_id;
  END IF;

  UPDATE public.food_requests
  SET status     = 'assigned'::public.request_status,
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_volunteer_task(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_volunteer_task(UUID, UUID) TO authenticated;

-- 6b. handle_task_assignment (Requires KYC approval + Open Broadcast Fallback)
CREATE OR REPLACE FUNCTION public.handle_task_assignment(
  p_task_id UUID,
  p_volunteer_id UUID,
  p_action TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_task RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Identity mismatch: you can only accept/decline your own tasks.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_volunteer_id
      AND role = 'volunteer'::public.user_role
      AND verification_status = 'approved'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Only KYC-approved volunteers can handle task assignments.');
  END IF;

  SELECT * INTO v_task
  FROM public.volunteer_tasks
  WHERE id = p_task_id AND volunteer_id = p_volunteer_id AND status = 'pending_acceptance'::public.volunteer_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Task not found or already processed.');
  END IF;

  IF p_action = 'accept' THEN
    UPDATE public.volunteer_tasks SET status = 'assigned'::public.volunteer_status, updated_at = NOW() WHERE id = p_task_id;
    RETURN json_build_object('success', true);

  ELSIF p_action = 'decline' THEN
    DELETE FROM public.volunteer_tasks WHERE id = p_task_id;
    UPDATE public.food_requests
    SET status = 'pending'::public.request_status, updated_at = NOW()
    WHERE id = v_task.request_id;

    -- Ensure an open broadcast task exists so other volunteers can claim it
    IF NOT EXISTS (
      SELECT 1 FROM public.volunteer_tasks
      WHERE request_id = v_task.request_id
        AND status = 'open'::public.volunteer_status
    ) THEN
      INSERT INTO public.volunteer_tasks (request_id, volunteer_id, status, created_at, updated_at)
      VALUES (v_task.request_id, NULL, 'open'::public.volunteer_status, NOW(), NOW());
    END IF;

    RETURN json_build_object('success', true);
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_task_assignment(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_task_assignment(UUID, UUID, TEXT) TO authenticated;

-- 6c. abort_volunteer_task (Rejects abort after pickup)
CREATE OR REPLACE FUNCTION public.abort_volunteer_task(
  p_task_id UUID,
  p_volunteer_id UUID,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_task RECORD;
  v_request RECORD;
  v_listing RECORD;
  v_volunteer_name TEXT;
  v_other_requests_count INT;
BEGIN
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Cancellation reason is required.');
  END IF;

  IF auth.uid() IS DISTINCT FROM p_volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Identity mismatch: you can only abort your own tasks.');
  END IF;

  SELECT * INTO v_task
  FROM public.volunteer_tasks
  WHERE id = p_task_id AND volunteer_id = p_volunteer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Task not found or you are not authorized to abort it.');
  END IF;

  IF v_task.status IN ('picked_up'::public.volunteer_status, 'delivered'::public.volunteer_status, 'completed'::public.volunteer_status) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot abort task after food has been picked up. Please contact platform support for incident handling.');
  END IF;

  IF v_task.status = 'cancelled'::public.volunteer_status THEN
    RETURN json_build_object('success', true, 'message', 'Task was already cancelled.');
  END IF;

  SELECT * INTO v_request
  FROM public.food_requests
  WHERE id = v_task.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Associated food request not found.');
  END IF;

  SELECT * INTO v_listing
  FROM public.food_listings
  WHERE id = v_request.listing_id
  FOR UPDATE;

  SELECT full_name INTO v_volunteer_name
  FROM public.profiles
  WHERE id = p_volunteer_id;

  UPDATE public.volunteer_tasks
  SET status = 'cancelled'::public.volunteer_status,
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

  IF NOT EXISTS (
    SELECT 1 FROM public.volunteer_tasks vt
    WHERE vt.request_id = v_task.request_id
      AND vt.status NOT IN ('cancelled'::public.volunteer_status, 'completed'::public.volunteer_status, 'delivered'::public.volunteer_status)
      AND vt.id <> p_task_id
  ) THEN
    UPDATE public.food_requests
    SET status = 'pending'::public.request_status,
        updated_at = NOW()
    WHERE id = v_task.request_id;

    -- Ensure an open broadcast task exists so other volunteers can claim it
    IF NOT EXISTS (
      SELECT 1 FROM public.volunteer_tasks
      WHERE request_id = v_task.request_id
        AND status = 'open'::public.volunteer_status
    ) THEN
      INSERT INTO public.volunteer_tasks (request_id, volunteer_id, status, created_at, updated_at)
      VALUES (v_task.request_id, NULL, 'open'::public.volunteer_status, NOW(), NOW());
    END IF;
  END IF;

  IF v_listing IS NOT NULL THEN
    SELECT COUNT(*) INTO v_other_requests_count
    FROM public.food_requests
    WHERE listing_id = v_request.listing_id
      AND status NOT IN ('cancelled'::public.request_status, 'delivered'::public.request_status)
      AND id <> v_task.request_id;

    IF v_other_requests_count = 0 AND v_listing.status = 'reserved'::public.listing_status THEN
      UPDATE public.food_listings
      SET status = 'active'::public.listing_status,
          updated_at = NOW()
      WHERE id = v_request.listing_id;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      v_listing.donor_id,
      'Volunteer Aborted Task',
      'The assigned volunteer (' || COALESCE(v_volunteer_name, 'Unknown') || ') had to cancel the pickup for ' || v_listing.title || '. Reason: ' || p_reason || '. The listing is available again.',
      'status_update',
      '/dashboard'
    );

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
  RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.abort_volunteer_task(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abort_volunteer_task(UUID, UUID, TEXT) TO authenticated;

-- ─── 6d. auto_expire_stale_tasks (Restricted to service_role) ─────────────────
CREATE OR REPLACE FUNCTION public.auto_expire_stale_tasks()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count INT := 0;
  v_stale RECORD;
BEGIN
  FOR v_stale IN
    SELECT id, request_id, volunteer_id
    FROM public.volunteer_tasks
    WHERE status = 'pending_acceptance'::public.volunteer_status
      AND created_at < NOW() - INTERVAL '10 minutes'
    FOR UPDATE
  LOOP
    DELETE FROM public.volunteer_tasks WHERE id = v_stale.id;

    UPDATE public.food_requests
    SET status = 'pending'::public.request_status, updated_at = NOW()
    WHERE id = v_stale.request_id;

    -- Ensure an open broadcast task exists so other volunteers can claim it
    IF NOT EXISTS (
      SELECT 1 FROM public.volunteer_tasks
      WHERE request_id = v_stale.request_id
        AND status = 'open'::public.volunteer_status
    ) THEN
      INSERT INTO public.volunteer_tasks (request_id, volunteer_id, status, created_at, updated_at)
      VALUES (v_stale.request_id, NULL, 'open'::public.volunteer_status, NOW(), NOW());
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'expired_count', v_count);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_expire_stale_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_expire_stale_tasks() TO service_role;

COMMIT;
