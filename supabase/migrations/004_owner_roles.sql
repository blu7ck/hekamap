-- Owner and role management hardening
-- 1) Add helper to check owner
-- 2) Add RPC to set roles (only owner)
-- 3) Prevent multiple owners
-- 4) Add index for faster role checks

-- Safety: if re-run
DROP FUNCTION IF EXISTS public.is_owner CASCADE;
DROP FUNCTION IF EXISTS public.set_user_role(UUID, user_role) CASCADE;

-- Fast lookup by role
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

-- Helper: is current user owner?
CREATE OR REPLACE FUNCTION public.is_owner(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT role = 'owner' FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- RPC: set_user_role
CREATE OR REPLACE FUNCTION public.set_user_role(target_user UUID, new_role user_role)
RETURNS VOID AS $$
DECLARE
  caller UUID := auth.uid();
  owner_count INTEGER;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Only owner can set roles
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = caller AND role = 'owner') THEN
    RAISE EXCEPTION 'Only owner can set roles';
  END IF;

  -- Prevent multiple owners
  IF new_role = 'owner' THEN
    SELECT COUNT(*) INTO owner_count FROM public.user_profiles WHERE role = 'owner' AND id <> target_user;
    IF owner_count > 0 THEN
      RAISE EXCEPTION 'There can only be one owner';
    END IF;
  END IF;

  UPDATE public.user_profiles
  SET role = new_role,
      updated_at = NOW()
  WHERE id = target_user;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on RPC to authenticated (authorization enforced inside)
REVOKE ALL ON FUNCTION public.set_user_role(UUID, user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, user_role) TO authenticated;


