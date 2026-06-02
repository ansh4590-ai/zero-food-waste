-- =============================================================================
-- Zero Food Waste: Core Schema Migration
-- Safe to run multiple times (fully idempotent)
-- =============================================================================

-- ─── 1. PROFILES ────────────────────────────────────────────────────────────────
-- Ensures the profiles table exists. The user_role enum must already exist
-- from the RBAC migration (20260409000000_rbac.sql).
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    role public.user_role DEFAULT 'donor'::public.user_role,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. FOOD LISTINGS (Donor) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.food_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID REFERENCES public.profiles(id) NOT NULL,
    title TEXT NOT NULL,
    food_category TEXT DEFAULT 'other',
    quantity_description TEXT,
    image_url TEXT,
    expiry_time TIMESTAMPTZ,
    pickup_window TEXT,
    location_name TEXT,
    latitude FLOAT8,
    longitude FLOAT8,
    status TEXT DEFAULT 'active',  -- active | accepted | picked_up | completed | expired
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.food_listings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_food_listings_status ON public.food_listings(status);
CREATE INDEX IF NOT EXISTS idx_food_listings_donor  ON public.food_listings(donor_id);

-- ─── 3. FOOD REQUESTS (Receiver) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.food_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID REFERENCES public.food_listings(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES public.profiles(id) NOT NULL,
    status TEXT DEFAULT 'pending',  -- pending | approved | fulfilled | rejected
    receiver_rating INTEGER,
    receiver_feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Upgrade path
ALTER TABLE public.food_requests ADD COLUMN IF NOT EXISTS receiver_rating INTEGER;
ALTER TABLE public.food_requests ADD COLUMN IF NOT EXISTS receiver_feedback TEXT;
ALTER TABLE public.food_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_food_requests_status   ON public.food_requests(status);
CREATE INDEX IF NOT EXISTS idx_food_requests_receiver ON public.food_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_food_requests_listing  ON public.food_requests(listing_id);

-- ─── 4. VOLUNTEER TASKS (Logistics) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.volunteer_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.food_requests(id) ON DELETE CASCADE,
    volunteer_id UUID REFERENCES public.profiles(id),
    status TEXT DEFAULT 'open',  -- open | assigned | picked_up | delivered | completed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    rating INTEGER,
    feedback TEXT
);

CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_status    ON public.volunteer_tasks(status);
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_volunteer ON public.volunteer_tasks(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_request   ON public.volunteer_tasks(request_id);

-- ─── 5. ENABLE RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_listings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_tasks ENABLE ROW LEVEL SECURITY;

-- ─── 6. RLS POLICIES (idempotent with DROP IF EXISTS) ───────────────────────────

-- Profiles
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Food Listings
DROP POLICY IF EXISTS "listings_select" ON public.food_listings;
CREATE POLICY "listings_select" ON public.food_listings
  FOR SELECT USING (
    status = 'active'
    OR auth.uid() = donor_id
    OR public.has_permission(auth.uid(), 'food.read_all')
  );

DROP POLICY IF EXISTS "listings_insert_donor" ON public.food_listings;
CREATE POLICY "listings_insert_donor" ON public.food_listings
  FOR INSERT WITH CHECK (auth.uid() = donor_id);

DROP POLICY IF EXISTS "listings_update_donor" ON public.food_listings;
CREATE POLICY "listings_update_donor" ON public.food_listings
  FOR UPDATE USING (
    auth.uid() = donor_id
    OR public.has_permission(auth.uid(), 'food.read_all')
  );

-- Food Requests
DROP POLICY IF EXISTS "requests_select" ON public.food_requests;
CREATE POLICY "requests_select" ON public.food_requests
  FOR SELECT USING (
    auth.uid() = receiver_id
    OR public.has_permission(auth.uid(), 'requests.read_all')
  );

DROP POLICY IF EXISTS "requests_insert_receiver" ON public.food_requests;
CREATE POLICY "requests_insert_receiver" ON public.food_requests
  FOR INSERT WITH CHECK (auth.uid() = receiver_id);

DROP POLICY IF EXISTS "requests_update_receiver" ON public.food_requests;
CREATE POLICY "requests_update_receiver" ON public.food_requests
  FOR UPDATE USING (
    auth.uid() = receiver_id
    OR public.has_permission(auth.uid(), 'requests.read_all')
  );

-- Volunteer Tasks
DROP POLICY IF EXISTS "tasks_select" ON public.volunteer_tasks;
CREATE POLICY "tasks_select" ON public.volunteer_tasks
  FOR SELECT USING (
    status = 'open'
    OR auth.uid() = volunteer_id
    OR public.has_permission(auth.uid(), 'tasks.view_assigned')
  );

DROP POLICY IF EXISTS "tasks_insert" ON public.volunteer_tasks;
CREATE POLICY "tasks_insert" ON public.volunteer_tasks
  FOR INSERT WITH CHECK (
    auth.uid() = volunteer_id
  );

DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks;
CREATE POLICY "tasks_update" ON public.volunteer_tasks
  FOR UPDATE USING (
    (status = 'open')  -- anyone can claim open tasks
    OR auth.uid() = volunteer_id
    OR public.has_permission(auth.uid(), 'tasks.view_assigned')
  );

-- ─── 7. TRIGGER: auto-create volunteer_task on food_request insert ──────────────
CREATE OR REPLACE FUNCTION public.create_volunteer_task_for_request()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.volunteer_tasks (request_id, status)
    VALUES (NEW.id, 'open');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_volunteer_task ON public.food_requests;
CREATE TRIGGER trigger_create_volunteer_task
    AFTER INSERT ON public.food_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.create_volunteer_task_for_request();

-- ─── 8. EDGE FUNCTION HELPER: atomic task claiming ──────────────────────────────
-- Prevents race conditions where two volunteers claim the same task simultaneously.
CREATE OR REPLACE FUNCTION public.claim_volunteer_task(
    task_id UUID,
    claiming_volunteer_id UUID
)
RETURNS JSON AS $$
DECLARE
    task_record RECORD;
BEGIN
    -- Lock the row for update to prevent races
    SELECT * INTO task_record
    FROM public.volunteer_tasks
    WHERE id = task_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Task not found');
    END IF;

    IF task_record.status != 'open' THEN
        RETURN json_build_object('success', false, 'error', 'Task already claimed by another volunteer');
    END IF;

    UPDATE public.volunteer_tasks
    SET status = 'assigned',
        volunteer_id = claiming_volunteer_id,
        updated_at = NOW()
    WHERE id = task_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 9. ENABLE REALTIME ─────────────────────────────────────────────────────────
-- These must be run separately if not already enabled.
-- Note: Supabase requires table-level opt-in for realtime.
ALTER PUBLICATION supabase_realtime ADD TABLE public.food_listings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.food_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.volunteer_tasks;
