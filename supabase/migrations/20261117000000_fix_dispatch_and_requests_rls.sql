-- =============================================================================
-- Zero Food Waste: Fix Volunteer Dispatch and Task Visibility RLS
-- 
-- Root Cause:
-- The `food_requests` table had a legacy SELECT policy ("requests_select")
-- restricted exclusively to `auth.uid() = receiver_id OR admin`.
-- When a volunteer queried `volunteer_tasks` joined with `food_requests`,
-- Supabase PostgREST silently stripped the nested `food_requests` object (null)
-- because of RLS denial. Consequently, the frontend discarded the assigned task,
-- leaving "My Active Routes" and "Priority Broadcasts" displaying 0 tasks.
--
-- This migration provides secure, performant SECURITY DEFINER helper functions
-- and grants proper SELECT access to assigned/broadcasting volunteers and donors.
-- =============================================================================

-- ─── SECTION 1: Helper Functions (SECURITY DEFINER) ──────────────────────────

-- 1a. Check if caller is an assigned volunteer or viewing unassigned broadcast tasks
CREATE OR REPLACE FUNCTION public.can_volunteer_view_request(p_request_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.volunteer_tasks
    WHERE request_id = p_request_id
      AND (
        volunteer_id = p_user_id 
        OR (status IN ('open', 'pending_acceptance') AND volunteer_id IS NULL)
      )
  );
$$;

-- 1b. Check if caller is the donor who owns the food listing being requested
CREATE OR REPLACE FUNCTION public.can_donor_view_request(p_listing_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.food_listings
    WHERE id = p_listing_id
      AND donor_id = p_user_id
  );
$$;

-- 1c. Check if caller and target profile are co-participants in an active task (volunteer, receiver, donor)
CREATE OR REPLACE FUNCTION public.can_view_profile_for_task(p_target_profile_id UUID, p_caller_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.volunteer_tasks vt
    JOIN public.food_requests fr ON fr.id = vt.request_id
    JOIN public.food_listings fl ON fl.id = fr.listing_id
    WHERE (vt.volunteer_id = p_caller_id OR fr.receiver_id = p_caller_id OR fl.donor_id = p_caller_id)
      AND p_target_profile_id IN (vt.volunteer_id, fr.receiver_id, fl.donor_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_volunteer_view_request(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_donor_view_request(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile_for_task(UUID, UUID) TO authenticated, anon;

-- ─── SECTION 2: Fix food_requests SELECT Policy ──────────────────────────────

DROP POLICY IF EXISTS "requests_select" ON public.food_requests;
DROP POLICY IF EXISTS "requests_select_volunteer" ON public.food_requests;
DROP POLICY IF EXISTS "requests_select_all_authorized" ON public.food_requests;

CREATE POLICY "requests_select_all_authorized" ON public.food_requests
  FOR SELECT USING (
    -- 1. Receiver who created the request
    auth.uid() = receiver_id
    -- 2. Pending requests (visible to volunteers evaluating broadcast tasks)
    OR status = 'pending'
    -- 3. Donor of the requested listing
    OR public.can_donor_view_request(listing_id, auth.uid())
    -- 4. Volunteer assigned to or claiming this request
    OR public.can_volunteer_view_request(id, auth.uid())
    -- 5. Admins with requests.read_all permission
    OR public.has_permission(auth.uid(), 'requests.read_all')
  );

-- ─── SECTION 3: Fix volunteer_tasks SELECT and UPDATE Policies ───────────────

DROP POLICY IF EXISTS "tasks_select" ON public.volunteer_tasks;
CREATE POLICY "tasks_select" ON public.volunteer_tasks
  FOR SELECT USING (
    -- Broadcast pool: open or pending acceptance with no volunteer assigned yet
    status = 'open'
    OR (status = 'pending_acceptance' AND volunteer_id IS NULL)
    -- Assigned volunteer sees their own tasks
    OR auth.uid() = volunteer_id
    -- Admin sees everything
    OR public.has_permission(auth.uid(), 'tasks.read_all')
  );

DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks;
CREATE POLICY "tasks_update" ON public.volunteer_tasks
  FOR UPDATE USING (
    -- Broadcast pool can be claimed
    status = 'open'
    OR (status = 'pending_acceptance' AND volunteer_id IS NULL)
    -- Assigned volunteer can update/accept/decline/advance their own task
    OR auth.uid() = volunteer_id
    -- Admin can update any task
    OR public.has_permission(auth.uid(), 'tasks.read_all')
  );

-- ─── SECTION 4: Fix food_listings SELECT Policy ──────────────────────────────

DROP POLICY IF EXISTS "listings_select" ON public.food_listings;
DROP POLICY IF EXISTS "listings_select_volunteer" ON public.food_listings;
DROP POLICY IF EXISTS "listings_select_all" ON public.food_listings;

CREATE POLICY "listings_select_all" ON public.food_listings
  FOR SELECT USING (
    -- Active listings (available for pickup/request)
    -- Reserved listings (claimed by a receiver, being picked up by a volunteer)
    -- Completed listings (delivered)
    status IN ('active', 'reserved', 'completed')
    OR auth.uid() = donor_id
    OR public.has_permission(auth.uid(), 'food.read_all')
  );

-- ─── SECTION 5: Fix profiles SELECT Policy for Task Coordination ─────────────

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_authorized" ON public.profiles;

CREATE POLICY "profiles_select_all_authorized" ON public.profiles
  FOR SELECT USING (
    -- User reading own profile
    auth.uid() = id
    -- Participants coordinating on an active logistics task
    OR public.can_view_profile_for_task(id, auth.uid())
    -- Admins with users.read permission
    OR public.has_permission(auth.uid(), 'users.read')
  );
