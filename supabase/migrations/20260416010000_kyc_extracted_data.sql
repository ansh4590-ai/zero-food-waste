-- =============================================================================
-- Smart KYC Engine v2: OCR Extracted Data Storage
-- Safe to run multiple times (idempotent)
-- =============================================================================

-- Store OCR-extracted Aadhaar data (name, number, DOB, etc.)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT '{}'::jsonb;
