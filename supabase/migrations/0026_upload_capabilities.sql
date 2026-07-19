-- 0026_upload_capabilities.sql
-- Per-educator upload capabilities, controlled by admins.
--   can_upload_files  : gates FileLu-backed FILE uploads (documents) on boards
--   can_upload_videos : gates Bunny Stream VIDEO uploads on boards
-- Images (also FileLu) are intentionally NOT gated.
-- Admins / superadmins bypass these checks in application code regardless of value.
-- Default FALSE: brand-new educators must be explicitly enabled by an admin.

BEGIN;

ALTER TABLE public.qm_profiles
  ADD COLUMN IF NOT EXISTS can_upload_files  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_upload_videos boolean NOT NULL DEFAULT false;

-- Admins and superadmins are effectively always-on; set TRUE so the columns
-- read truthfully even though code also bypasses the gate for them.
UPDATE public.qm_profiles
   SET can_upload_files = true, can_upload_videos = true
 WHERE role IN ('admin', 'superadmin');

COMMIT;

-- Let PostgREST see the new columns immediately.
NOTIFY pgrst, 'reload schema';
