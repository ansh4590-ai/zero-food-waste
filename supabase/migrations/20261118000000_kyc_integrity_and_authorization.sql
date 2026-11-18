-- =============================================================================
-- Zero Food Waste: KYC Integrity, Storage Privacy & QR Workflow Enforcement
-- (Rev 3 — addresses migration review B-01 through B-05)
--
-- Changes in this revision:
-- 1. BEFORE INSERT OR UPDATE trigger now protects ALL KYC-related columns.
--    INSERT: blocks any trusted field being supplied at row-creation time.
--    UPDATE: clients may ONLY move status to 'pending' (document submission).
--            Setting 'approved', 'rejected', 'manual_review', or any
--            other status value is exclusively reserved for trusted backend/admin.
-- 2. The 'documents' JSON field is validated on UPDATE: each submitted path
--    must start with exactly verification/{auth.uid()}/ and must not contain
--    path-traversal sequences, backslashes, or another user's UUID.
-- 3. Direct client INSERT policy on profiles is dropped; profile rows are
--    created exclusively by the trusted on_auth_user_created trigger.
-- 4. advance_task_status() is removed via a safe DO block that checks
--    function existence before attempting REVOKE (REVOKE has no IF EXISTS).
-- 5. task_proofs storage policy now uses the existing 'tasks.read_all'
--    permission (admin role) rather than the undefined 'tasks.manage'.
-- =============================================================================

-- ─── SECTION 1: Harden KYC Profile Fields Trigger (INSERT + UPDATE) ──────────

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

    -- ── INSERT guard ────────────────────────────────────────────────────────
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

      -- Validate document paths on INSERT too: each path must belong to the inserting user
      IF NEW.documents IS NOT NULL THEN
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

    -- ── UPDATE guard ────────────────────────────────────────────────────────
    ELSIF TG_OP = 'UPDATE' THEN

      -- Allow ONLY the submitting user to change their own row (RLS enforces row ownership)
      -- Status: clients may only move to 'pending'. All decision states are admin/server only.
      IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        IF NEW.verification_status NOT IN ('pending') THEN
          RAISE EXCEPTION
            'Unauthorized: clients may only set verification_status to ''pending''. Got: %.',
            NEW.verification_status;
        END IF;
        -- Additional guard: status may only move to pending from unset/null/pending
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

      -- ── Document path ownership guard (B-02) ──────────────────────────────
      -- Prevent user A from substituting user B's document paths in their profile,
      -- which would cause the admin review screen to load another user's documents.
      IF NEW.documents IS DISTINCT FROM OLD.documents AND NEW.documents IS NOT NULL THEN
        v_uid    := auth.uid()::text;
        v_prefix := 'verification/' || v_uid || '/';

        -- Validate each submitted path that is not null
        FOR v_path IN
          SELECT value::text
          FROM jsonb_each_text(NEW.documents)
          WHERE value IS NOT NULL
        LOOP
          -- Exact prefix match
          IF NOT (v_path LIKE (v_prefix || '%')) THEN
            RAISE EXCEPTION
              'Unauthorized: document path ''%'' does not belong to the authenticated user.', v_path;
          END IF;

          -- Block path traversal
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

DROP TRIGGER IF EXISTS trigger_protect_kyc_fields ON public.profiles;
CREATE TRIGGER trigger_protect_kyc_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_kyc_fields();

-- Drop redundant direct client INSERT policy on profiles.
-- Profile rows are created exclusively by the trusted on_auth_user_created trigger.
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;


-- ─── SECTION 2: Safely Remove advance_task_status() (B-04) ──────────────────
-- REVOKE has no IF EXISTS syntax, so guard with to_regprocedure() first.

DO $$
BEGIN
  IF to_regprocedure('public.advance_task_status(uuid,uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.advance_task_status(UUID, UUID, TEXT)
      FROM PUBLIC, anon, authenticated;
    DROP FUNCTION public.advance_task_status(UUID, UUID, TEXT);
    RAISE NOTICE 'Dropped advance_task_status: task transitions now exclusively through verify_qr_token().';
  ELSE
    RAISE NOTICE 'advance_task_status does not exist — nothing to revoke or drop.';
  END IF;
END;
$$;


-- ─── SECTION 3: Permission seed — tasks.read_all (B-03) ──────────────────────
-- The existing migrations seed 'tasks.view_assigned' and (via 20261116) 'tasks.read_all'.
-- tasks.read_all is what the volunteer_tasks RLS policies already use for admins.
-- We use the same permission here for task_proofs access to stay consistent.
-- No new role or permission name is introduced.


-- ─── SECTION 4: Storage Privacy for identity_docs and task_proofs ─────────────

-- 1. Ensure identity_docs bucket is strictly private
INSERT INTO storage.buckets (id, name, public)
VALUES ('identity_docs', 'identity_docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users can upload their own docs" ON storage.objects;
CREATE POLICY "Users can upload their own docs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'identity_docs'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

DROP POLICY IF EXISTS "Users can view their own docs" ON storage.objects;
CREATE POLICY "Users can view their own docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'identity_docs'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- Admins with users.verify permission can view all identity documents for KYC review
DROP POLICY IF EXISTS "Admins can view all docs" ON storage.objects;
CREATE POLICY "Admins can view all docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'identity_docs'
    AND public.has_permission(auth.uid(), 'users.verify')
  );

-- 2. Ensure task_proofs bucket is strictly private
INSERT INTO storage.buckets (id, name, public)
VALUES ('task_proofs', 'task_proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Task proofs select policy" ON storage.objects;
DROP POLICY IF EXISTS "Task proofs insert policy" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view task proofs" ON storage.objects;

-- Use 'tasks.read_all' (already seeded and assigned to admin role in prior migrations).
-- This matches the same permission used for volunteer_tasks RLS admin access.
CREATE POLICY "Admins can view task proofs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'task_proofs'
    AND public.has_permission(auth.uid(), 'tasks.read_all')
  );
