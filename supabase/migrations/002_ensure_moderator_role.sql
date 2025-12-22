-- Migration: Ensure Moderator Role Support
-- This migration ensures moderator role is properly supported across all functions and policies
-- Drops and recreates functions that check roles to include moderator

----------------------------
-- 1. Helper Functions: Update to include moderator where appropriate
----------------------------

-- is_owner_or_admin_or_moderator function (new helper for moderator operations)
DROP FUNCTION IF EXISTS public.is_owner_or_admin_or_moderator(UUID);
CREATE OR REPLACE FUNCTION public.is_owner_or_admin_or_moderator(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT role IN ('owner', 'admin', 'moderator') FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Grant execute permission
REVOKE ALL ON FUNCTION public.is_owner_or_admin_or_moderator(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin_or_moderator(UUID) TO authenticated;

----------------------------
-- 2. Ensure user_role enum includes all roles (should already exist, but safe check)
----------------------------

-- Enum already exists in 000_full_reset.sql with: owner, admin, moderator, user, viewer
-- No changes needed here, but this migration serves as documentation

----------------------------
-- Migration Complete
-- Summary:
-- - Added is_owner_or_admin_or_moderator helper function
-- - All RLS policies already support moderator role (from 000_full_reset.sql and 001_fix_performance.sql)
-- - Backend API will use these functions for role-based authorization
----------------------------

