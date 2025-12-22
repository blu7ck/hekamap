-- Migration: Viewer Access RPC Functions
-- Creates RPC functions for viewer access management (create, list, delete)
-- PIN hashing is done using pgcrypto extension

----------------------------
-- 1. Ensure pgcrypto extension is available
----------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

----------------------------
-- 2. Create viewer access (with PIN hashing)
----------------------------
CREATE OR REPLACE FUNCTION public.create_viewer_access(
  p_project_id UUID,
  p_email TEXT,
  p_pin TEXT,
  p_asset_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  access_token TEXT,
  email TEXT,
  project_id UUID,
  asset_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role user_role;
  v_project_owner_id UUID;
  v_access_token TEXT;
  v_pin_hash TEXT;
  v_access_id UUID;
BEGIN
  -- Verify caller is authenticated
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get caller role
  SELECT role INTO v_caller_role FROM public.user_profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR NOT (v_caller_role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'Only owner or admin can create viewer access';
  END IF;

  -- Verify project exists and caller has access
  SELECT owner_id INTO v_project_owner_id FROM public.projects WHERE id = p_project_id;
  IF v_project_owner_id IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  
  -- Owner can always access, admin needs to own the project
  IF v_project_owner_id <> v_caller_id AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'You do not have permission to grant access to this project';
  END IF;

  -- If asset_id is provided, verify it exists and belongs to the project
  IF p_asset_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.project_assets 
      WHERE id = p_asset_id AND project_id = p_project_id
    ) THEN
      RAISE EXCEPTION 'Asset not found or does not belong to this project';
    END IF;
  END IF;

  -- Validate PIN format (4 digits)
  IF NOT (p_pin ~ '^\d{4}$') THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;

  -- Generate access token (32 bytes hex = 64 chars)
  v_access_token := encode(gen_random_bytes(32), 'hex');

  -- Hash PIN using pgcrypto (bcrypt with 10 rounds)
  -- gen_salt('bf', 10) generates a bcrypt salt with cost factor 10
  v_pin_hash := crypt(p_pin, gen_salt('bf', 10));

  -- Check if access already exists
  SELECT id INTO v_access_id
  FROM public.project_access
  WHERE project_id = p_project_id
    AND email = LOWER(TRIM(p_email))
    AND COALESCE(asset_id, '00000000-0000-0000-0000-000000000000'::UUID) = COALESCE(p_asset_id, '00000000-0000-0000-0000-000000000000'::UUID);

  IF v_access_id IS NOT NULL THEN
    -- Update existing access
    UPDATE public.project_access
    SET
      access_token = v_access_token,
      pin_hash = v_pin_hash,
      pin_set_at = NOW(),
      granted_by = v_caller_id
    WHERE id = v_access_id
    RETURNING id, access_token, email, project_id, asset_id, created_at
    INTO v_access_id, v_access_token, p_email, p_project_id, p_asset_id, created_at;
  ELSE
    -- Insert new access
    INSERT INTO public.project_access (
      project_id,
      asset_id,
      email,
      granted_by,
      access_token,
      pin_hash,
      pin_set_at
    )
    VALUES (
      p_project_id,
      p_asset_id,
      LOWER(TRIM(p_email)),
      v_caller_id,
      v_access_token,
      v_pin_hash,
      NOW()
    )
    RETURNING id, access_token, email, project_id, asset_id, created_at
    INTO v_access_id, v_access_token, p_email, p_project_id, p_asset_id, created_at;
  END IF;

  RETURN QUERY SELECT v_access_id, v_access_token, p_email, p_project_id, p_asset_id, created_at;
END;
$$;

----------------------------
-- 3. List viewer access
----------------------------
CREATE OR REPLACE FUNCTION public.list_viewer_access(
  p_project_id UUID,
  p_asset_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  asset_id UUID,
  created_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role user_role;
  v_project_owner_id UUID;
BEGIN
  -- Verify caller is authenticated
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get caller role
  SELECT role INTO v_caller_role FROM public.user_profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR NOT (v_caller_role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'Only owner or admin can list viewer access';
  END IF;

  -- Verify project exists and caller has access
  SELECT owner_id INTO v_project_owner_id FROM public.projects WHERE id = p_project_id;
  IF v_project_owner_id IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  
  -- Owner can always access, admin needs to own the project
  IF v_project_owner_id <> v_caller_id AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'You do not have permission to view access for this project';
  END IF;

  -- Return viewer access list
  -- Use explicit table aliases to avoid ambiguity
  RETURN QUERY
  SELECT
    pa.id,
    pa.email,
    pa.asset_id,
    pa.created_at,
    pa.last_accessed_at,
    pa.access_count,
    pa.expires_at
  FROM public.project_access pa
  WHERE pa.project_id = p_project_id
    AND (p_asset_id IS NULL AND pa.asset_id IS NULL OR pa.asset_id = p_asset_id)
  ORDER BY pa.created_at DESC;
END;
$$;

----------------------------
-- 4. Delete viewer access
----------------------------
CREATE OR REPLACE FUNCTION public.delete_viewer_access(
  p_access_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role user_role;
  v_project_owner_id UUID;
  v_access_project_id UUID;
BEGIN
  -- Verify caller is authenticated
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get caller role
  SELECT role INTO v_caller_role FROM public.user_profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR NOT (v_caller_role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'Only owner or admin can delete viewer access';
  END IF;

  -- Get project_id from access record
  SELECT project_id INTO v_access_project_id
  FROM public.project_access
  WHERE id = p_access_id;

  IF v_access_project_id IS NULL THEN
    RAISE EXCEPTION 'Viewer access not found';
  END IF;

  -- Verify project ownership
  SELECT owner_id INTO v_project_owner_id FROM public.projects WHERE id = v_access_project_id;
  IF v_project_owner_id IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  
  -- Owner can always access, admin needs to own the project
  IF v_project_owner_id <> v_caller_id AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'You do not have permission to delete access for this project';
  END IF;

  -- Delete access
  DELETE FROM public.project_access WHERE id = p_access_id;
END;
$$;

----------------------------
-- 5. Verify PIN (for viewer login)
----------------------------
CREATE OR REPLACE FUNCTION public.verify_viewer_pin(
  p_access_token TEXT,
  p_pin TEXT
)
RETURNS TABLE (
  valid BOOLEAN,
  project_id UUID,
  asset_id UUID,
  email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access_id UUID;
  v_pin_hash TEXT;
  v_project_id UUID;
  v_asset_id UUID;
  v_email TEXT;
  v_expires_at TIMESTAMPTZ;
  v_pin_valid BOOLEAN;
BEGIN
  -- Find access record
  SELECT 
    id, pin_hash, project_id, asset_id, email, expires_at
  INTO 
    v_access_id, v_pin_hash, v_project_id, v_asset_id, v_email, v_expires_at
  FROM public.project_access
  WHERE access_token = p_access_token;

  -- Check if access exists
  IF v_access_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  -- Check expiration
  IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  -- Verify PIN
  IF v_pin_hash IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  v_pin_valid := (v_pin_hash = crypt(p_pin, v_pin_hash));

  IF NOT v_pin_valid THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  -- Update access stats
  UPDATE public.project_access
  SET
    last_accessed_at = NOW(),
    access_count = COALESCE(access_count, 0) + 1
  WHERE id = v_access_id;

  -- Return valid access info
  RETURN QUERY SELECT TRUE, v_project_id, v_asset_id, v_email;
END;
$$;

----------------------------
-- 6. Grant permissions
----------------------------
REVOKE ALL ON FUNCTION public.create_viewer_access(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_viewer_access(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_viewer_access(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_viewer_pin(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_viewer_access(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_viewer_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_viewer_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_viewer_pin(TEXT, TEXT) TO authenticated;

