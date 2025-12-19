-- Add email column to user_profiles for easier querying from frontend/admin panel
-- and backfill from auth.users. This keeps community schema compatible with
-- existing UI that does `select=id,role,email`.

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill from auth.users for existing rows
UPDATE public.user_profiles up
SET email = u.email
FROM auth.users u
WHERE u.id = up.id
  AND up.email IS NULL;

-- Optional index for lookup/filtering by email
CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON public.user_profiles (email);


