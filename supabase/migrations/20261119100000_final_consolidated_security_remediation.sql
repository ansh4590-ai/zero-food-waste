-- =============================================================================
-- Zero Food Waste — FINAL CONSOLIDATED SECURITY REMEDIATION (LIVE-VERIFIED)
--
-- Cross-checked against the live Supabase database introspection dump:
--   1. Drops all legacy permissive policies that bypassed security:
--      • "Public profiles are viewable by authenticated users." (qual: true)
--      • "Food listings are viewable by authenticated users." (qual: true)
--      • "Users can view requests they are part of."
--      • "Volunteers can update their own tasks"
--      • "Authenticated users can create tasks" & "tasks_insert"
--   2. Enforces strict P0 QR-only transitions by revoking INSERT/UPDATE on volunteer_tasks.
--   3. KYC trigger matches exact live schema defaults (0, 'pending', '{}'::jsonb).
--   4. Admin bypass uses 'users.read' instead of 'requests.read_all'.
--   5. Public access revoked from auto_expire_stale_tasks() (granted only to service_role).
--   6. Profiles table locked to owner and admin; task_participants_contact view provides safe contact info.
--   7. Hardens claim_volunteer_task, handle_task_assignment, and abort_volunteer_task.
-- =============================================================================

BEGIN;

-- ─── 0. PRE-FLIGHT CHECKS ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.profiles';
  END IF;
  IF to_regclass('public.food_requests') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.food_requests';
  END IF;
  IF to_regclass('public.food_listings') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.food_listings';
  END IF;
  IF to_regclass('public.volunteer_tasks') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.volunteer_tasks';
  END IF;
  IF to_regprocedure('public.has_permission(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing function public.has_permission(uuid,text)';
  END IF;
END;
$$;

-- ─── 1. SECURITY DEFINER helpers: caller identity comes from auth.uid() ──────

CREATE OR REPLACE FUNCTION public.can_volunteer_view_request(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.volunteer_tasks AS vt
    JOIN public.profiles AS p ON p.id = auth.uid()
    WHERE vt.request_id = p_request_id
      AND p.role = 'volunteer'::public.user_role
      AND (
        vt.volunteer_id = auth.uid()
        OR (
          vt.status IN ('open'::public.volunteer_status, 'pending_acceptance'::public.volunteer_status)
          AND vt.volunteer_id IS NULL
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_donor_view_request(p_listing_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.food_listings AS fl
    WHERE fl.id = p_listing_id
      AND fl.donor_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile_for_task(p_target_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.volunteer_tasks AS vt
    JOIN public.food_requests AS fr ON fr.id = vt.request_id
    JOIN public.food_listings AS fl ON fl.id = fr.listing_id
    WHERE (
        vt.volunteer_id = auth.uid()
        OR fr.receiver_id = auth.uid()
        OR fl.donor_id = auth.uid()
      )
      AND p_target_profile_id IN (vt.volunteer_id, fr.receiver_id, fl.donor_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_volunteer_view_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_donor_view_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_profile_for_task(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_volunteer_view_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_donor_view_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile_for_task(UUID) TO authenticated;

-- Drop obsolete 2-argument helper overloads
DO $$
BEGIN
  IF to_regprocedure('public.can_volunteer_view_request(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.can_volunteer_view_request(UUID, UUID) FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.can_volunteer_view_request(UUID, UUID);
  END IF;

  IF to_regprocedure('public.can_donor_view_request(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.can_donor_view_request(UUID, UUID) FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.can_donor_view_request(UUID, UUID);
  END IF;

  IF to_regprocedure('public.can_view_profile_for_task(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.can_view_profile_for_task(UUID, UUID) FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.can_view_profile_for_task(UUID, UUID);
  END IF;
END;
$$;

-- ─── 2. Clean up & Harden PROFILES Policies ──────────────────────────────────
-- Drop ALL legacy policies identified in the live introspection dump
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users." ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_authorized" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
FOR SELECT
USING (
  auth.uid() = id
  OR public.has_permission(auth.uid(), 'users.read')
);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

-- ─── 3. Task Participants Contact View (Safe Column Projection) ───────────────
CREATE OR REPLACE VIEW public.task_participants_contact
WITH (security_invoker = false)
AS
SELECT
  p.id,
  p.full_name,
  p.phone,
  p.role,
  p.location_lat,
  p.location_lng,
  p.location_text,
  p.is_verified
FROM public.profiles p
WHERE
  auth.uid() = p.id
  OR public.can_view_profile_for_task(p.id)
  OR EXISTS (
    SELECT 1 FROM public.food_listings fl
    WHERE fl.donor_id = p.id AND fl.status = 'active'::public.listing_status
  )
  OR public.has_permission(auth.uid(), 'users.read');

REVOKE ALL ON TABLE public.task_participants_contact FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.task_participants_contact TO authenticated, anon;

-- ─── 4. Clean up & Harden FOOD_LISTINGS Policies ─────────────────────────────
DROP POLICY IF EXISTS "Food listings are viewable by authenticated users." ON public.food_listings;
DROP POLICY IF EXISTS "listings_select" ON public.food_listings;
DROP POLICY IF EXISTS "listings_select_volunteer" ON public.food_listings;
DROP POLICY IF EXISTS "listings_select_all" ON public.food_listings;
DROP POLICY IF EXISTS "listings_select_authorized" ON public.food_listings;

CREATE POLICY "listings_select_authorized" ON public.food_listings
FOR SELECT
USING (
  status = 'active'::public.listing_status
  OR auth.uid() = donor_id
  OR EXISTS (
    SELECT 1
    FROM public.food_requests AS fr
    WHERE fr.listing_id = food_listings.id
      AND fr.receiver_id = auth.uid()
      AND fr.status IN (
        'pending'::public.request_status,
        'assigned'::public.request_status,
        'picked_up'::public.request_status,
        'delivered'::public.request_status,
        'completed'::public.request_status
      )
  )
  OR (
    status = 'reserved'::public.listing_status
    AND EXISTS (
      SELECT 1
      FROM public.food_requests AS fr
      JOIN public.volunteer_tasks AS vt ON vt.request_id = fr.id
      WHERE fr.listing_id = food_listings.id
        AND vt.volunteer_id = auth.uid()
    )
  )
  OR public.has_permission(auth.uid(), 'users.read')
);

-- ─── 5. Clean up & Harden FOOD_REQUESTS Policies ─────────────────────────────
DROP POLICY IF EXISTS "Users can view requests they are part of." ON public.food_requests;
DROP POLICY IF EXISTS "requests_select" ON public.food_requests;
DROP POLICY IF EXISTS "requests_select_volunteer" ON public.food_requests;
DROP POLICY IF EXISTS "requests_select_all_authorized" ON public.food_requests;
DROP POLICY IF EXISTS "Participants can update requests." ON public.food_requests;
DROP POLICY IF EXISTS "requests_update_receiver" ON public.food_requests;
DROP POLICY IF EXISTS "requests_update" ON public.food_requests;

CREATE POLICY "requests_select_all_authorized" ON public.food_requests
FOR SELECT
USING (
  auth.uid() = receiver_id
  OR public.can_donor_view_request(listing_id)
  OR public.can_volunteer_view_request(id)
  OR public.has_permission(auth.uid(), 'users.read')
);

-- ─── 6. Clean up & Lock Down VOLUNTEER_TASKS (P0 QR-Only Enforcement) ────────
DROP POLICY IF EXISTS "Authenticated users can create tasks" ON public.volunteer_tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.volunteer_tasks;
DROP POLICY IF EXISTS "Volunteers can update their own tasks" ON public.volunteer_tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks;
DROP POLICY IF EXISTS "Users can view tasks related to them" ON public.volunteer_tasks;
DROP POLICY IF EXISTS "tasks_select" ON public.volunteer_tasks;

CREATE POLICY "tasks_select" ON public.volunteer_tasks
FOR SELECT
USING (
  status = 'open'::public.volunteer_status
  OR (status = 'pending_acceptance'::public.volunteer_status AND volunteer_id IS NULL)
  OR auth.uid() = volunteer_id
  OR public.has_permission(auth.uid(), 'users.read')
);

-- Revoke direct mutations from authenticated users. All updates must use RPCs.
REVOKE INSERT, UPDATE ON TABLE public.volunteer_tasks FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.volunteer_tasks TO service_role;

-- ─── 7. QR Token Generation RPC ──────────────────────────────────────────────
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
  v_role public.user_role;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('pickup', 'delivery') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid type. Use pickup or delivery.');
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS DISTINCT FROM 'volunteer'::public.user_role THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: only volunteers can generate QR tokens.');
  END IF;

  SELECT * INTO v_task
  FROM public.volunteer_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Task not found.');
  END IF;

  IF auth.uid() IS DISTINCT FROM v_task.volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: you are not assigned to this task.');
  END IF;

  IF p_type = 'pickup' AND v_task.status <> 'assigned'::public.volunteer_status THEN
    RETURN json_build_object('success', false, 'error', 'Pickup QR can only be generated for an assigned task.');
  END IF;

  IF p_type = 'delivery' AND v_task.status NOT IN ('picked_up'::public.volunteer_status, 'in_progress'::public.volunteer_status) THEN
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

REVOKE ALL ON FUNCTION public.generate_qr_token(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_qr_token(UUID, TEXT) TO authenticated;

-- ─── 8. QR Verification RPC ──────────────────────────────────────────────────
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
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'QR token is required.');
  END IF;

  IF auth.uid() IS DISTINCT FROM p_volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Identity mismatch: you can only verify QR codes as yourself.');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'volunteer'::public.user_role
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: only volunteers can verify QR codes.');
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
    IF v_task.status NOT IN ('picked_up'::public.volunteer_status, 'in_progress'::public.volunteer_status) THEN
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

-- ─── 9. Hardened Task Lifecycle RPCs ──────────────────────────────────────────

-- 9a. claim_volunteer_task
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
    WHERE id = p_volunteer_id AND role = 'volunteer'::public.user_role
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Only registered volunteers can claim tasks.');
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

-- 9b. handle_task_assignment
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
    WHERE id = p_volunteer_id AND role = 'volunteer'::public.user_role
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Only registered volunteers can handle task assignments.');
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
    RETURN json_build_object('success', true);
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_task_assignment(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_task_assignment(UUID, UUID, TEXT) TO authenticated;

-- 9c. abort_volunteer_task
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

  IF v_task.status IN ('delivered'::public.volunteer_status, 'completed'::public.volunteer_status) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot abort a task that is already completed or delivered.');
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

-- 9d. auto_expire_stale_tasks (Restricted to service_role)
CREATE OR REPLACE FUNCTION public.auto_expire_stale_tasks()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH stale AS (
    SELECT id, request_id, volunteer_id
    FROM public.volunteer_tasks
    WHERE status = 'pending_acceptance'::public.volunteer_status
      AND created_at < NOW() - INTERVAL '10 minutes'
  )
  UPDATE public.food_requests fr
  SET status = 'pending'::public.request_status, updated_at = NOW()
  FROM stale s
  WHERE fr.id = s.request_id;

  WITH deleted AS (
    DELETE FROM public.volunteer_tasks
    WHERE status = 'pending_acceptance'::public.volunteer_status
      AND created_at < NOW() - INTERVAL '10 minutes'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN json_build_object('success', true, 'expired_count', v_count);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_expire_stale_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_expire_stale_tasks() TO service_role;

-- 9e. cancel_food_request (Receiver / Admin Request Cancellation RPC)
CREATE OR REPLACE FUNCTION public.cancel_food_request(
  p_request_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request RECORD;
  v_listing RECORD;
  v_other_requests_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized.');
  END IF;

  SELECT * INTO v_request
  FROM public.food_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found.');
  END IF;

  -- Only the receiver or an admin can cancel the food request
  IF v_request.receiver_id != auth.uid() AND NOT public.has_permission(auth.uid(), 'users.read') THEN
    RETURN json_build_object('success', false, 'error', 'Forbidden: you can only cancel your own food requests.');
  END IF;

  -- Only pending requests can be cancelled directly by the receiver
  IF v_request.status <> 'pending'::public.request_status THEN
    RETURN json_build_object('success', false, 'error', 'Cannot cancel request: request is already ' || v_request.status::text || '.');
  END IF;

  -- Mark the request as cancelled
  UPDATE public.food_requests
  SET status = 'cancelled'::public.request_status,
      updated_at = NOW()
  WHERE id = p_request_id;

  -- Cancel any associated open or pending volunteer task
  UPDATE public.volunteer_tasks
  SET status = 'cancelled'::public.volunteer_status,
      updated_at = NOW()
  WHERE request_id = p_request_id
    AND status IN ('open'::public.volunteer_status, 'pending_acceptance'::public.volunteer_status);

  -- Release the listing reservation if no other active requests remain
  SELECT * INTO v_listing
  FROM public.food_listings
  WHERE id = v_request.listing_id;

  IF v_listing IS NOT NULL THEN
    SELECT COUNT(*) INTO v_other_requests_count
    FROM public.food_requests
    WHERE listing_id = v_request.listing_id
      AND status NOT IN ('cancelled'::public.request_status, 'delivered'::public.request_status)
      AND id <> p_request_id;

    IF v_other_requests_count = 0 AND v_listing.status = 'reserved'::public.listing_status THEN
      UPDATE public.food_listings
      SET status = 'active'::public.listing_status,
          updated_at = NOW()
      WHERE id = v_request.listing_id;
    END IF;
  END IF;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_food_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_food_request(UUID) TO authenticated, service_role;

-- ─── 10. KYC Trigger With Exact Live Schema Defaults ──────────────────────────
CREATE OR REPLACE FUNCTION public.protect_kyc_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid TEXT;
  v_prefix TEXT;
  v_key TEXT;
  v_value JSONB;
  v_path TEXT;
BEGIN
  IF auth.role() = 'authenticated'
     AND NOT COALESCE(public.has_permission(auth.uid(), 'users.verify'), false) THEN

    IF TG_OP = 'INSERT' THEN
      -- Profiles must start with default 'unset'
      IF NEW.verification_status IS DISTINCT FROM 'unset' THEN
        RAISE EXCEPTION 'Unauthorized: client-created profiles must start with verification_status unset.';
      END IF;

      IF NEW.is_verified IS TRUE OR NEW.document_verified IS TRUE THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot set verification flags on insert.';
      END IF;

      -- Check against live database defaults
      IF NEW.kyc_score IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'Unauthorized: kyc_score on insert must match schema default (0).';
      END IF;

      IF NEW.kyc_auto_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Unauthorized: kyc_auto_status on insert must match schema default (pending).';
      END IF;

      IF NEW.face_match_score IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: face_match_score on insert must be NULL.';
      END IF;

      IF NEW.extracted_data IS DISTINCT FROM '{}'::JSONB THEN
        RAISE EXCEPTION 'Unauthorized: extracted_data on insert must match schema default ({}).';
      END IF;

      IF NEW.documents IS NOT NULL THEN
        IF jsonb_typeof(NEW.documents) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Unauthorized: documents must be a JSON object.';
        END IF;

        v_uid := auth.uid()::TEXT;
        v_prefix := 'verification/' || v_uid || '/';

        FOR v_key, v_value IN
          SELECT key, value FROM jsonb_each(NEW.documents)
        LOOP
          IF v_key NOT IN ('aadhaar', 'pan', 'selfie') THEN
            RAISE EXCEPTION 'Unauthorized: unsupported KYC document key %.', v_key;
          END IF;
          IF v_value = 'null'::JSONB THEN
            CONTINUE;
          END IF;
          IF jsonb_typeof(v_value) <> 'string' THEN
            RAISE EXCEPTION 'Unauthorized: each KYC document path must be a string or null.';
          END IF;
          v_path := v_value #>> '{}';
          IF left(v_path, length(v_prefix)) <> v_prefix
             OR position('..' IN v_path) > 0
             OR position('//' IN v_path) > 0
             OR position(chr(92) IN v_path) > 0 THEN
            RAISE EXCEPTION 'Unauthorized: document path does not belong to the authenticated user.';
          END IF;
        END LOOP;
      END IF;

    ELSIF TG_OP = 'UPDATE' THEN
      -- Once decided, documents cannot be altered
      IF OLD.verification_status IN ('approved', 'rejected')
         AND NEW.documents IS DISTINCT FROM OLD.documents THEN
        RAISE EXCEPTION 'Unauthorized: document paths cannot be changed after a final KYC decision.';
      END IF;

      IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        IF NEW.verification_status IS NULL THEN
          RAISE EXCEPTION 'Unauthorized: clients cannot set verification_status to NULL.';
        END IF;
        IF NEW.verification_status <> 'pending' THEN
          RAISE EXCEPTION 'Unauthorized: clients may only set verification_status to pending.';
        END IF;
        IF OLD.verification_status IN ('approved', 'rejected') THEN
          RAISE EXCEPTION 'Unauthorized: verification_status cannot change after a final decision.';
        END IF;
      END IF;

      IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot modify is_verified.';
      END IF;
      IF NEW.document_verified IS DISTINCT FROM OLD.document_verified THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot modify document_verified.';
      END IF;
      IF NEW.kyc_score IS DISTINCT FROM OLD.kyc_score THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot modify kyc_score.';
      END IF;
      IF NEW.kyc_auto_status IS DISTINCT FROM OLD.kyc_auto_status THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot modify kyc_auto_status.';
      END IF;
      IF NEW.face_match_score IS DISTINCT FROM OLD.face_match_score THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot modify face_match_score.';
      END IF;
      IF NEW.extracted_data IS DISTINCT FROM OLD.extracted_data THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot modify extracted_data.';
      END IF;

      -- Validate documents on change OR when submitting/resubmitting to pending
      IF (NEW.documents IS DISTINCT FROM OLD.documents)
         OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status = 'pending') THEN
        IF NEW.documents IS NULL OR jsonb_typeof(NEW.documents) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Unauthorized: documents must remain a non-null JSON object.';
        END IF;
        IF jsonb_typeof(NEW.documents->'aadhaar') IS DISTINCT FROM 'string'
           OR jsonb_typeof(NEW.documents->'selfie') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'Unauthorized: pending KYC requires Aadhaar and selfie document paths.';
        END IF;

        v_uid := auth.uid()::TEXT;
        v_prefix := 'verification/' || v_uid || '/';

        FOR v_key, v_value IN
          SELECT key, value FROM jsonb_each(NEW.documents)
        LOOP
          IF v_key NOT IN ('aadhaar', 'pan', 'selfie') THEN
            RAISE EXCEPTION 'Unauthorized: unsupported KYC document key %.', v_key;
          END IF;
          IF v_value = 'null'::JSONB THEN
            CONTINUE;
          END IF;
          IF jsonb_typeof(v_value) <> 'string' THEN
            RAISE EXCEPTION 'Unauthorized: each KYC document path must be a string or null.';
          END IF;
          v_path := v_value #>> '{}';
          IF left(v_path, length(v_prefix)) <> v_prefix
             OR position('..' IN v_path) > 0
             OR position('//' IN v_path) > 0
             OR position(chr(92) IN v_path) > 0 THEN
            RAISE EXCEPTION 'Unauthorized: document path does not belong to the authenticated user.';
          END IF;
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_kyc_fields ON public.profiles;
CREATE TRIGGER trigger_protect_kyc_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_kyc_fields();

-- ─── 11. Storage Policies (Private Buckets) ──────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('identity_docs', 'identity_docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users can upload their own docs" ON storage.objects;
CREATE POLICY "Users can upload their own docs" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'identity_docs'
  AND auth.uid()::TEXT = (storage.foldername(name))[2]
);

DROP POLICY IF EXISTS "Users can view their own docs" ON storage.objects;
CREATE POLICY "Users can view their own docs" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'identity_docs'
  AND auth.uid()::TEXT = (storage.foldername(name))[2]
);

DROP POLICY IF EXISTS "Admins can view all docs" ON storage.objects;
CREATE POLICY "Admins can view all docs" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'identity_docs'
  AND public.has_permission(auth.uid(), 'users.verify')
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('task_proofs', 'task_proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Task proofs select policy" ON storage.objects;
DROP POLICY IF EXISTS "Task proofs insert policy" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view task proofs" ON storage.objects;
CREATE POLICY "Admins can view task proofs" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'task_proofs'
  AND public.has_permission(auth.uid(), 'tasks.read_all')
);

COMMIT;

-- =============================================================================
-- POST-RUN VERIFICATION (Run separately after COMMIT)
-- =============================================================================
-- 1) Direct client task writes should be FALSE; service_role UPDATE should be TRUE:
-- SELECT
--   has_table_privilege('authenticated','public.volunteer_tasks','UPDATE') AS auth_update,
--   has_table_privilege('authenticated','public.volunteer_tasks','INSERT') AS auth_insert,
--   has_table_privilege('service_role','public.volunteer_tasks','UPDATE') AS service_update;
-- Expected: false, false, true.
--
-- 2) auto_expire_stale_tasks should NOT be executable by authenticated:
-- SELECT has_function_privilege('authenticated', 'public.auto_expire_stale_tasks()', 'EXECUTE') AS auth_can_expire,
--        has_function_privilege('service_role', 'public.auto_expire_stale_tasks()', 'EXECUTE') AS service_can_expire;
-- Expected: false, true.
--
-- 3) Storage buckets should both be private:
-- SELECT id, name, public FROM storage.buckets
-- WHERE id IN ('identity_docs','task_proofs');
-- Expected: public=false for both.
--
-- 4) Verify all legacy permissive policies are gone:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename IN ('profiles', 'food_listings', 'food_requests', 'volunteer_tasks')
-- ORDER BY tablename, policyname;
-- =============================================================================
