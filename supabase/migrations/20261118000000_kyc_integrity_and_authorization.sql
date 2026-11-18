-- =============================================================================
-- Zero Food Waste: KYC Integrity, Database Function Authorization & Document Privacy
--
-- Fixes:
-- 1. Database-level protection against client tampering with KYC scoring fields:
--    Prevents authenticated clients from writing `kyc_score`, `face_match_score`,
--    `kyc_auto_status`, or `extracted_data`. Only service-role or admins can set these.
-- 2. Enforces caller identity check in `advance_task_status` RPC to prevent
--    cross-volunteer status manipulation.
-- 3. Enforces strict private access and owner-only RLS for `identity_docs` storage.
-- =============================================================================

-- ─── SECTION 1: Harden KYC Profile Fields Trigger ────────────────────────────

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

    -- Block clients from directly setting/tampering with KYC scoring fields
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_protect_kyc_fields ON public.profiles;
CREATE TRIGGER trigger_protect_kyc_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_kyc_fields();

-- ─── SECTION 2: Identity Binding in advance_task_status RPC ──────────────────

CREATE OR REPLACE FUNCTION public.advance_task_status(
    p_task_id      UUID,
    p_volunteer_id UUID,
    p_new_status   TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task    RECORD;
    v_allowed BOOLEAN;
BEGIN
    -- SECURITY: caller must be the volunteer they claim to be
    IF auth.uid() IS DISTINCT FROM p_volunteer_id THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Identity mismatch: you can only advance your own assigned tasks.'
        );
    END IF;

    -- Verify ownership
    SELECT * INTO v_task
    FROM public.volunteer_tasks
    WHERE id = p_task_id AND volunteer_id = p_volunteer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Task not found or you are not the assigned volunteer.'
        );
    END IF;

    -- Validate task transition
    v_allowed := CASE
        WHEN v_task.status = 'assigned'  AND p_new_status = 'picked_up' THEN true
        WHEN v_task.status = 'picked_up' AND p_new_status = 'delivered' THEN true
        ELSE false
    END;

    IF NOT v_allowed THEN
        RETURN json_build_object(
            'success', false,
            'error', format('Invalid status transition from %s to %s', v_task.status, p_new_status)
        );
    END IF;

    -- Transition the volunteer_task
    UPDATE public.volunteer_tasks
    SET
        status = p_new_status,
        picked_up_at = CASE WHEN p_new_status = 'picked_up' THEN NOW() ELSE picked_up_at END,
        delivered_at = CASE WHEN p_new_status = 'delivered' THEN NOW() ELSE delivered_at END,
        updated_at   = NOW()
    WHERE id = p_task_id;

    -- Synchronise the parent food_request
    UPDATE public.food_requests
    SET
        status     = p_new_status,
        updated_at = NOW()
    WHERE id = v_task.request_id;

    -- If completed, mark the food_listing as completed
    IF p_new_status = 'delivered' THEN
        UPDATE public.food_listings
        SET
            status     = 'completed',
            updated_at = NOW()
        WHERE id = (SELECT listing_id FROM public.food_requests WHERE id = v_task.request_id);
    END IF;

    RETURN json_build_object(
        'success', true,
        'task_id', p_task_id,
        'new_status', p_new_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_task_status(UUID, UUID, TEXT) TO authenticated;

-- ─── SECTION 3: Storage Privacy for identity_docs ───────────────────────────

-- Ensure identity_docs bucket is private
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
