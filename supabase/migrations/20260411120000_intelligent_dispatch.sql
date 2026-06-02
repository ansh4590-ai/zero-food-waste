-- =============================================================================
-- Zero Food Waste: Intelligent Dispatch & Notifications Upgrade
-- =============================================================================

-- ─── 1. NOTIFICATIONS SYSTEM ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- e.g. 'task_assigned', 'status_update', 'system'
    read BOOLEAN DEFAULT false,
    link TEXT, -- optional frontend route link
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own notifications
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can update their own notifications (to mark as read, etc.)
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Enable Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── 2. VOLUNTEER TASK ACCEPT/DECLINE ────────────────────────────────────────

-- Add pending_acceptance status support if it doesn't exist contextually.
-- We are just using a text value 'pending_acceptance', so no enum alteration is strictly required.


-- ─── 3. NOTIFICATION TRIGGERS (Automated Alerts) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_food_request_update()
RETURNS TRIGGER AS $$
DECLARE
    v_donor_id UUID;
    v_target_title TEXT;
BEGIN
    -- Only act if status actually changed
    IF (TG_OP = 'UPDATE' AND OLD.status = NEW.status) THEN
        RETURN NEW;
    END IF;

    -- Fetch listing details for context
    SELECT donor_id, title INTO v_donor_id, v_target_title
    FROM public.food_listings
    WHERE id = NEW.listing_id;

    -- Situation: Request Assigned -> notify receiver
    IF NEW.status = 'assigned' THEN
        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (NEW.receiver_id, 'Logistics Assigned', 'A volunteer has been assigned to coordinate your food pickup for: ' || v_target_title, 'status_update', '/requests');
    END IF;

    -- Situation: Request Picked Up -> notify receiver
    IF NEW.status = 'picked_up' THEN
        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (NEW.receiver_id, 'Food is on the way!', 'Your requested food (' || v_target_title || ') has been picked up and is en route.', 'status_update', '/requests');
    END IF;
    
    -- Situation: Request Delivered -> notify donor and receiver
    IF NEW.status = 'delivered' THEN
        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (NEW.receiver_id, 'Delivery Completed', 'Your food has arrived. Thank you for using Zero Food Waste!', 'status_update', '/requests');

        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (v_donor_id, 'Donation Delivered', 'Great news! Your donation (' || v_target_title || ') was successfully delivered.', 'status_update', '/dashboard');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_on_food_request_update ON public.food_requests;
CREATE TRIGGER trigger_notify_on_food_request_update
    AFTER UPDATE ON public.food_requests
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_food_request_update();


-- ─── 4. GEOSPATIAL AUTO-ASSIGNMENT ENGINE ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_dispatch_closest_volunteer()
RETURNS TRIGGER AS $$
DECLARE
    v_volunteer_id UUID;
    v_target_title TEXT;
BEGIN
    -- Prevent infinite loops if we happen to upate food_requests within this
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- We only auto-dispatch if coordinates are provided
    IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
        RETURN NEW;
    END IF;

    -- Find the closest volunteer (using Pythagorean approximation for performance on local points)
    SELECT id INTO v_volunteer_id
    FROM public.profiles
    WHERE role = 'volunteer' 
      AND verification_status = 'approved'
      AND location_lat IS NOT NULL 
      AND location_lng IS NOT NULL
      AND id != NEW.receiver_id -- Volunteer cannot be the receiver
      -- Ensure they do not have > 3 active tasks
      AND (
          SELECT COUNT(*) 
          FROM public.volunteer_tasks 
          WHERE volunteer_id = profiles.id 
          AND status IN ('assigned', 'picked_up', 'pending_acceptance')
      ) < 3
    ORDER BY (
        POW(location_lat - NEW.latitude, 2) + POW(location_lng - NEW.longitude, 2)
    ) ASC
    LIMIT 1;

    -- If we found someone, assign them!
    IF v_volunteer_id IS NOT NULL THEN
        -- Create the volunteer task in pending_acceptance state
        INSERT INTO public.volunteer_tasks (request_id, volunteer_id, status)
        VALUES (NEW.id, v_volunteer_id, 'pending_acceptance');
        
        -- Update the main request explicitly to assigned so no one else grabs it from broadcast
        UPDATE public.food_requests 
        SET status = 'assigned', updated_at = NOW()
        WHERE id = NEW.id;

        -- Fetch listing title for notification
        SELECT title INTO v_target_title FROM public.food_listings WHERE id = NEW.listing_id;

        -- Send a push notification to that exact volunteer
        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (v_volunteer_id, 'New Dispatch Ping!', 'You have been automatically assigned a new pickup request: ' || v_target_title || '. Please accept or decline.', 'task_assigned', '/tasks');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger AFTER INSERT so spatial coordinates are finalized
DROP TRIGGER IF EXISTS trigger_auto_dispatch_closest_volunteer ON public.food_requests;
CREATE TRIGGER trigger_auto_dispatch_closest_volunteer
    AFTER INSERT ON public.food_requests
    FOR EACH ROW EXECUTE FUNCTION public.auto_dispatch_closest_volunteer();


-- ─── 5. ACCEPT/DECLINE RPC HELPER ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_task_assignment(
    p_task_id UUID,
    p_volunteer_id UUID,
    p_action TEXT -- 'accept' or 'decline'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
BEGIN
    -- Verify task exists and is pending
    SELECT * INTO v_task
    FROM public.volunteer_tasks
    WHERE id = p_task_id AND volunteer_id = p_volunteer_id AND status = 'pending_acceptance'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Task not found or already processed.');
    END IF;

    IF p_action = 'accept' THEN
        -- Move task to assigned active state
        UPDATE public.volunteer_tasks SET status = 'assigned', updated_at = NOW() WHERE id = p_task_id;
        RETURN json_build_object('success', true);
        
    ELSIF p_action = 'decline' THEN
        -- Move task to deleted/cancelled and revert the food request so it can be claimed by others
        DELETE FROM public.volunteer_tasks WHERE id = p_task_id;
        
        UPDATE public.food_requests 
        SET status = 'pending', updated_at = NOW() 
        WHERE id = v_task.request_id;
        
        RETURN json_build_object('success', true);
    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid action');
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_task_assignment(UUID, UUID, TEXT) TO authenticated;
