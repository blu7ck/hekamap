-- Migration: Fix list_viewer_assets function
-- Fixes ambiguous column reference and adds viewer access support

----------------------------
-- 1. Drop and recreate list_viewer_assets with fixed parameter name
----------------------------
DROP FUNCTION IF EXISTS public.list_viewer_assets(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.list_viewer_assets(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  mime_type TEXT,
  asset_type TEXT,
  asset_key TEXT,
  final_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_owner BOOLEAN;
  v_has_viewer_access BOOLEAN;
BEGIN
  -- Check if caller is owner
  SELECT EXISTS (
    SELECT 1 FROM public.projects p 
    WHERE p.id = p_project_id AND p.owner_id = v_caller_id
  ) INTO v_is_owner;

  -- If not owner, check for viewer access
  IF NOT v_is_owner THEN
    SELECT EXISTS (
      SELECT 1 FROM public.project_access pa
      WHERE pa.project_id = p_project_id
        AND pa.email = (SELECT email FROM public.user_profiles WHERE id = v_caller_id)
        AND (pa.expires_at IS NULL OR pa.expires_at > NOW())
    ) INTO v_has_viewer_access;

    IF NOT v_has_viewer_access THEN
      RAISE EXCEPTION 'Forbidden: No access to this project';
    END IF;
  END IF;

  -- Return completed assets
  RETURN QUERY
  SELECT
    pa.id, pa.name, pa.mime_type, pa.asset_type, pa.asset_key, pa.final_key
  FROM public.project_assets pa
  WHERE pa.project_id = p_project_id
    AND pa.processing_status = 'completed'
  ORDER BY pa.created_at DESC;
END;
$$;

----------------------------
-- 2. Grant permissions
----------------------------
REVOKE ALL ON FUNCTION public.list_viewer_assets(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_viewer_assets(UUID) TO authenticated;

