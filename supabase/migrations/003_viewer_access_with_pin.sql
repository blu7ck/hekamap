-- Migration: Add PIN-based Viewer Access System
-- Extends project_access table to support asset-level viewer access with PIN protection
-- PINs are stored as hashed values for security

----------------------------
-- 1. Add PIN and asset_id columns to project_access
----------------------------

-- Add asset_id column (nullable - null means project-level access)
ALTER TABLE public.project_access 
ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES public.project_assets(id) ON DELETE CASCADE;

-- Add PIN hash column (bcrypt hash of PIN)
ALTER TABLE public.project_access 
ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Add PIN created/updated timestamps
ALTER TABLE public.project_access 
ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ;

----------------------------
-- 2. Update UNIQUE constraint to allow same email for different assets
----------------------------

-- Drop old unique constraint
ALTER TABLE public.project_access 
DROP CONSTRAINT IF EXISTS project_access_project_id_email_key;

-- Create new unique constraint: (project_id, email, asset_id)
-- This allows same email to have access to multiple assets in same project
CREATE UNIQUE INDEX IF NOT EXISTS project_access_project_email_asset_unique 
ON public.project_access(project_id, email, COALESCE(asset_id, '00000000-0000-0000-0000-000000000000'::UUID));

----------------------------
-- 3. Add index for asset_id lookups
----------------------------

CREATE INDEX IF NOT EXISTS idx_project_access_asset ON public.project_access(asset_id) 
WHERE asset_id IS NOT NULL;

----------------------------
-- 4. Update RLS policies to support asset-level access
----------------------------

-- RLS policies already support owner/admin access (from previous migrations)
-- No changes needed here, but document that asset_id access is included

----------------------------
-- 5. Helper function: Verify PIN (for use in backend, not RLS)
----------------------------

-- Note: PIN verification will be done in backend application layer
-- This is just documentation - actual PIN hashing/verification happens in backend

----------------------------
-- Migration Complete
-- Summary:
-- - Added asset_id column for asset-level viewer access
-- - Added pin_hash column for secure PIN storage
-- - Updated unique constraint to support multiple assets per email
-- - Added index for asset_id queries
-- - RLS policies already support the new structure
----------------------------

