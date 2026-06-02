-- =============================================================================
-- Fix auto_dispatch_closest_volunteer Coordinates Source
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auto_dispatch_closest_volunteer()
RETURNS TRIGGER AS $$
DECLARE
    v_volunteer_id UUID;
    v_target_title TEXT;
    v_pickup_lat FLOAT8;
    v_pickup_lng FLOAT8;
BEGIN
    -- Prevent infinite loops if we happen to upate food_requests within this
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- 2. Add Safe Null Handling
    IF NEW.drop_lat IS NULL OR NEW.drop_lng IS NULL THEN
        RETURN NEW;
    END IF;

    -- If Pickup Source Needed
    -- Join food_listings:
    SELECT pickup_lat, pickup_lng, title 
    INTO v_pickup_lat, v_pickup_lng, v_target_title
    FROM public.food_listings
    WHERE id = NEW.listing_id;

    -- Find the closest volunteer (using Pythagorean approximation for performance on local points)
    -- We want them close to the pickup source initially!
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
        POW(location_lat - COALESCE(v_pickup_lat, NEW.drop_lat), 2) + POW(location_lng - COALESCE(v_pickup_lng, NEW.drop_lng), 2)
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

        -- Send a push notification to that exact volunteer
        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (v_volunteer_id, 'New Dispatch Ping!', 'You have been automatically assigned a new pickup request: ' || v_target_title || '. Please accept or decline.', 'task_assigned', '/tasks');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger just to ensure it's still properly attached
DROP TRIGGER IF EXISTS trigger_auto_dispatch_closest_volunteer ON public.food_requests;
CREATE TRIGGER trigger_auto_dispatch_closest_volunteer
    AFTER INSERT ON public.food_requests
    FOR EACH ROW EXECUTE FUNCTION public.auto_dispatch_closest_volunteer();
