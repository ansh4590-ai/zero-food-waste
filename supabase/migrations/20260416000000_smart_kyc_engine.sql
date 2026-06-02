-- =============================================================================
-- Smart KYC Engine: AI-Assisted Scoring & Automated Decision Columns
-- Safe to run multiple times (idempotent)
-- =============================================================================

-- ─── NEW KYC COLUMNS ─────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_score INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_auto_status TEXT DEFAULT 'pending';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS face_match_score FLOAT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS document_verified BOOLEAN DEFAULT false;

-- ─── STORAGE RLS FIX ─────────────────────────────────────────────────────────
-- Path format: verification/{user_id}/aadhaar_123.jpg
-- storage.foldername returns folder segments:
--   [1] = 'verification'
--   [2] = '{user_id}'
-- Previous policy incorrectly used [1], which matched the literal 'verification' string

-- 1. Users can upload their own documents
DROP POLICY IF EXISTS "Users can upload their own docs" ON storage.objects;
CREATE POLICY "Users can upload their own docs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'identity_docs' AND
    auth.uid()::text = (storage.foldername(name))[2]
  );

-- 2. Users can view their own documents
DROP POLICY IF EXISTS "Users can view their own docs" ON storage.objects;
CREATE POLICY "Users can view their own docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'identity_docs' AND
    auth.uid()::text = (storage.foldername(name))[2]
  );

-- 3. Admins can view ALL identity documents (unchanged)
DROP POLICY IF EXISTS "Admins can view all docs" ON storage.objects;
CREATE POLICY "Admins can view all docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'identity_docs' AND
    public.has_permission(auth.uid(), 'users.verify')
  );
