-- =============================================================================
-- Migration: 20261121000000_revoke_qr_token_column_access.sql
-- Purpose:   Prevent authenticated users from directly reading QR token columns.
--            QR tokens (pickup_qr_token, delivery_qr_token and their siblings)
--            must only be accessible through SECURITY DEFINER RPCs or the
--            server-side /api/tasks/:taskId/generate-qr endpoint.
--
-- This migration:
--   1. Re-creates (idempotently) the three SECURITY DEFINER helper functions
--      that eliminate RLS mutual-recursion between volunteer_tasks and
--      food_listings (can_donor_view_task, can_receiver_view_task,
--      can_volunteer_view_listing).
--   2. Revokes ALL privileges on volunteer_tasks from PUBLIC, anon, authenticated.
--   3. Grants SELECT on only the safe (non-token) columns to authenticated.
--   4. Grants ALL PRIVILEGES to service_role (preserves server-side access).
--   5. Re-creates the tasks_select RLS policy using the SECURITY DEFINER helpers.
--   6. Re-creates the listings_select_authorized RLS policy using helpers.
--
-- QR columns NEVER granted: pickup_qr_token, pickup_qr_expires_at,
--   pickup_qr_used, delivery_qr_token, delivery_qr_expires_at, delivery_qr_used.
--
-- Frontend impact: NONE — all dashboard pages already use explicit column lists
--   with no QR token columns (confirmed in prior audit). QRCodeCard fetches tokens
--   exclusively via POST /api/tasks/:taskId/generate-qr (authenticated server route).
--
-- DO NOT execute against live Supabase directly — run via Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SECURITY DEFINER helper functions (idempotent — safe to re-run)
--    These break the mutual RLS recursion between volunteer_tasks ↔ food_listings
--    by bypassing RLS checks inside each helper.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_donor_view_task(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.food_requests fr
    JOIN public.food_listings fl ON fl.id = fr.listing_id
    WHERE fr.id = p_request_id
      AND fl.donor_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_receiver_view_task(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.food_requests fr
    WHERE fr.id = p_request_id
      AND fr.receiver_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_volunteer_view_listing(p_listing_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.food_requests fr
    JOIN public.volunteer_tasks vt ON vt.request_id = fr.id
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE fr.listing_id = p_listing_id
      AND p.role = 'volunteer'::public.user_role
      AND p.verification_status = 'approved'
      AND (
        (vt.volunteer_id = auth.uid() AND vt.status IN (
          'pending_acceptance'::public.volunteer_status,
          'assigned'::public.volunteer_status,
          'picked_up'::public.volunteer_status
        ))
        OR (vt.volunteer_id IS NULL AND vt.status = 'open'::public.volunteer_status)
      )
  );
$$;

-- Strip PUBLIC/anon EXECUTE; grant only to authenticated
REVOKE ALL ON FUNCTION public.can_donor_view_task(UUID)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_receiver_view_task(UUID)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_volunteer_view_listing(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_donor_view_task(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_receiver_view_task(UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_volunteer_view_listing(UUID)  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Revoke ALL privileges on volunteer_tasks from non-service roles.
--    This removes both table-level and column-level SELECT that was previously
--    inherited from GRANT ALL PRIVILEGES or Supabase defaults.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.volunteer_tasks FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grant SELECT on ONLY the safe columns to authenticated.
--    QR token columns are intentionally excluded:
--      pickup_qr_token, pickup_qr_expires_at, pickup_qr_used
--      delivery_qr_token, delivery_qr_expires_at, delivery_qr_used
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT (
  id,
  request_id,
  volunteer_id,
  status,
  created_at,
  updated_at,
  cancellation_reason,
  cancelled_at,
  pickup_verified_at,
  delivery_verified_at,
  picked_up_at,
  delivered_at,
  completed_at
) ON TABLE public.volunteer_tasks TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Preserve full service_role access (required by server.ts, Edge Functions,
--    generate_qr_token, verify_qr_token, auto_expire_stale_tasks).
-- ─────────────────────────────────────────────────────────────────────────────

GRANT ALL PRIVILEGES ON TABLE public.volunteer_tasks TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Re-create tasks_select RLS policy using SECURITY DEFINER helpers.
--    Avoids the mutual recursion with food_listings that caused error 42P17.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tasks_select" ON public.volunteer_tasks;

CREATE POLICY "tasks_select" ON public.volunteer_tasks
FOR SELECT
TO authenticated
USING (
  -- Volunteer sees their own tasks
  auth.uid() = volunteer_id
  -- Donor sees tasks on their listings
  OR public.can_donor_view_task(request_id)
  -- Receiver sees tasks on their requests
  OR public.can_receiver_view_task(request_id)
  -- Approved volunteer sees open/unassigned tasks
  OR (
    status = 'open'::public.volunteer_status
    AND volunteer_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'volunteer'::public.user_role
        AND p.verification_status = 'approved'
    )
  )
  -- Admin / staff sees everything
  OR public.has_permission(auth.uid(), 'users.read')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Re-create listings_select_authorized RLS policy using SECURITY DEFINER
--    helper (avoids recursion through volunteer_tasks).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "listings_select_authorized" ON public.food_listings;

CREATE POLICY "listings_select_authorized" ON public.food_listings
FOR SELECT
TO authenticated
USING (
  -- Donor sees their own listings
  auth.uid() = donor_id
  -- Receiver sees listings linked to their requests
  OR EXISTS (
    SELECT 1 FROM public.food_requests fr
    WHERE fr.listing_id = food_listings.id
      AND fr.receiver_id = auth.uid()
  )
  -- Approved volunteer sees listings they are eligible for
  OR public.can_volunteer_view_listing(id)
  -- Admin / staff sees everything
  OR public.has_permission(auth.uid(), 'users.read')
);

COMMIT;

-- =============================================================================
-- POST-MIGRATION VERIFICATION (run separately in Supabase SQL Editor)
-- =============================================================================
--
-- 1. QR token columns must NOT be readable by authenticated:
-- SELECT
--   has_column_privilege('authenticated','public.volunteer_tasks','pickup_qr_token','SELECT')   AS auth_can_read_pickup_token,
--   has_column_privilege('authenticated','public.volunteer_tasks','delivery_qr_token','SELECT') AS auth_can_read_delivery_token,
--   has_column_privilege('authenticated','public.volunteer_tasks','id','SELECT')                AS auth_can_read_id,
--   has_column_privilege('authenticated','public.volunteer_tasks','status','SELECT')            AS auth_can_read_status;
-- Expected: false | false | true | true
--
-- 2. anon must have no SELECT on volunteer_tasks:
-- SELECT has_table_privilege('anon','public.volunteer_tasks','SELECT') AS anon_select_tasks;
-- Expected: false
--
-- 3. service_role must retain full access:
-- SELECT has_table_privilege('service_role','public.volunteer_tasks','SELECT') AS service_select_tasks;
-- Expected: true
--
-- 4. QR RPCs must remain callable by authenticated:
-- SELECT
--   has_function_privilege('authenticated','public.generate_qr_token(uuid,text)','EXECUTE') AS can_generate_qr,
--   has_function_privilege('authenticated','public.verify_qr_token(text,uuid)','EXECUTE')   AS can_verify_qr;
-- Expected: true | true
--
-- 5. No infinite recursion — approved volunteer should see their tasks:
-- BEGIN;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claims" = '{"sub":"fb5bf226-d896-4de1-ab33-a260044e6242","role":"authenticated"}';
--   SELECT id, status, request_id FROM public.volunteer_tasks;
--   -- Expected: 3 rows, no 42P17 error
-- ROLLBACK;
