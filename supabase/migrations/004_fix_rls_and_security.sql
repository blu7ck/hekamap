-- Migration: Fix RLS and Security Issues
-- Addresses Supabase Advisor warnings and errors:
-- 1. Enable RLS on project_layers (has policies but RLS disabled)
-- 2. Enable RLS on processing_jobs (public schema, RLS required)
-- 3. Fix function search_path for SECURITY DEFINER functions

----------------------------
-- 1. Enable RLS on project_layers
----------------------------

ALTER TABLE public.project_layers ENABLE ROW LEVEL SECURITY;

----------------------------
-- 2. Enable RLS on processing_jobs (with deny-all policy)
----------------------------

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- Note: processing_jobs is accessed by backend service role only
-- Service role bypasses RLS, so no policy needed for service role access
-- Regular authenticated users should NOT access this table (deny all)

-- Policy: Deny all access for authenticated users
-- This ensures no regular user can access processing_jobs table
-- Service role bypasses RLS, so backend workers can still access it
CREATE POLICY processing_jobs_deny_all ON public.processing_jobs
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- This policy explicitly denies access to all authenticated users
-- Service role (used by backend) bypasses RLS, so it can still access
-- Frontend/users cannot access this table, which is the desired behavior

----------------------------
-- 3. Fix function search_path for SECURITY DEFINER functions
----------------------------

-- First, drop dependent policies temporarily (they will be recreated)
DROP POLICY IF EXISTS categories_insert_admin ON public.categories;
DROP POLICY IF EXISTS categories_update_admin ON public.categories;

-- Now we can safely recreate functions with SET search_path
-- Note: Using CREATE OR REPLACE instead of DROP to avoid dependency issues

-- get_user_role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role AS $$
  SELECT role FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- is_owner
CREATE OR REPLACE FUNCTION public.is_owner(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT role = 'owner' FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- is_owner_or_admin
CREATE OR REPLACE FUNCTION public.is_owner_or_admin(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT role IN ('owner', 'admin') FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- is_owner_or_admin_or_moderator
CREATE OR REPLACE FUNCTION public.is_owner_or_admin_or_moderator(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT role IN ('owner', 'admin', 'moderator') FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- set_user_role
CREATE OR REPLACE FUNCTION public.set_user_role(target_user UUID, new_role user_role)
RETURNS VOID AS $$
DECLARE
  caller UUID := auth.uid();
  owner_count INTEGER;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = caller AND role = 'owner') THEN
    RAISE EXCEPTION 'Only owner can set roles';
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the policies that depend on is_owner_or_admin
CREATE POLICY categories_insert_admin ON public.categories 
  FOR INSERT WITH CHECK (is_owner_or_admin((select auth.uid())));
CREATE POLICY categories_update_admin ON public.categories 
  FOR UPDATE USING (is_owner_or_admin((select auth.uid())));

-- Grant execute permissions
REVOKE ALL ON FUNCTION public.get_user_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_owner_or_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_owner_or_admin_or_moderator(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin_or_moderator(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.set_user_role(UUID, user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, user_role) TO authenticated;

----------------------------
-- Migration Complete
-- Summary:
-- - Enabled RLS on project_layers table (was missing)
-- - Enabled RLS on processing_jobs table with deny-all policy (service role bypasses RLS)
-- - Fixed search_path for all SECURITY DEFINER functions (security hardening)
-- - All functions now have explicit SET search_path = public to prevent search_path injection
----------------------------

