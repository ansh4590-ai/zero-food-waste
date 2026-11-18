-- =============================================================================
-- Zero Food Waste: Security Audit Remediation
-- Addresses findings: B-04, H-01, H-02, H-03 (database side), H-08
-- =============================================================================

-- ─── B-04 / H-08: Fix SECURITY DEFINER helpers — revoke anon, use auth.uid() ─
-- The helpers in 20261117 accept a caller-supplied p_user_id and are executable
-- by anon, letting any unauthenticated caller probe relationship visibility.
-- Fix: derive identity from auth.uid() internally; revoke anon EXECUTE.

-- 1a. can_volunteer_view_request — no longer accepts external p_user_id
CREATE OR REPLACE FUNCTION public.can_volunteer_view_request(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.volunteer_tasks
    WHERE request_id = p_request_id
      AND (
        volunteer_id = auth.uid()
        OR (status IN ('open', 'pending_acceptance') AND volunteer_id IS NULL)
      )
  );
$$;

-- 1b. can_donor_view_request — no longer accepts external p_user_id
CREATE OR REPLACE FUNCTION public.can_donor_view_request(p_listing_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.food_listings
    WHERE id = p_listing_id
      AND donor_id = auth.uid()
  );
$$;

-- 1c. can_view_profile_for_task — no longer accepts external p_caller_id
CREATE OR REPLACE FUNCTION public.can_view_profile_for_task(p_target_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.volunteer_tasks vt
    JOIN public.food_requests fr ON fr.id = vt.request_id
    JOIN public.food_listings fl ON fl.id = fr.listing_id
    WHERE (vt.volunteer_id = auth.uid()
        OR fr.receiver_id  = auth.uid()
        OR fl.donor_id     = auth.uid())
      AND p_target_profile_id IN (vt.volunteer_id, fr.receiver_id, fl.donor_id)
  );
$$;

-- Revoke anon/public EXECUTE; grant only to authenticated users
REVOKE ALL ON FUNCTION public.can_volunteer_view_request(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_donor_view_request(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_profile_for_task(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_volunteer_view_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_donor_view_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_profile_for_task(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_volunteer_view_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_donor_view_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile_for_task(UUID) TO authenticated;


-- ─── H-01 / H-02: Harden food_requests and volunteer_tasks RLS ───────────────

-- H-01: Remove the bare `OR status = 'pending'` from food_requests SELECT.
-- Only authenticated volunteers with an assigned or claimable task should see
-- a request. The anon-accessible condition is gone.
DROP POLICY IF EXISTS "requests_select_all_authorized" ON public.food_requests;
CREATE POLICY "requests_select_all_authorized" ON public.food_requests
  FOR SELECT USING (
    -- 1. Receiver who created the request
    auth.uid() = receiver_id
    -- 2. Donor of the requested listing
    OR public.can_donor_view_request(listing_id)
    -- 3. Volunteer assigned to or claiming this request (uses auth.uid() internally)
    OR public.can_volunteer_view_request(id)
    -- 4. Admins with requests.read_all permission
    OR public.has_permission(auth.uid(), 'requests.read_all')
  );

-- H-02: Restrict volunteer_tasks UPDATE to use narrowly authorized RPCs only.
-- Direct UPDATE is locked to: assigned volunteer (own row only) and admins.
-- Open/broadcast claiming is handled via handle_task_assignment() RPC.
DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks;
CREATE POLICY "tasks_update" ON public.volunteer_tasks
  FOR UPDATE USING (
    -- Assigned volunteer can update their own task (accept, proof upload, abort)
    auth.uid() = volunteer_id
    -- Admin can update any task
    OR public.has_permission(auth.uid(), 'tasks.read_all')
  );

-- Broadcast pool claiming remains in handle_task_assignment() SECURITY DEFINER RPC
-- which does its own ownership assignment atomically.


-- ─── H-08: Add explicit volunteer-role check to generate_qr_token ─────────────
-- The existing generate_qr_token checks auth.uid() = v_task.volunteer_id but
-- does not validate that the caller actually holds the volunteer role.

CREATE OR REPLACE FUNCTION public.generate_qr_token(
  p_task_id UUID,
  p_type    TEXT   -- 'pickup' or 'delivery'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_token      TEXT;
  v_expires_at TIMESTAMPTZ;
  v_task       RECORD;
  v_role       public.user_role;
BEGIN
  -- Validate type first
  IF p_type NOT IN ('pickup', 'delivery') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid type. Use pickup or delivery.');
  END IF;

  -- Explicit volunteer-role check (H-08)
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'volunteer'::public.user_role THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: only volunteers can generate QR tokens.');
  END IF;

  -- Verify task exists and load it
  SELECT * INTO v_task FROM public.volunteer_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Task not found.');
  END IF;

  -- Caller must be the assigned volunteer
  IF auth.uid() IS DISTINCT FROM v_task.volunteer_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: you are not assigned to this task.');
  END IF;

  -- Task state check: for delivery, pickup must be done
  IF p_type = 'delivery' AND v_task.status NOT IN ('picked_up', 'in_progress') THEN
    RETURN json_build_object('success', false, 'error', 'Pickup must be completed before generating delivery QR.');
  END IF;

  -- Generate cryptographic token with 10-minute expiry
  v_token      := gen_random_uuid()::TEXT;
  v_expires_at := NOW() + INTERVAL '10 minutes';

  IF p_type = 'pickup' THEN
    UPDATE public.volunteer_tasks
    SET pickup_qr_token      = v_token,
        pickup_qr_expires_at = v_expires_at,
        pickup_qr_used       = false,
        updated_at           = NOW()
    WHERE id = p_task_id;
  ELSE
    UPDATE public.volunteer_tasks
    SET delivery_qr_token      = v_token,
        delivery_qr_expires_at = v_expires_at,
        delivery_qr_used       = false,
        updated_at             = NOW()
    WHERE id = p_task_id;
  END IF;

  RETURN json_build_object(
    'success',    true,
    'token',      v_token,
    'expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_qr_token(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_qr_token(UUID, TEXT) TO authenticated;


-- ─── Fix profiles SELECT policy to use new single-arg helper ─────────────────
DROP POLICY IF EXISTS "profiles_select_all_authorized" ON public.profiles;
CREATE POLICY "profiles_select_all_authorized" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.can_view_profile_for_task(id)
    OR public.has_permission(auth.uid(), 'users.read')
  );
