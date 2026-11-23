-- Fresh projects need the same enum types as existing deployments.
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('admin', 'donor', 'receiver', 'volunteer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.listing_status AS ENUM ('active', 'reserved', 'accepted', 'picked_up', 'completed', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.request_status AS ENUM ('pending', 'accepted', 'approved', 'assigned', 'picked_up', 'delivered', 'fulfilled', 'completed', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.volunteer_status AS ENUM ('open', 'pending_acceptance', 'assigned', 'in_progress', 'picked_up', 'delivered', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Adapted RBAC Schema for existing 'user_role' enum on public.profiles

-- Create permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create role_permissions table mapping the existing user_role enum to permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
    -- We cast the role to text locally or use the exact enum.
    -- Using the enum directly keeps it strictly typed if it exists!
    -- Assuming 'user_role' is an enum type that exists:
    role public.user_role NOT NULL,
    permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_id)
);

-- Enable RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Allow public read access to permissions mapping
CREATE POLICY "Public read access to permissions" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "Public read access to role_permissions" ON public.role_permissions FOR SELECT USING (true);


-- Helper Function: Check Permissions
CREATE OR REPLACE FUNCTION public.has_permission(user_id_param UUID, target_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_current_role public.user_role;
    permission_exists BOOLEAN;
BEGIN
    -- 1. Get the user's enum role from profiles
    SELECT role INTO user_current_role FROM public.profiles WHERE id = user_id_param;

    -- 2. Check if that role has the target permission
    SELECT EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        JOIN public.permissions p ON rp.permission_id = p.id
        WHERE rp.role = user_current_role
        AND p.name = target_permission
    ) INTO permission_exists;

    RETURN permission_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Seed Permissions
INSERT INTO public.permissions (name, description) VALUES
    ('users.read', 'Read system users'),
    ('users.verify', 'Verify unknown users'),
    ('food.create', 'Create food listings'),
    ('food.update_own', 'Update own listings'),
    ('food.delete_own', 'Delete own listings'),
    ('food.read_all', 'Read all global food listings/donations'),
    ('requests.create', 'Create a request for food'),
    ('requests.update', 'Update own request for food'),
    ('requests.read_own', 'Read own food requests'),
    ('requests.read_all', 'Read all global food requests'),
    ('donations.manage', 'Manage logistics of donations'),
    ('tasks.view_assigned', 'View logistics mappings and assigned workflows')
ON CONFLICT (name) DO NOTHING;

-- Map Permissions to Roles (user_role enum)
DO $$
DECLARE
    p_id UUID;
    p_name TEXT;
    
    admin_perms TEXT[] := ARRAY['users.read', 'users.verify', 'food.create', 'food.update_own', 'food.delete_own', 'food.read_all', 'requests.create', 'requests.update', 'requests.read_own', 'requests.read_all', 'donations.manage', 'tasks.view_assigned'];
    donor_perms TEXT[] := ARRAY['food.create', 'food.update_own', 'food.delete_own'];
    volun_perms TEXT[] := ARRAY['tasks.view_assigned', 'food.read_all', 'requests.read_all'];
    recei_perms TEXT[] := ARRAY['requests.create', 'requests.update', 'requests.read_own', 'food.read_all'];
BEGIN
    -- Map Admin
    FOREACH p_name IN ARRAY admin_perms LOOP
        SELECT id INTO p_id FROM public.permissions WHERE name = p_name;
        IF p_id IS NOT NULL THEN
            INSERT INTO public.role_permissions (role, permission_id) VALUES ('admin'::public.user_role, p_id) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    -- Map Donor
    FOREACH p_name IN ARRAY donor_perms LOOP
        SELECT id INTO p_id FROM public.permissions WHERE name = p_name;
        IF p_id IS NOT NULL THEN
            INSERT INTO public.role_permissions (role, permission_id) VALUES ('donor'::public.user_role, p_id) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    -- Map Volunteer
    FOREACH p_name IN ARRAY volun_perms LOOP
        SELECT id INTO p_id FROM public.permissions WHERE name = p_name;
        IF p_id IS NOT NULL THEN
            INSERT INTO public.role_permissions (role, permission_id) VALUES ('volunteer'::public.user_role, p_id) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    -- Map Receiver
    FOREACH p_name IN ARRAY recei_perms LOOP
        SELECT id INTO p_id FROM public.permissions WHERE name = p_name;
        IF p_id IS NOT NULL THEN
            INSERT INTO public.role_permissions (role, permission_id) VALUES ('receiver'::public.user_role, p_id) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
END $$;
