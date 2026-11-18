-- =============================================================================
-- Zero Food Waste — FINAL CONSOLIDATED SECURITY REMEDIATION
--
-- Intended for the current state described by the project owner:
--   • The earlier/manual 20261118 KYC + storage SQL has already been run.
--   • That earlier SQL used tasks.manage for task_proofs; this script corrects it.
--   • This script consolidates the pending 20261118100000 audit remediation and
--     20261119000000 P0/P1 remediation, with additional corrections identified
--     during review.
--
-- IMPORTANT:
--   • Run only AFTER the server.ts QR RPC calls use the authenticated user's
--     bearer token (not the service-role client). See the accompanying steps.
--   • Do NOT rerun the old 20261118 KYC migration separately.
--   • This script is transactional: any error should abort the whole script.
-- =============================================================================

BEGIN;

-- ─── 0. PRE-FLIGHT: ensure required objects exist ─────────────────────────────
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
          vt.status IN ('open', 'pending_acceptance')
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

-- ─── 2. Replace SELECT policies which call the helpers ───────────────────────

DROP POLICY IF EXISTS "requests_select" ON public.food_requests;
DROP POLICY IF EXISTS "requests_select_volunteer" ON public.food_requests;
DROP POLICY IF EXISTS "requests_select_all_authorized" ON public.food_requests;

CREATE POLICY "requests_select_all_authorized" ON public.food_requests
FOR SELECT
USING (
  auth.uid() = receiver_id
  OR public.can_donor_view_request(listing_id)
  OR public.can_volunteer_view_request(id)
  OR public.has_permission(auth.uid(), 'requests.read_all')
);

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_authorized" ON public.profiles;

CREATE POLICY "profiles_select_all_authorized" ON public.profiles
FOR SELECT
USING (
  auth.uid() = id
  OR public.can_view_profile_for_task(id)
  OR public.has_permission(auth.uid(), 'users.read')
);

-- The known policies have now been replaced with the one-argument helpers.
-- Remove obsolete overloads that accepted caller-supplied user IDs.
DO $$
BEGIN
  IF to_regprocedure('public.can_volunteer_view_request(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.can_volunteer_view_request(UUID, UUID)
      FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.can_volunteer_view_request(UUID, UUID);
  END IF;

  IF to_regprocedure('public.can_donor_view_request(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.can_donor_view_request(UUID, UUID)
      FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.can_donor_view_request(UUID, UUID);
  END IF;

  IF to_regprocedure('public.can_view_profile_for_task(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.can_view_profile_for_task(UUID, UUID)
      FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.can_view_profile_for_task(UUID, UUID);
  END IF;
END;
$$;

-- ─── 3. Restrict food-listing visibility ─────────────────────────────────────
-- Active listings are public. Reserved/completed listings are participant-only.
-- users.read is admin-only in this project's RBAC seed; food.read_all is not.

DROP POLICY IF EXISTS "listings_select" ON public.food_listings;
DROP POLICY IF EXISTS "listings_select_volunteer" ON public.food_listings;
DROP POLICY IF EXISTS "listings_select_all" ON public.food_listings;
DROP POLICY IF EXISTS "listings_select_authorized" ON public.food_listings;

CREATE POLICY "listings_select_authorized" ON public.food_listings
FOR SELECT
USING (
  status = 'active'
  OR auth.uid() = donor_id
  OR EXISTS (
    SELECT 1
    FROM public.food_requests AS fr
    WHERE fr.listing_id = food_listings.id
      AND fr.receiver_id = auth.uid()
      AND fr.status IN ('pending', 'assigned', 'picked_up', 'delivered', 'completed')
  )
  OR (
    status = 'reserved'
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

-- ─── 4. P0: remove direct client INSERT/UPDATE access to volunteer_tasks ─────
-- QR verification and other legitimate mutations must use SECURITY DEFINER RPCs.
-- Proof upload uses the trusted server-side service-role client.

REVOKE INSERT, UPDATE ON TABLE public.volunteer_tasks
FROM PUBLIC, anon, authenticated;

-- Preserve trusted backend operations after revoking inherited/public grants.
GRANT ALL PRIVILEGES ON TABLE public.volunteer_tasks TO service_role;

-- RLS policy alone is not a SQL privilege. Remove the old permissive UPDATE policy
-- so it cannot mislead future reviewers into thinking direct updates are allowed.
DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks;

-- ─── 5. Add volunteer-role gate and state checks to QR generation ─────────────

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

  IF p_type = 'pickup' AND v_task.status <> 'assigned' THEN
    RETURN json_build_object('success', false, 'error', 'Pickup QR can only be generated for an assigned task.');
  END IF;

  IF p_type = 'delivery' AND v_task.status NOT IN ('picked_up', 'in_progress') THEN
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

-- ─── 6. Harden QR verification and bind it to the authenticated caller ───────
-- The server must call this RPC using the user's bearer JWT, not service-role.

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
    IF v_task.status <> 'assigned' THEN
      RETURN json_build_object('success', false, 'error', 'Task is not in the correct state for pickup verification.');
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

  ELSE
    IF COALESCE(v_task.delivery_qr_used, false) THEN
      RETURN json_build_object('success', false, 'error', 'This QR code has already been used.');
    END IF;
    IF v_task.delivery_qr_expires_at IS NULL OR v_task.delivery_qr_expires_at < NOW() THEN
      RETURN json_build_object('success', false, 'error', 'QR code has expired. Please ask for a new one.');
    END IF;
    IF v_task.status NOT IN ('picked_up', 'in_progress') THEN
      RETURN json_build_object('success', false, 'error', 'Pickup must be completed before delivery verification.');
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

    UPDATE public.food_listings AS fl
    SET status = 'completed', updated_at = NOW()
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

-- ─── 7. Replace KYC trigger with complete client-side integrity controls ──────

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
      -- New profiles must start in the database default state.
      IF NEW.verification_status IS DISTINCT FROM 'unset' THEN
        RAISE EXCEPTION 'Unauthorized: client-created profiles must start with verification_status unset.';
      END IF;

      IF NEW.is_verified IS TRUE OR NEW.document_verified IS TRUE THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot set verification flags on insert.';
      END IF;

      IF NEW.kyc_score IS NOT NULL
         OR NEW.kyc_auto_status IS NOT NULL
         OR NEW.face_match_score IS NOT NULL
         OR NEW.extracted_data IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot supply KYC scoring or extracted fields on insert.';
      END IF;

      IF NEW.documents IS NULL OR jsonb_typeof(NEW.documents) IS DISTINCT FROM 'object' THEN
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

    ELSIF TG_OP = 'UPDATE' THEN
      -- Once decided, the submitted documents cannot be swapped or cleared.
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
        -- Pending submission requires both mandatory documents.
        IF NEW.documents IS NULL
           OR jsonb_typeof(NEW.documents) IS DISTINCT FROM 'object'
           OR jsonb_typeof(NEW.documents->'aadhaar') IS DISTINCT FROM 'string'
           OR jsonb_typeof(NEW.documents->'selfie') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'Unauthorized: pending KYC requires Aadhaar and selfie document paths.';
        END IF;
      END IF;

      -- Clients cannot alter trusted flags in either direction.
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

      -- Validate every changed document object and every non-null path.
      IF NEW.documents IS DISTINCT FROM OLD.documents THEN
        IF NEW.documents IS NULL OR jsonb_typeof(NEW.documents) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Unauthorized: documents must remain a non-null JSON object.';
        END IF;
        IF jsonb_typeof(NEW.documents->'aadhaar') IS DISTINCT FROM 'string'
           OR jsonb_typeof(NEW.documents->'selfie') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'Unauthorized: Aadhaar and selfie paths are required.';
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

-- ─── 8. Correct private Storage policies ─────────────────────────────────────

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

-- ─── 9. Safely remove obsolete non-QR task transition and OTP RPCs ───────────

DO $$
BEGIN
  IF to_regprocedure('public.advance_task_status(uuid,uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.advance_task_status(UUID, UUID, TEXT)
      FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.advance_task_status(UUID, UUID, TEXT);
  END IF;

  IF to_regprocedure('public.generate_task_otp(uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.generate_task_otp(UUID, TEXT)
      FROM PUBLIC, anon, authenticated, service_role;
    DROP FUNCTION public.generate_task_otp(UUID, TEXT);
  END IF;

  IF to_regprocedure('public.verify_task_otp(uuid,uuid,text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.verify_task_otp(UUID, UUID, TEXT, TEXT)
      FROM PUBLIC, anon, authenticated, service_role;
    DROP FUNCTION public.verify_task_otp(UUID, UUID, TEXT, TEXT);
  END IF;
END;
$$;

COMMIT;
