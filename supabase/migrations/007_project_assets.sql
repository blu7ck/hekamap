-- Project assets storage, processing jobs, and RPCs

----------------------------
-- Tables
----------------------------

-- Project assets metadata
CREATE TABLE IF NOT EXISTS public.project_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  asset_key TEXT NOT NULL,               -- raw R2 key: raw/{project_id}/{user_id}/{timestamp}-{filename}
  final_key TEXT,                        -- final R2 key: tiles/{project_id}/{asset_id}/... or models/{project_id}/{asset_id}/...
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  source_format TEXT CHECK (source_format IN ('glb', 'obj', 'fbx', 'las', 'laz', 'ifc', 'zip', 'geojson', 'kml', 'other')),
  asset_type TEXT CHECK (asset_type IN ('glb', 'b3dm', 'tileset', 'pnts', 'imagery', 'geojson', 'kml', 'other')),
  asset_category TEXT CHECK (asset_category IN ('single_model', 'large_area')),
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'queued', 'processing', 'completed', 'failed')),
  processing_job_id UUID,                -- reference to processing_jobs.id (soft link)
  raw_file_size_bytes BIGINT,
  final_file_size_bytes BIGINT,
  raw_file_retention_days INTEGER,       -- null = keep, number = delete after X days
  raw_file_deleted_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_project_assets_project_created_at ON public.project_assets(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_assets_asset_key ON public.project_assets(asset_key);
CREATE INDEX IF NOT EXISTS idx_project_assets_final_key ON public.project_assets(final_key);
CREATE INDEX IF NOT EXISTS idx_project_assets_processing_status ON public.project_assets(processing_status);

-- Processing jobs (queue tracking)
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.project_assets(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('normalize', 'tileset', 'pointcloud')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  worker_id TEXT,
  raw_file_key TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_status_created_at ON public.processing_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_asset ON public.processing_jobs(asset_id);

----------------------------
-- RLS Policies
----------------------------

ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;

-- Only project owners can manage/view their assets.
-- Requirement: admin/owner rolleri birbirlerinin projelerini göremezler.
CREATE POLICY project_assets_select_owner
  ON public.project_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY project_assets_insert_owner
  ON public.project_assets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY project_assets_update_owner
  ON public.project_assets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY project_assets_delete_owner
  ON public.project_assets
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

-- processing_jobs will be consumed by backend workers (service role bypasses RLS),
-- so RLS is not enabled here to avoid blocking queue operations.

----------------------------
-- RPC Functions
----------------------------

-- Drop old versions if they exist
DROP FUNCTION IF EXISTS public.get_accessible_projects CASCADE;
DROP FUNCTION IF EXISTS public.list_project_assets(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.list_viewer_assets(UUID) CASCADE;

-- List projects owned by current user (owner/admin isolation)
CREATE OR REPLACE FUNCTION public.get_accessible_projects()
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name
  FROM public.projects p
  WHERE p.owner_id = auth.uid();
$$;

-- List project assets for owner (all statuses)
CREATE OR REPLACE FUNCTION public.list_project_assets(project_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  mime_type TEXT,
  source_format TEXT,
  asset_type TEXT,
  asset_category TEXT,
  processing_status TEXT,
  asset_key TEXT,
  final_key TEXT,
  raw_file_size_bytes BIGINT,
  final_file_size_bytes BIGINT,
  raw_file_retention_days INTEGER,
  raw_file_deleted_at TIMESTAMPTZ,
  uploaded_by UUID,
  created_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure caller owns the project
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    pa.id, pa.name, pa.mime_type, pa.source_format, pa.asset_type, pa.asset_category,
    pa.processing_status, pa.asset_key, pa.final_key,
    pa.raw_file_size_bytes, pa.final_file_size_bytes,
    pa.raw_file_retention_days, pa.raw_file_deleted_at,
    pa.uploaded_by, pa.created_at, pa.processed_at
  FROM public.project_assets pa
  WHERE pa.project_id = project_id
  ORDER BY pa.created_at DESC;
END;
$$;

-- List assets for viewer consumption (only completed)
CREATE OR REPLACE FUNCTION public.list_viewer_assets(project_id UUID)
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
BEGIN
  -- Ensure caller owns the project
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    pa.id, pa.name, pa.mime_type, pa.asset_type, pa.asset_key, pa.final_key
  FROM public.project_assets pa
  WHERE pa.project_id = project_id
    AND pa.processing_status = 'completed'
  ORDER BY pa.created_at DESC;
END;
$$;

-- Grant execution to authenticated users (authorization enforced inside)
REVOKE ALL ON FUNCTION public.get_accessible_projects FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_project_assets(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_viewer_assets(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_accessible_projects TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_project_assets(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_viewer_assets(UUID) TO authenticated;


