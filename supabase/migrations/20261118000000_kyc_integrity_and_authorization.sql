-- =============================================================================
-- Zero Food Waste: KYC Integrity, Storage Privacy & QR Workflow Enforcement
--
-- Corrections & Hardening:
-- 1. Database-level KYC Protection on BOTH INSERT and UPDATE:
--    Blocks authenticated non-admin clients from inserting or updating trusted fields:
--    `kyc_score`, `face_match_score`, `kyc_auto_status`, `extracted_data`, `is_verified`,
--    `document_verified`, or setting `verification_status` to 'approved' or 'rejected'.
-- 2. Removes direct client INSERT policy on profiles; profile creation is handled
--    exclusively by the trusted on_auth_user_created (handle_new_user) trigger.
-- 3. Drops legacy advance_task_status() RPC completely to prevent bypassing QR verification.
--    Pickup and delivery status transitions are strictly gated by verify_qr_token().
-- 4. Secures identity_docs and task_proofs storage buckets as private (public = false)
--    with strict owner/admin-only RLS policies.
-- 5. Hardens SECURITY DEFINER functions with explicit SET search_path = pg_catalog, public.
-- =============================================================================

-- ─── SECTION 1: Harden KYC Profile Fields Trigger (INSERT + UPDATE) ──────────

CREATE OR REPLACE FUNCTION public.protect_kyc_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Only restrict normal authenticated (non-service-role) callers who are NOT admins
  IF auth.role() = 'authenticated'
     AND NOT public.has_permission(auth.uid(), 'users.verify') THEN

    IF TG_OP = 'INSERT' THEN
      -- On INSERT: block non-admins from self-approving or injecting scoring
      IF NEW.verification_status IN ('approved', 'rejected') THEN
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

    ELSIF TG_OP = 'UPDATE' THEN
      -- On UPDATE: clients can only transition to 'pending' when submitting documents.
      -- Clients can never self-approve or reject.
      IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
         AND NEW.verification_status IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot set verification_status to %.', NEW.verification_status;
      END IF;

      -- Block setting is_verified = true
      IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
         AND NEW.is_verified IS TRUE THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot set is_verified directly.';
      END IF;

      -- Block setting document_verified = true
      IF NEW.document_verified IS DISTINCT FROM OLD.document_verified
         AND NEW.document_verified IS TRUE THEN
        RAISE EXCEPTION 'Unauthorized: clients cannot set document_verified directly.';
      END IF;

      -- Block clients from modifying automated scoring fields
      IF NEW.kyc_score IS DISTINCT FROM OLD.kyc_score THEN
        RAISE EXCEPTION 'Unauthorized: KYC score can only be updated by the automated verification service or admin.';
      END IF;

      IF NEW.kyc_auto_status IS DISTINCT FROM OLD.kyc_auto_status THEN
        RAISE EXCEPTION 'Unauthorized: KYC auto_status can only be updated by the automated verification service or admin.';
      END IF;

      IF NEW.face_match_score IS DISTINCT FROM OLD.face_match_score THEN
        RAISE EXCEPTION 'Unauthorized: face_match_score can only be updated by the automated verification service or admin.';
      END IF;

      IF NEW.extracted_data IS DISTINCT FROM OLD.extracted_data THEN
        RAISE EXCEPTION 'Unauthorized: extracted_data can only be updated by the automated verification service or admin.';
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

-- Drop redundant direct client INSERT policy on profiles; profile rows are safely
-- initialized exclusively by the trusted on_auth_user_created (handle_new_user) trigger.
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;


-- ─── SECTION 2: Eliminate Bypasses to QR Verification ────────────────────────

-- Revoke all permissions and drop legacy advance_task_status RPC.
-- Task pickup and delivery transitions must strictly occur via cryptographic
-- token verification in verify_qr_token().
REVOKE ALL ON FUNCTION public.advance_task_status(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.advance_task_status(UUID, UUID, TEXT);


-- ─── SECTION 3: Storage Privacy for identity_docs and task_proofs ────────────

-- 1. Ensure identity_docs bucket is strictly private
INSERT INTO storage.buckets (id, name, public)
VALUES ('identity_docs', 'identity_docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Upload policy: Users can only upload to their own user_id directory
DROP POLICY IF EXISTS "Users can upload their own docs" ON storage.objects;
CREATE POLICY "Users can upload their own docs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'identity_docs' AND
    auth.uid()::text = (storage.foldername(name))[2]
  );

-- View policy: Users can only view their own documents
DROP POLICY IF EXISTS "Users can view their own docs" ON storage.objects;
CREATE POLICY "Users can view their own docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'identity_docs' AND
    auth.uid()::text = (storage.foldername(name))[2]
  );

-- Admin policy: Admins with users.verify permission can view all identity documents
DROP POLICY IF EXISTS "Admins can view all docs" ON storage.objects;
CREATE POLICY "Admins can view all docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'identity_docs' AND
    public.has_permission(auth.uid(), 'users.verify')
  );

-- 2. Ensure task_proofs bucket is strictly private
INSERT INTO storage.buckets (id, name, public)
VALUES ('task_proofs', 'task_proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Task proofs select policy" ON storage.objects;
DROP POLICY IF EXISTS "Task proofs insert policy" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view task proofs" ON storage.objects;

-- Admin/Dispatch manager policy: View proof photos for dispute or delivery audits
CREATE POLICY "Admins can view task proofs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'task_proofs' AND
    public.has_permission(auth.uid(), 'tasks.manage')
  );
