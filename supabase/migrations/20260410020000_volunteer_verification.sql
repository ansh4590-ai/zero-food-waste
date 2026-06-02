-- =============================================================================
-- Zero Food Waste: Volunteer Verification Schema Update
-- Safe to run multiple times (idempotent)
-- =============================================================================

-- Add verification tracking columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unset';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_rejection_reason TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false; -- ensuring it's officially typed if it was added implicitly earlier

-- Map existing verified states if needed (if any admins verified someone previously)
UPDATE public.profiles 
SET verification_status = 'approved' 
WHERE is_verified = true AND verification_status = 'unset';

-- ─── BUCKET SETUP ──────────────────────────────────────────────────────────────
-- Create a storage bucket for identity documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('identity_docs', 'identity_docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for Identity Docs (Strict!)
-- 1. Volunteers can insert their own documents
DROP POLICY IF EXISTS "Users can upload their own docs" ON storage.objects;
CREATE POLICY "Users can upload their own docs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'identity_docs' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2. Volunteers can read their own documents (for previewing pending submissions)
DROP POLICY IF EXISTS "Users can view their own docs" ON storage.objects;
CREATE POLICY "Users can view their own docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'identity_docs' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Admins can view ALL identity documents
DROP POLICY IF EXISTS "Admins can view all docs" ON storage.objects;
CREATE POLICY "Admins can view all docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'identity_docs' AND
    public.has_permission(auth.uid(), 'users.verify')
  );
