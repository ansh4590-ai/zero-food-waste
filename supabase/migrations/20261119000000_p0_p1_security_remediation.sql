-- =============================================================================
-- Zero Food Waste: P0/P1 Security Remediation
-- Addresses findings: P0 (QR-only transitions), P1-B04 (helper overloads),
--   P1-broadcast-visibility (volunteer role check), P1-listings-visibility,
--   P1-KYC-integrity (doc lock after decision, NULL guard, status guard)
-- =============================================================================

-- ─── SECTION 1 (P0): Enforce QR-only task status transitions ─────────────────
--
-- Strategy: revoke direct UPDATE privilege on volunteer_tasks from the
-- `authenticated` role.  All legitimate state changes go through:
--   • handle_task_assignment()   — claim / accept / decline  (SECURITY DEFINER)
--   • generate_qr_token()        — write QR token fields     (SECURITY DEFINER)
--   • verify_qr_token()          — pickup / delivery         (SECURITY DEFINER)
--   • abort_volunteer_task()     — abort with reason          (SECURITY DEFINER)
--   • supabaseAdmin (service-role) — proof-upload endpoint, admin panel
--
-- The service-role key bypasses RLS entirely so it is unaffected.
-- RLS policies are still recreated below (defence-in-depth) but they are only
-- the last line; the TABLE-LEVEL privilege revocation is the primary control.

REVOKE UPDATE ON TABLE public.volunteer_tasks FROM authenticated;

-- Keep the RLS policy for defence-in-depth (service-role bypasses RLS anyway).
-- The policy now only permits the assigned volunteer to SELECT for context;
-- actual writes come through the SECURITY DEFINER RPCs above.
DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks;
CREATE POLICY "tasks_update" ON public.volunteer_tasks
  FOR UPDATE USING (
    -- Assigned volunteer (via SECURITY DEFINER RPC — service-role ignores RLS)
    auth.uid() = volunteer_id
    -- Admin override
    OR public.has_permission(auth.uid(), 'tasks.read_all')
  );

-- Verify the INSERT policy is still restricted to SECURITY DEFINER RPCs only.
-- Direct INSERT by authenticated users is blocked (task creation goes through
-- create_volunteer_task_for_request trigger and handle_task_assignment RPC).
-- The existing tasks_insert policy already requires auth.uid() = volunteer_id,
-- which is fine for the RPC context, but we also revoke the table privilege
-- so only the service-role (which bypasses RLS) can insert directly.
REVOKE INSERT ON TABLE public.volunteer_tasks FROM authenticated;


-- ─── SECTION 2 (P1): Remove obsolete two-argument helper overloads ────────────
--
-- The 20261117 migration granted EXECUTE on the two-argument versions to
-- authenticated and anon.  The 20261118100000 migration revoked from anon but
-- did NOT drop the two-argument functions or revoke authenticated.
-- These overloads accept a caller-supplied p_user_id — a SECURITY DEFINER
-- function that takes an arbitrary UUID and uses it for access decisions is
-- a privilege-escalation risk.

-- 2a. Revoke from every role first (REVOKE has no IF EXISTS, guard with DO)
DO $$
BEGIN
  -- can_volunteer_view_request(UUID, UUID)
  IF to_regprocedure('public.can_volunteer_view_request(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.can_volunteer_view_request(UUID, UUID)
      FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.can_volunteer_view_request(UUID, UUID);
    RAISE NOTICE 'Dropped obsolete can_volunteer_view_request(UUID,UUID)';
  END IF;

  -- can_donor_view_request(UUID, UUID)
  IF to_regprocedure('public.can_donor_view_request(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.can_donor_view_request(UUID, UUID)
      FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.can_donor_view_request(UUID, UUID);
    RAISE NOTICE 'Dropped obsolete can_donor_view_request(UUID,UUID)';
  END IF;

  -- can_view_profile_for_task(UUID, UUID)
  IF to_regprocedure('public.can_view_profile_for_task(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.can_view_profile_for_task(UUID, UUID)
      FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.can_view_profile_for_task(UUID, UUID);
    RAISE NOTICE 'Dropped obsolete can_view_profile_for_task(UUID,UUID)';
  END IF;
END;
$$;


-- ─── SECTION 3 (P1): Restrict broadcast-request visibility — volunteer-role check
--
-- The current can_volunteer_view_request(UUID) allows ANY authenticated user
-- (including donors and receivers) to see unassigned broadcast requests if a
-- matching open/pending_acceptance task row exists.
-- Fix: require profiles.role = 'volunteer' before granting access to broadcast rows.

CREATE OR REPLACE FUNCTION public.can_volunteer_view_request(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.volunteer_tasks vt
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE vt.request_id = p_request_id
      AND (
        -- Assigned volunteer sees their own task row
        vt.volunteer_id = auth.uid()
        -- Broadcast pool: only volunteers (by role) see unassigned open tasks
        OR (
          vt.status IN ('open', 'pending_acceptance')
          AND vt.volunteer_id IS NULL
          AND p.role = 'volunteer'
        )
      )
  );
$$;

-- Ensure grants are correct on the updated single-arg version
REVOKE ALL ON FUNCTION public.can_volunteer_view_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_volunteer_view_request(UUID) TO authenticated;

-- Rebuild food_requests SELECT policy using the updated volunteer helper
DROP POLICY IF EXISTS "requests_select_all_authorized" ON public.food_requests;
CREATE POLICY "requests_select_all_authorized" ON public.food_requests
  FOR SELECT USING (
    -- 1. Receiver who created the request
    auth.uid() = receiver_id
    -- 2. Donor of the requested listing
    OR public.can_donor_view_request(listing_id)
    -- 3. Volunteer assigned to or claiming this request
    --    (single-arg version now also checks caller is a volunteer for broadcasts)
    OR public.can_volunteer_view_request(id)
    -- 4. Admins with requests.read_all permission
    OR public.has_permission(auth.uid(), 'requests.read_all')
  );


-- ─── SECTION 4 (P1): Restrict food-listing visibility ────────────────────────
--
-- The existing listings_select_all policy (from 20261117) exposes
-- reserved and completed listings to any authenticated user.
-- Fix:
--   active    → public (everyone may browse available food)
--   reserved  → assigned volunteer, receiver, donor, admin
--   completed → donor, receiver, admin only
--   donor always sees their own listings regardless of status

DROP POLICY IF EXISTS "listings_select_all" ON public.food_listings;
DROP POLICY IF EXISTS "listings_select" ON public.food_listings;
DROP POLICY IF EXISTS "listings_select_volunteer" ON public.food_listings;

CREATE POLICY "listings_select_authorized" ON public.food_listings
  FOR SELECT USING (
    -- Active listings: anyone may browse
    status = 'active'
    -- Donor always sees their own listings
    OR auth.uid() = donor_id
    -- Reserved/completed: receiver of the linked request
    OR EXISTS (
      SELECT 1 FROM public.food_requests fr
      WHERE fr.listing_id = id
        AND fr.receiver_id = auth.uid()
        AND fr.status IN ('pending', 'assigned', 'picked_up', 'delivered', 'completed')
    )
    -- Reserved: assigned volunteer on the linked task
    OR (
      status = 'reserved'
      AND EXISTS (
        SELECT 1 FROM public.food_requests fr
        JOIN public.volunteer_tasks vt ON vt.request_id = fr.id
        WHERE fr.listing_id = id
          AND vt.volunteer_id = auth.uid()
      )
    )
    -- Admin
    OR public.has_permission(auth.uid(), 'food.read_all')
  );


-- ─── SECTION 5 (P1): Complete KYC integrity protections ──────────────────────
--
-- Extends the existing protect_kyc_fields() trigger with:
--   a) Lock document paths after a final KYC decision (approved/rejected)
--   b) Reject NULL or structurally invalid documents JSON
--   c) Reject NULL verification_status changes from the client
--      (clients must supply an explicit value, not null)

CREATE OR REPLACE FUNCTION public.protect_kyc_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prefix TEXT;
  v_uid    TEXT;
  v_path   TEXT;
BEGIN
  -- Only restrict normal authenticated (non-service-role) callers who are NOT admins
  IF auth.role() = 'authenticated'
     AND NOT public.has_permission(auth.uid(), 'users.verify') THEN

    -- ── INSERT guard ──────────────────────────────────────────────────────────
    IF TG_OP = 'INSERT' THEN

      IF NEW.verification_status IN ('approved', 'rejected', 'manual_review') THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot set verification_status to % on insert.', NEW.verification_status;
      END IF;

      IF NEW.is_verified IS TRUE THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot set is_verified = true on insert.';
      END IF;

      IF NEW.document_verified IS TRUE THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot set document_verified = true on insert.';
      END IF;

      IF NEW.kyc_score IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot supply kyc_score on insert.';
      END IF;

      IF NEW.kyc_auto_status IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot supply kyc_auto_status on insert.';
      END IF;

      IF NEW.face_match_score IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot supply face_match_score on insert.';
      END IF;

      IF NEW.extracted_data IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot supply extracted_data on insert.';
      END IF;

      -- Validate document paths on INSERT: each path must belong to the inserting user
      IF NEW.documents IS NOT NULL THEN
        -- Must be a JSON object (not array/scalar)
        IF jsonb_typeof(NEW.documents) <> 'object' THEN
          RAISE EXCEPTION 'Unauthorized: documents must be a JSON object.';
        END IF;

        v_uid    := auth.uid()::text;
        v_prefix := 'verification/' || v_uid || '/';
        FOR v_path IN
          SELECT value::text FROM jsonb_each_text(NEW.documents) WHERE value IS NOT NULL
        LOOP
          IF NOT (v_path LIKE (v_prefix || '%')) OR
             v_path LIKE '%..%' OR v_path LIKE '%\\%' OR v_path LIKE '%//%' THEN
            RAISE EXCEPTION
              'Unauthorized: document path ''%'' does not belong to the authenticated user.', v_path;
          END IF;
        END LOOP;
      END IF;

    -- ── UPDATE guard ──────────────────────────────────────────────────────────
    ELSIF TG_OP = 'UPDATE' THEN

      -- Block any document changes after a final KYC decision
      IF OLD.verification_status IN ('approved', 'rejected') THEN
        IF NEW.documents IS DISTINCT FROM OLD.documents THEN
          RAISE EXCEPTION
            'Unauthorized: document paths cannot be changed after a final KYC decision (%).', OLD.verification_status;
        END IF;
      END IF;

      -- Status transitions: clients may only move to 'pending'.
      -- NULL is not permitted (clients must be explicit).
      IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        IF NEW.verification_status IS NULL THEN
          RAISE EXCEPTION 'Unauthorized: clients cannot set verification_status to NULL.';
        END IF;
        IF NEW.verification_status NOT IN ('pending') THEN
          RAISE EXCEPTION
            'Unauthorized: clients may only set verification_status to ''pending''. Got: %.',
            NEW.verification_status;
        END IF;
        -- Prevent re-opening after a final decision
        IF OLD.verification_status IN ('approved', 'rejected') THEN
          RAISE EXCEPTION
            'Unauthorized: verification_status cannot be changed once a decision has been made.';
        END IF;
      END IF;

      -- Scoring and verification decision fields (server/admin only)
      IF NEW.is_verified IS DISTINCT FROM OLD.is_verified AND NEW.is_verified IS TRUE THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot set is_verified directly.';
      END IF;

      IF NEW.document_verified IS DISTINCT FROM OLD.document_verified AND NEW.document_verified IS TRUE THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot set document_verified directly.';
      END IF;

      IF NEW.kyc_score IS DISTINCT FROM OLD.kyc_score THEN
        RAISE EXCEPTION 'Unauthorized: kyc_score can only be updated by the verification service or admin.';
      END IF;

      IF NEW.kyc_auto_status IS DISTINCT FROM OLD.kyc_auto_status THEN
        RAISE EXCEPTION 'Unauthorized: kyc_auto_status can only be updated by the verification service or admin.';
      END IF;

      IF NEW.face_match_score IS DISTINCT FROM OLD.face_match_score THEN
        RAISE EXCEPTION 'Unauthorized: face_match_score can only be updated by the verification service or admin.';
      END IF;

      IF NEW.extracted_data IS DISTINCT FROM OLD.extracted_data THEN
        RAISE EXCEPTION 'Unauthorized: extracted_data can only be updated by the verification service or admin.';
      END IF;

      -- Document path ownership guard
      IF NEW.documents IS DISTINCT FROM OLD.documents THEN
        IF NEW.documents IS NULL THEN
          RAISE EXCEPTION 'Unauthorized: clients cannot set documents to NULL.';
        END IF;

        -- Must be a JSON object (not array/scalar)
        IF jsonb_typeof(NEW.documents) <> 'object' THEN
          RAISE EXCEPTION 'Unauthorized: documents must be a JSON object.';
        END IF;

        v_uid    := auth.uid()::text;
        v_prefix := 'verification/' || v_uid || '/';

        FOR v_path IN
          SELECT value::text
          FROM jsonb_each_text(NEW.documents)
          WHERE value IS NOT NULL
        LOOP
          IF NOT (v_path LIKE (v_prefix || '%')) THEN
            RAISE EXCEPTION
              'Unauthorized: document path ''%'' does not belong to the authenticated user.', v_path;
          END IF;
          IF v_path LIKE '%..%' OR v_path LIKE '%\\%' OR v_path LIKE '%//%' THEN
            RAISE EXCEPTION
              'Unauthorized: document path ''%'' contains forbidden sequences.', v_path;
          END IF;
        END LOOP;
      END IF;

    END IF; -- TG_OP

  END IF; -- auth.role() check

  RETURN NEW;
END;
$$;

-- Re-attach the trigger (CREATE OR REPLACE updates the function body; the
-- trigger binding does not change but we recreate it to be explicit)
DROP TRIGGER IF EXISTS trigger_protect_kyc_fields ON public.profiles;
CREATE TRIGGER trigger_protect_kyc_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_kyc_fields();


-- ─── SECTION 6: Grant hygiene for all single-arg helpers ─────────────────────
-- Ensure the single-arg helpers are locked to authenticated only.
REVOKE ALL ON FUNCTION public.can_donor_view_request(UUID)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_profile_for_task(UUID)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_donor_view_request(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile_for_task(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_volunteer_view_request(UUID)  TO authenticated;
