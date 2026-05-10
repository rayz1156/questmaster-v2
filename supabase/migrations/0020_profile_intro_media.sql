-- 0020_profile_intro_media.sql
-- Extends qm_profiles with the same intro-card fields used by qm_intro_posts,
-- so a user's profile fully drives how they appear on every class intro board.

ALTER TABLE public.qm_profiles
  ADD COLUMN IF NOT EXISTS intro_display_name text,
  ADD COLUMN IF NOT EXISTS intro_media_type text CHECK (intro_media_type IN ('image','video') OR intro_media_type IS NULL),
  ADD COLUMN IF NOT EXISTS intro_image_file_code text,
  ADD COLUMN IF NOT EXISTS intro_image_path text,
  ADD COLUMN IF NOT EXISTS intro_video_adilo_file_id text,
  ADD COLUMN IF NOT EXISTS intro_video_adilo_project_id text,
  ADD COLUMN IF NOT EXISTS intro_video_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS intro_video_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS intro_media_updated_at timestamptz;
