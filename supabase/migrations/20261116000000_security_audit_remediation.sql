-- =============================================================================
-- Zero Food Waste: Security Audit Remediation
-- Fixes all critical (P0) and high (P1) issues from the November 2026 audit.
-- Safe to apply on top of all previous migrations.
-- =============================================================================

-- ─── SECTION 1: Restrict profile reads (Issue 1 — P0) ───────────────────────
-- The old policy allowed ANYONE with the public API key to read ALL profiles,
-- including full names, phone numbers, location data, and KYC document paths.
-- Both old and new policy names are dropped to make this re-runnable.
DROP POLICY IF EXISTS "profiles_select_all"           ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin"  ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.has_permission(auth.uid(), 'users.read')
  );

-- ─── SECTION 2: Protect KYC approval fields from client writes (Issue 2 — P0) ─
-- The existing trigger only blocks role changes. This new trigger blocks
-- normal authenticated clients from self-approving their KYC status.
--
-- IMPORTANT: SECURITY DEFINER does NOT change the JWT role seen by auth.role().
-- Even the admin_update_kyc_status() RPC in Section 3 runs with
-- auth.role() = 'authenticated'. We therefore exempt callers who hold the
-- 'users.verify' permission (admins) rather than relying on the JWT role alone.
-- Service-role calls (e.g. supabase-admin client) have auth.role() = 'service_role'
-- and are always exempt.
CREATE OR REPLACE FUNCTION public.protect_kyc_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Only restrict normal authenticated (non-service-role) callers who are NOT admins
  IF auth.role() = 'authenticated'
     AND NOT public.has_permission(auth.uid(), 'users.verify') THEN

    -- Block direct self-approval of verification_status
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
       AND NEW.verification_status = 'approved' THEN
      RAISE EXCEPTION 'Unauthorized: clients cannot self-approve KYC status.';
    END IF;

    -- Block directly setting is_verified = true
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
       AND NEW.is_verified = true THEN
      RAISE EXCEPTION 'Unauthorized: clients cannot set is_verified directly.';
    END IF;

    -- Block directly setting document_verified = true
    IF NEW.document_verified IS DISTINCT FROM OLD.document_verified
       AND NEW.document_verified = true THEN
      RAISE EXCEPTION 'Unauthorized: clients cannot set document_verified directly.';
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_protect_kyc_fields ON public.profiles;
CREATE TRIGGER trigger_protect_kyc_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_kyc_fields();

-- ─── SECTION 3: Add admin_update_kyc_status RPC (Issue 6 — P1) ──────────────
-- Admin KYC approval/rejection must go through this trusted function instead
-- of a direct table update (which is blocked by RLS for cross-user updates).
CREATE OR REPLACE FUNCTION public.admin_update_kyc_status(
  p_user_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows_affected INT;
BEGIN
  -- Caller must have admin verification permission
  IF NOT public.has_permission(auth.uid(), 'users.verify') THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: admin access required.');
  END IF;

  -- Validate status value
  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid status. Use approved, rejected, or pending.');
  END IF;

  IF p_status = 'approved' THEN
    UPDATE public.profiles
    SET verification_status            = 'approved',
        is_verified                    = true,
        document_verified              = true,
        verification_rejection_reason  = NULL,
        updated_at                     = NOW()
    WHERE id = p_user_id;
  ELSIF p_status = 'rejected' THEN
    UPDATE public.profiles
    SET verification_status            = 'rejected',
        is_verified                    = false,
        document_verified              = false,
        verification_rejection_reason  = p_rejection_reason,
        updated_at                     = NOW()
    WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
    SET verification_status = 'pending',
        updated_at          = NOW()
    WHERE id = p_user_id;
  END IF;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RETURN json_build_object('success', false, 'error', 'User not found or no rows updated.');
  END IF;

  RETURN json_build_object('success', true, 'affected', v_rows_affected);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_kyc_status(UUID, TEXT, TEXT) TO authenticated;

-- ─── SECTION 4: Volunteer RPC identity binding (Issue 3 — P0) ───────────────
-- All SECURITY DEFINER functions that accept p_volunteer_id must verify
-- that auth.uid() = p_volunteer_id. Without this check, any authenticated
-- user can supply another volunteer's UUID and act on their behalf.

-- 4a. claim_volunteer_task — add auth.uid() == p_volunteer_id guard
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
  -- SECURITY: caller must be the volunteer they claim to be
  IF auth.uid() IS DISTINCT FROM p_volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Identity mismatch: you can only claim tasks as yourself.');
  END IF;

  -- Role check: verify caller is actually a volunteer
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_volunteer_id AND role = 'volunteer'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Only registered volunteers can claim tasks.');
  END IF;

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

  -- Strict pickup window validation
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

-- 4b. handle_task_assignment — add auth.uid() == p_volunteer_id guard
CREATE OR REPLACE FUNCTION public.handle_task_assignment(
  p_task_id UUID,
  p_volunteer_id UUID,
  p_action TEXT -- 'accept' or 'decline'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
BEGIN
  -- SECURITY: caller must be the volunteer they claim to be
  IF auth.uid() IS DISTINCT FROM p_volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Identity mismatch: you can only accept/decline your own tasks.');
  END IF;

  -- Role check: verify caller is actually a volunteer
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_volunteer_id AND role = 'volunteer'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Only registered volunteers can handle task assignments.');
  END IF;

  -- Verify task exists and is pending
  SELECT * INTO v_task
  FROM public.volunteer_tasks
  WHERE id = p_task_id AND volunteer_id = p_volunteer_id AND status = 'pending_acceptance'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Task not found or already processed.');
  END IF;

  IF p_action = 'accept' THEN
    UPDATE public.volunteer_tasks SET status = 'assigned', updated_at = NOW() WHERE id = p_task_id;
    RETURN json_build_object('success', true);

  ELSIF p_action = 'decline' THEN
    DELETE FROM public.volunteer_tasks WHERE id = p_task_id;
    UPDATE public.food_requests
    SET status = 'pending', updated_at = NOW()
    WHERE id = v_task.request_id;
    RETURN json_build_object('success', true);
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_task_assignment(UUID, UUID, TEXT) TO authenticated;

-- 4c. generate_qr_token — verify caller is the assigned volunteer
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

  -- SECURITY: caller must be the assigned volunteer for this task
  IF auth.uid() IS DISTINCT FROM v_task.volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: you are not assigned to this task.');
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
    SET pickup_qr_token     = v_token,
        pickup_qr_expires_at = v_expires_at,
        pickup_qr_used       = false,
        updated_at           = NOW()
    WHERE id = p_task_id;
  ELSE
    UPDATE public.volunteer_tasks
    SET delivery_qr_token     = v_token,
        delivery_qr_expires_at = v_expires_at,
        delivery_qr_used       = false,
        updated_at             = NOW()
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

-- 4d. abort_volunteer_task — reinforce identity check with explicit error
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

  -- SECURITY: caller must be the volunteer they claim to be
  IF auth.uid() IS DISTINCT FROM p_volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Identity mismatch: you can only abort your own tasks.');
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

  -- Update the task: mark as cancelled, set reason, fully invalidate QR tokens
  UPDATE public.volunteer_tasks
  SET status               = 'cancelled',
      cancellation_reason  = p_reason,
      cancelled_at         = NOW(),
      pickup_qr_token      = NULL,
      delivery_qr_token    = NULL,
      pickup_qr_used       = TRUE,
      delivery_qr_used     = TRUE,
      pickup_qr_expires_at  = NOW(),
      delivery_qr_expires_at = NOW(),
      updated_at           = NOW()
  WHERE id = p_task_id;

  -- Revert the food request to pending ONLY if no other volunteer is actively handling it
  IF NOT EXISTS (
    SELECT 1 FROM public.volunteer_tasks vt
    WHERE vt.request_id = v_task.request_id
    AND vt.status NOT IN ('cancelled', 'completed', 'delivered')
    AND vt.id != p_task_id
  ) THEN
    UPDATE public.food_requests
    SET status = 'pending', updated_at = NOW()
    WHERE id = v_task.request_id;
  END IF;

  IF v_listing IS NOT NULL THEN
    SELECT COUNT(*) INTO v_other_requests_count
    FROM public.food_requests
    WHERE listing_id = v_request.listing_id
      AND status NOT IN ('cancelled', 'delivered')
      AND id != v_task.request_id;

    IF v_other_requests_count = 0 AND v_listing.status = 'reserved' THEN
      UPDATE public.food_listings
      SET status = 'active', updated_at = NOW()
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
  RETURN json_build_object('success', false, 'error', 'Internal server error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.abort_volunteer_task(UUID, UUID, TEXT) TO authenticated;

-- 4e. verify_qr_token — was missing from the original fix; add identity binding
-- The token already encodes the task, but p_volunteer_id was accepted without
-- verifying that auth.uid() matches, allowing any authenticated user to verify
-- a QR code on behalf of another volunteer.
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
  -- SECURITY: caller must be the volunteer they claim to be
  IF auth.uid() IS DISTINCT FROM p_volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Identity mismatch: you can only verify QR codes as yourself.');
  END IF;

  -- Role check: verify caller is actually a volunteer
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_volunteer_id AND role = 'volunteer'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Only registered volunteers can verify QR codes.');
  END IF;

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

  -- Volunteer authorization check (belt-and-suspenders: also validates against task row)
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
      RETURN json_build_object('success', false, 'error',
        'Task is not in the correct state for pickup verification (current: ' || v_task.status || ').');
    END IF;

    UPDATE public.volunteer_tasks
    SET status               = 'picked_up',
        pickup_qr_used       = true,
        pickup_verified_at   = NOW(),
        picked_up_at         = NOW(),
        updated_at           = NOW()
    WHERE id = v_task.id;

    UPDATE public.food_requests
    SET status = 'picked_up', updated_at = NOW()
    WHERE id = v_task.request_id;

  ELSE -- delivery
    IF v_task.status NOT IN ('picked_up', 'in_progress') THEN
      RETURN json_build_object('success', false, 'error',
        'Pickup must be completed before delivery verification (current: ' || v_task.status || ').');
    END IF;

    UPDATE public.volunteer_tasks
    SET status                 = 'delivered',
        delivery_qr_used       = true,
        delivery_verified_at   = NOW(),
        delivered_at           = NOW(),
        completed_at           = NOW(),
        updated_at             = NOW()
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

GRANT EXECUTE ON FUNCTION public.verify_qr_token(TEXT, UUID) TO authenticated;

-- ─── SECTION 4f: Revoke & Drop Legacy Task OTP Functions ─────────────────
-- Project specification requires QR verification ONLY.
-- Legacy task OTP functions are completely revoked and removed.
REVOKE ALL ON FUNCTION public.generate_task_otp(UUID, TEXT)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_task_otp(UUID, UUID, TEXT, TEXT)
FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.generate_task_otp(UUID, TEXT);
DROP FUNCTION IF EXISTS public.verify_task_otp(UUID, UUID, TEXT, TEXT);

-- ─── SECTION 5: Separate read and write permissions (Issue 5 — P1) ───────────
-- Volunteers have food.read_all and requests.read_all, but those permissions
-- were incorrectly used in UPDATE policies giving volunteers write access.

-- Add dedicated write permissions
INSERT INTO public.permissions (name, description) VALUES
  ('food.update_all',     'Update any food listing (admin only)'),
  ('requests.update_all', 'Update any food request (admin only)')
ON CONFLICT (name) DO NOTHING;

-- Assign food.update_all and requests.update_all to admin only
DO $$
DECLARE
  p_id UUID;
BEGIN
  SELECT id INTO p_id FROM public.permissions WHERE name = 'food.update_all';
  IF p_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role, permission_id)
    VALUES ('admin'::public.user_role, p_id) ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO p_id FROM public.permissions WHERE name = 'requests.update_all';
  IF p_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role, permission_id)
    VALUES ('admin'::public.user_role, p_id) ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Fix food_listings UPDATE policy: use food.update_all instead of food.read_all
DROP POLICY IF EXISTS "listings_update_donor" ON public.food_listings;
CREATE POLICY "listings_update_donor" ON public.food_listings
  FOR UPDATE USING (
    auth.uid() = donor_id
    OR public.has_permission(auth.uid(), 'food.update_all')
  );

-- Fix food_requests UPDATE policy: use requests.update_all instead of requests.read_all
DROP POLICY IF EXISTS "requests_update_receiver" ON public.food_requests;
CREATE POLICY "requests_update_receiver" ON public.food_requests
  FOR UPDATE USING (
    auth.uid() = receiver_id
    OR public.has_permission(auth.uid(), 'requests.update_all')
  );

-- ─── SECTION 6: Fix admin permission name mismatch (Issue 7 — P1) ────────────
-- The fix_volunteer_task_rls migration used 'tasks.read_all' in RLS policies
-- but that permission was never seeded — only 'tasks.view_assigned' exists.
-- Solution: add 'tasks.read_all', assign it to admin, and update the policies.

INSERT INTO public.permissions (name, description) VALUES
  ('tasks.read_all', 'Read and manage all volunteer tasks (admin only)')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  p_id UUID;
BEGIN
  SELECT id INTO p_id FROM public.permissions WHERE name = 'tasks.read_all';
  IF p_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role, permission_id)
    VALUES ('admin'::public.user_role, p_id) ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Recreate volunteer_tasks SELECT policy with correct permission
DROP POLICY IF EXISTS "tasks_select" ON public.volunteer_tasks;
CREATE POLICY "tasks_select" ON public.volunteer_tasks
  FOR SELECT USING (
    status = 'open'                                              -- broadcast pool
    OR auth.uid() = volunteer_id                                 -- assigned volunteer sees own tasks
    OR public.has_permission(auth.uid(), 'tasks.read_all')       -- admin sees everything
  );

-- Recreate volunteer_tasks UPDATE policy with correct permission
DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks;
CREATE POLICY "tasks_update" ON public.volunteer_tasks
  FOR UPDATE USING (
    status = 'open'                                              -- anyone can claim an open task
    OR auth.uid() = volunteer_id                                 -- assigned volunteer can update own task
    OR public.has_permission(auth.uid(), 'tasks.read_all')       -- admin can update any task
  );

-- Recreate volunteer_tasks INSERT policy with correct permission
DROP POLICY IF EXISTS "tasks_insert" ON public.volunteer_tasks;
CREATE POLICY "tasks_insert" ON public.volunteer_tasks
  FOR INSERT WITH CHECK (
    auth.uid() = volunteer_id                                    -- volunteer self-claims
    OR public.has_permission(auth.uid(), 'tasks.read_all')       -- admin/service inserts
  );

-- ─── SECTION 7: Persist donor location on signup + harden role mapping ───────
-- (a) Extends handle_new_user to persist address/latitude/longitude metadata.
-- (b) Maps the legacy 'ngo' role value to 'receiver' so old or mis-matched
--     frontend builds never silently create a donor account for a receiver.
-- (c) Adds ON CONFLICT DO UPDATE so re-applying this trigger is idempotent.
--
-- Frontend status (verified in source):
--   • DonorSignup.tsx    — sends address, latitude, longitude ✓
--   • ReceiverSignup.tsx — sends role: 'receiver'             ✓
-- The ngo → receiver mapping below is a defensive belt-and-suspenders guard.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested_role TEXT;
  assigned_role  public.user_role;
  raw_full_name  TEXT;
  raw_phone      TEXT;
  raw_address    TEXT;
  raw_lat        DOUBLE PRECISION;
  raw_lng        DOUBLE PRECISION;
BEGIN
  requested_role := NEW.raw_user_meta_data->>'role';
  raw_full_name  := NEW.raw_user_meta_data->>'full_name';
  raw_phone      := NEW.raw_user_meta_data->>'phone';
  raw_address    := COALESCE(NEW.raw_user_meta_data->>'address', NEW.raw_user_meta_data->>'city');

  -- Safely cast lat/lng (may be null or missing)
  BEGIN
    raw_lat := (NEW.raw_user_meta_data->>'latitude')::DOUBLE PRECISION;
  EXCEPTION WHEN OTHERS THEN
    raw_lat := NULL;
  END;
  BEGIN
    raw_lng := (NEW.raw_user_meta_data->>'longitude')::DOUBLE PRECISION;
  EXCEPTION WHEN OTHERS THEN
    raw_lng := NULL;
  END;

  -- Strict validation: block client-side admin escalation and map legacy roles
  IF requested_role = 'admin' THEN
    assigned_role := 'donor'::public.user_role;
  ELSIF requested_role IN ('receiver', 'ngo') THEN
    assigned_role := 'receiver'::public.user_role;
  ELSIF requested_role IN ('donor', 'volunteer') THEN
    assigned_role := requested_role::public.user_role;
  ELSE
    assigned_role := 'donor'::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, role, location_text, location_lat, location_lng)
  VALUES (NEW.id, raw_full_name, raw_phone, assigned_role, raw_address, raw_lat, raw_lng)
  ON CONFLICT (id) DO UPDATE
    SET full_name     = EXCLUDED.full_name,
        phone         = EXCLUDED.phone,
        role          = EXCLUDED.role,
        location_text = COALESCE(EXCLUDED.location_text, public.profiles.location_text),
        location_lat  = COALESCE(EXCLUDED.location_lat,  public.profiles.location_lat),
        location_lng  = COALESCE(EXCLUDED.location_lng,  public.profiles.location_lng);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
