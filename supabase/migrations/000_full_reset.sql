-- FULL RESET MIGRATION
-- Drops existing objects (tables, types, functions) and recreates schema from scratch.
-- WARNING: This will remove existing data. Run only on fresh/approved environments.

----------------------------
-- Drop old objects
----------------------------

-- Functions
DO $$
BEGIN
  PERFORM 1;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('get_accessible_projects','list_project_assets','list_viewer_assets','set_user_role','is_owner','is_owner_or_admin','get_user_role','get_project_layers','create_project_layer','set_project_layer_visibility','list_organizations','create_organization','list_project_folders','create_project_folder','create_project_with_org')) THEN
    DROP FUNCTION IF EXISTS public.get_accessible_projects CASCADE;
    DROP FUNCTION IF EXISTS public.list_project_assets(UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.list_viewer_assets(UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.set_user_role(UUID, user_role) CASCADE;
    DROP FUNCTION IF EXISTS public.is_owner(UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.is_owner_or_admin(UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.get_user_role(UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.get_project_layers(UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.create_project_layer(UUID, TEXT, TEXT, JSONB, TEXT, FLOAT, INTEGER, UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.set_project_layer_visibility(UUID, BOOLEAN) CASCADE;
    DROP FUNCTION IF EXISTS public.list_organizations() CASCADE;
    DROP FUNCTION IF EXISTS public.create_organization(TEXT, TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.list_project_folders(UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.create_project_folder(UUID, UUID, TEXT, TEXT, INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS public.create_project_with_org(UUID, UUID, TEXT, TEXT, TEXT) CASCADE;
  END IF;
END$$;

-- Tables
DROP TABLE IF EXISTS public.processing_jobs CASCADE;
DROP TABLE IF EXISTS public.project_layers CASCADE;
DROP TABLE IF EXISTS public.project_assets CASCADE;
DROP TABLE IF EXISTS public.project_folders CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
DROP TABLE IF EXISTS public.security_events CASCADE;
DROP TABLE IF EXISTS public.rate_limit_logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.access_logs CASCADE;
DROP TABLE IF EXISTS public.project_access CASCADE;
DROP TABLE IF EXISTS public.project_versions CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.reports CASCADE;
DROP TABLE IF EXISTS public.votes CASCADE;
DROP TABLE IF EXISTS public.posts CASCADE;
DROP TABLE IF EXISTS public.topics CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- Types
DROP TYPE IF EXISTS public.user_role CASCADE;

----------------------------
-- Extensions
----------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

----------------------------
-- Types
----------------------------
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'moderator', 'user', 'viewer');

----------------------------
-- Core Tables
----------------------------

-- User profiles (extends auth.users)
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'user',
  email TEXT,
  username TEXT UNIQUE,
  full_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  profession TEXT,
  organization TEXT,
  equipment TEXT,
  city TEXT,
  country TEXT,
  website TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Forum: categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,
  order_index INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forum: topics
CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_locked BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  view_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  last_reply_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, slug)
);

-- Forum: posts
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_accepted_answer BOOLEAN DEFAULT FALSE,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- Forum: votes
CREATE TABLE public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Forum: reports
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('post', 'topic', 'user')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizations (company/workspace grouping)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, slug)
);

-- Project folders (hierarchical, per-organization)
CREATE TABLE public.project_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.project_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.project_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL,
  model_url TEXT,
  model_type TEXT,
  thumbnail_url TEXT,
  version INTEGER DEFAULT 1,
  current_version_id UUID,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, slug)
);

-- Project versions
CREATE TABLE public.project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  model_url TEXT,
  model_type TEXT,
  changelog TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, version_number)
);

-- Project access (email-based)
CREATE TABLE public.project_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  access_token TEXT UNIQUE,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, email)
);

-- Access logs
CREATE TABLE public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  access_token TEXT,
  ip_address INET,
  user_agent TEXT,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

----------------------------
-- Security/Observability Tables
----------------------------

-- Rate limiting logs
CREATE TABLE public.rate_limit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  ip_address TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Security events
CREATE TABLE public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  severity TEXT NOT NULL DEFAULT 'medium',
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

----------------------------
-- Project Assets & Jobs
----------------------------

-- Project assets metadata
CREATE TABLE public.project_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  asset_key TEXT NOT NULL,               -- raw R2 key
  final_key TEXT,                        -- final R2 key
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  source_format TEXT CHECK (source_format IN ('glb', 'obj', 'fbx', 'las', 'laz', 'ifc', 'zip', 'geojson', 'kml', 'other')),
  asset_type TEXT CHECK (asset_type IN ('glb', 'b3dm', 'tileset', 'pnts', 'imagery', 'geojson', 'kml', 'other')),
  asset_category TEXT CHECK (asset_category IN ('single_model', 'large_area')),
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'queued', 'processing', 'completed', 'failed')),
  processing_job_id UUID,
  raw_file_size_bytes BIGINT,
  final_file_size_bytes BIGINT,
  raw_file_retention_days INTEGER,
  raw_file_deleted_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_project_assets_project_created_at ON public.project_assets(project_id, created_at DESC);
CREATE INDEX idx_project_assets_asset_key ON public.project_assets(asset_key);
CREATE INDEX idx_project_assets_final_key ON public.project_assets(final_key);
CREATE INDEX idx_project_assets_processing_status ON public.project_assets(processing_status);

-- Project layers (vector/overlay)
CREATE TABLE public.project_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  layer_type TEXT NOT NULL CHECK (layer_type IN ('kml', 'geojson', 'manual_draw', 'asset_boundary')),
  geometry JSONB, -- GeoJSON feature/geometry
  color TEXT DEFAULT '#00ff00',
  opacity FLOAT DEFAULT 1.0 CHECK (opacity >= 0 AND opacity <= 1),
  visible BOOLEAN DEFAULT TRUE,
  order_index INTEGER DEFAULT 0,
  metadata JSONB,
  source_asset_id UUID REFERENCES public.project_assets(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_layers_project ON public.project_layers(project_id);
CREATE INDEX idx_project_layers_visible ON public.project_layers(project_id, visible, order_index);

-- Processing jobs (queue tracking)
CREATE TABLE public.processing_jobs (
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

CREATE INDEX idx_processing_jobs_status_created_at ON public.processing_jobs(status, created_at);
CREATE INDEX idx_processing_jobs_asset ON public.processing_jobs(asset_id);

----------------------------
-- Indexes
----------------------------
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_topics_category ON public.topics(category_id);
CREATE INDEX idx_topics_author ON public.topics(author_id);
CREATE INDEX idx_posts_topic ON public.posts(topic_id);
CREATE INDEX idx_posts_author ON public.posts(author_id);
CREATE INDEX idx_votes_post_user ON public.votes(post_id, user_id);
CREATE INDEX idx_projects_owner ON public.projects(owner_id);
CREATE INDEX idx_project_access_project ON public.project_access(project_id);
CREATE INDEX idx_project_access_email ON public.project_access(email);
CREATE INDEX idx_project_access_token ON public.project_access(access_token);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read);
CREATE INDEX idx_access_logs_ip_address ON public.access_logs(ip_address);
CREATE INDEX idx_access_logs_action ON public.access_logs(action);
CREATE INDEX idx_access_logs_created_at ON public.access_logs(created_at DESC);
CREATE INDEX idx_rate_limit_logs_identifier ON public.rate_limit_logs(identifier);
CREATE INDEX idx_rate_limit_logs_ip_address ON public.rate_limit_logs(ip_address);
CREATE INDEX idx_rate_limit_logs_created_at ON public.rate_limit_logs(created_at DESC);
CREATE INDEX idx_security_events_type ON public.security_events(event_type);
CREATE INDEX idx_security_events_severity ON public.security_events(severity);
CREATE INDEX idx_security_events_resolved ON public.security_events(resolved);
CREATE INDEX idx_security_events_created_at ON public.security_events(created_at DESC);
CREATE INDEX idx_organizations_owner_slug ON public.organizations(owner_id, slug);
CREATE INDEX idx_project_folders_org_parent ON public.project_folders(org_id, parent_id);
CREATE INDEX idx_projects_org_folder ON public.projects(org_id, folder_id);

----------------------------
-- RLS Enable
----------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;
-- processing_jobs: no RLS to allow worker access via service role.

----------------------------
-- Helper Functions
----------------------------

CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role AS $$
  SELECT role FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_owner(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT role = 'owner' FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT role IN ('owner', 'admin') FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

----------------------------
-- RLS Policies
----------------------------

-- user_profiles
CREATE POLICY user_profiles_select_all ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY user_profiles_update_own ON public.user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY user_profiles_insert_own ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- categories
CREATE POLICY categories_select_all ON public.categories FOR SELECT USING (true);
CREATE POLICY categories_insert_admin ON public.categories FOR INSERT WITH CHECK (is_owner_or_admin(auth.uid()));
CREATE POLICY categories_update_admin ON public.categories FOR UPDATE USING (is_owner_or_admin(auth.uid()));

-- topics
CREATE POLICY topics_select_all ON public.topics FOR SELECT USING (true);
CREATE POLICY topics_insert_auth ON public.topics FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY topics_update_own_or_mod ON public.topics FOR UPDATE USING (
  auth.uid() = author_id OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('moderator','admin','owner'))
);
CREATE POLICY topics_delete_mod ON public.topics FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('moderator','admin','owner'))
);

-- posts
CREATE POLICY posts_select_all ON public.posts FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY posts_insert_auth ON public.posts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY posts_update_own_or_mod ON public.posts FOR UPDATE USING (
  (auth.uid() = author_id AND deleted_at IS NULL) OR
  EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('moderator','admin','owner'))
);

-- votes
CREATE POLICY votes_select_all ON public.votes FOR SELECT USING (true);
CREATE POLICY votes_insert_own ON public.votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY votes_update_own ON public.votes FOR UPDATE USING (auth.uid() = user_id);

-- reports
CREATE POLICY reports_select_own ON public.reports FOR SELECT USING (auth.uid() = reported_by OR auth.uid() = reviewed_by);
CREATE POLICY reports_select_mod ON public.reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('moderator','admin','owner'))
);
CREATE POLICY reports_insert_auth ON public.reports FOR INSERT WITH CHECK (auth.uid() = reported_by);
CREATE POLICY reports_update_mod ON public.reports FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('moderator','admin','owner'))
);

-- projects (owners ONLY; admins cannot see others' projects)
CREATE POLICY projects_select_owner ON public.projects FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY projects_insert_owner_or_admin ON public.projects FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('admin','owner'))
);
CREATE POLICY projects_update_owner ON public.projects FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY projects_delete_owner ON public.projects FOR DELETE USING (auth.uid() = owner_id);

-- project_versions
CREATE POLICY project_versions_select_owner ON public.project_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);
CREATE POLICY project_versions_insert_owner ON public.project_versions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);

-- project_access
CREATE POLICY project_access_select_owner ON public.project_access FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);
CREATE POLICY project_access_all_owner ON public.project_access FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);

-- access_logs
CREATE POLICY access_logs_select_owner ON public.access_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);

-- notifications
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- rate_limit_logs (viewable by owner/admin)
CREATE POLICY rate_limit_logs_select_admin ON public.rate_limit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('owner','admin'))
);

-- security_events (viewable by owner/admin; insert open for system/service role)
CREATE POLICY security_events_select_admin ON public.security_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('owner','admin'))
);
CREATE POLICY security_events_insert_any ON public.security_events FOR INSERT WITH CHECK (true);

-- project_assets (owners only)
CREATE POLICY project_assets_select_owner ON public.project_assets FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);
CREATE POLICY project_assets_insert_owner ON public.project_assets FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);
CREATE POLICY project_assets_update_owner ON public.project_assets FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);
CREATE POLICY project_assets_delete_owner ON public.project_assets FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);

-- organizations (owners only)
CREATE POLICY organizations_select_owner ON public.organizations FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY organizations_insert_owner ON public.organizations FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY organizations_update_owner ON public.organizations FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY organizations_delete_owner ON public.organizations FOR DELETE USING (auth.uid() = owner_id);

-- project_folders (by org owner)
CREATE POLICY project_folders_select_owner ON public.project_folders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = org_id AND o.owner_id = auth.uid())
);
CREATE POLICY project_folders_insert_owner ON public.project_folders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = org_id AND o.owner_id = auth.uid())
);
CREATE POLICY project_folders_update_owner ON public.project_folders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = org_id AND o.owner_id = auth.uid())
);
CREATE POLICY project_folders_delete_owner ON public.project_folders FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = org_id AND o.owner_id = auth.uid())
);

-- project_layers (owners only)
CREATE POLICY project_layers_select_owner ON public.project_layers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);
CREATE POLICY project_layers_insert_owner ON public.project_layers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);
CREATE POLICY project_layers_update_owner ON public.project_layers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);
CREATE POLICY project_layers_delete_owner ON public.project_layers FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);

----------------------------
-- RPCs
----------------------------

-- set_user_role (only owner; prevent multiple owners)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.set_user_role(UUID, user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, user_role) TO authenticated;

-- get_accessible_projects (owners only see their projects)
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

-- list_project_assets (owner, all statuses)
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
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()) THEN
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

-- list_viewer_assets (owner, only completed)
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
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()) THEN
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

-- get_project_layers (owner, ordered)
CREATE OR REPLACE FUNCTION public.get_project_layers(project_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  layer_type TEXT,
  geometry JSONB,
  color TEXT,
  opacity FLOAT,
  visible BOOLEAN,
  order_index INTEGER,
  metadata JSONB,
  source_asset_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    pl.id, pl.name, pl.layer_type, pl.geometry, pl.color, pl.opacity, pl.visible,
    pl.order_index, pl.metadata, pl.source_asset_id, pl.created_by, pl.created_at, pl.updated_at
  FROM public.project_layers pl
  WHERE pl.project_id = project_id
  ORDER BY pl.order_index, pl.created_at DESC;
END;
$$;

-- create_project_layer
CREATE OR REPLACE FUNCTION public.create_project_layer(
  p_project_id UUID,
  p_name TEXT,
  p_layer_type TEXT,
  p_geometry JSONB,
  p_color TEXT DEFAULT '#00ff00',
  p_opacity FLOAT DEFAULT 1.0,
  p_order_index INTEGER DEFAULT 0,
  p_source_asset_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_layer_type NOT IN ('kml', 'geojson', 'manual_draw', 'asset_boundary') THEN
    RAISE EXCEPTION 'Invalid layer_type';
  END IF;

  INSERT INTO public.project_layers (
    project_id, name, layer_type, geometry, color, opacity,
    order_index, metadata, source_asset_id, created_by, created_at, updated_at
  )
  VALUES (
    p_project_id, p_name, p_layer_type, p_geometry, p_color, p_opacity,
    p_order_index, NULL, p_source_asset_id, auth.uid(), NOW(), NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- set_project_layer_visibility
CREATE OR REPLACE FUNCTION public.set_project_layer_visibility(layer_id UUID, is_visible BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_layers pl
    JOIN public.projects p ON p.id = pl.project_id
    WHERE pl.id = layer_id AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.project_layers
  SET visible = is_visible,
      updated_at = NOW()
  WHERE id = layer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_accessible_projects FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_project_assets(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_viewer_assets(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_project_layers(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_project_layer(UUID, TEXT, TEXT, JSONB, TEXT, FLOAT, INTEGER, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_project_layer_visibility(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_accessible_projects TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_project_assets(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_viewer_assets(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_layers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_layer(UUID, TEXT, TEXT, JSONB, TEXT, FLOAT, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_project_layer_visibility(UUID, BOOLEAN) TO authenticated;

----------------------------
-- Seed / Initial Owner
----------------------------

DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'halit@hekamap.com';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Owner email % not found in auth.users; skipping role assignment', v_email;
    RETURN;
  END IF;

  INSERT INTO public.user_profiles (id, role, email, created_at, updated_at)
  VALUES (v_user_id, 'owner', v_email, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
    SET role = 'owner',
        email = v_email,
        updated_at = NOW();

  RAISE NOTICE 'Owner role set for user %', v_email;
END;
$$;


