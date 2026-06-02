-- =============================================================================
-- Zero Food Waste: Secure Profiles Trigger & RLS Lockdown
-- Prevents clients from injecting `role: 'admin'` during signup.
-- =============================================================================

-- 1. Lock down profile insertion and updates
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
-- We do not recreate the insert policy; profiles are now ONLY created via the DB trigger below.

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
-- Recreate update policy, but we will enforce role immutability via a trigger instead of complex RLS to avoid recursion issues.
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Prevent role updates via trigger (only service_role or superuser can change role)
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
    -- If the role is being changed and the current user is an authenticated client, block it.
    -- We allow changes if the user is the service_role (meaning our backend Express server).
    IF NEW.role IS DISTINCT FROM OLD.role AND auth.role() = 'authenticated' THEN
        RAISE EXCEPTION 'Unauthorized: Clients cannot update their own role.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_protect_profile_role ON public.profiles;
CREATE TRIGGER trigger_protect_profile_role
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_role();

-- 3. Auto-creation of profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    requested_role TEXT;
    assigned_role public.user_role;
    raw_full_name TEXT;
    raw_phone TEXT;
BEGIN
    -- Extract metadata if passed by client
    requested_role := NEW.raw_user_meta_data->>'role';
    raw_full_name := NEW.raw_user_meta_data->>'full_name';
    raw_phone := NEW.raw_user_meta_data->>'phone';
    
    -- Strict validation: If a client tries to sign up as admin directly, fallback to donor.
    IF requested_role = 'admin' THEN
        assigned_role := 'donor'::public.user_role;
    ELSIF requested_role IN ('donor', 'volunteer', 'receiver') THEN
        assigned_role := requested_role::public.user_role;
    ELSE
        assigned_role := 'donor'::public.user_role;
    END IF;

    -- Insert into public.profiles
    INSERT INTO public.profiles (id, full_name, phone, role)
    VALUES (NEW.id, raw_full_name, raw_phone, assigned_role);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
