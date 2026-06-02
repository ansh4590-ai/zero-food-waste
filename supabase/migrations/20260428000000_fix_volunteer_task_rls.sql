-- =========================================================
-- Fix: Volunteer_tasks RLS policy was blocking volunteers
-- from reading their own assigned/pending_acceptance tasks.
-- The old "tasks_select" policy only allowed status='open',
-- which prevented the Volunteer dashboard from ever showing
-- dispatched tasks.
-- =========================================================

-- Fix volunteer_tasks SELECT policy
DROP POLICY IF EXISTS "tasks_select" ON public.volunteer_tasks;
CREATE POLICY "tasks_select" ON public.volunteer_tasks
  FOR SELECT USING (
    status = 'open'                         -- anyone can see open (broadcast) tasks
    OR auth.uid() = volunteer_id            -- assigned volunteer can always see their own tasks
    OR public.has_permission(auth.uid(), 'tasks.read_all')  -- admins see everything
  );

-- Fix volunteer_tasks UPDATE policy
-- Old policy only allowed updates when status='open', blocking volunteers from
-- accepting/declining/progressing their own assigned tasks.
DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks;
CREATE POLICY "tasks_update" ON public.volunteer_tasks
  FOR UPDATE USING (
    status = 'open'                         -- anyone can claim an open task
    OR auth.uid() = volunteer_id            -- assigned volunteer can update their own task
    OR public.has_permission(auth.uid(), 'tasks.read_all')
  );

-- Fix volunteer_tasks INSERT policy
-- The old policy required auth.uid() = volunteer_id, but auto_dispatch
-- runs as SECURITY DEFINER and inserts tasks on behalf of the volunteer.
-- Allow service role / SECURITY DEFINER functions to insert freely,
-- and volunteers to self-claim open tasks.
DROP POLICY IF EXISTS "tasks_insert" ON public.volunteer_tasks;
CREATE POLICY "tasks_insert" ON public.volunteer_tasks
  FOR INSERT WITH CHECK (
    auth.uid() = volunteer_id              -- volunteer self-claims
    OR public.has_permission(auth.uid(), 'tasks.read_all')  -- admin/service
  );
