-- 0019_profile_bio.sql
-- Adds a global bio (and avatar_url for future use) to qm_profiles.
-- The bio is shown on every class intro board the user is a member of,
-- overriding the stale per-post description when present.

ALTER TABLE public.qm_profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS bio_updated_at timestamptz;

-- Soft length guard: keep bios reasonable (500 chars).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qm_profiles_bio_length_check'
  ) THEN
    ALTER TABLE public.qm_profiles
      ADD CONSTRAINT qm_profiles_bio_length_check CHECK (bio IS NULL OR char_length(bio) <= 500);
  END IF;
END $$;

-- Allow each user to update their own bio/avatar.
DROP POLICY IF EXISTS "profiles self update bio" ON public.qm_profiles;
CREATE POLICY "profiles self update bio"
  ON public.qm_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
