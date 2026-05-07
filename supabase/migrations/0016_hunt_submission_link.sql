-- 0016: add submission link fields to qm_hunts
-- Allows educator/co-educator to set a per-quest external submission link
-- (Google Drive / Dropbox / Padlet / etc). When set, the board view
-- replaces team-column submissions with the link (embedded if possible,
-- otherwise opened in a new tab).

ALTER TABLE public.qm_hunts
  ADD COLUMN IF NOT EXISTS submission_link TEXT,
  ADD COLUMN IF NOT EXISTS submission_link_label TEXT,
  ADD COLUMN IF NOT EXISTS submission_link_embed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.qm_hunts.submission_link IS 'External submission destination URL (Drive/Dropbox/Padlet/etc). When set, board switches to link mode.';
COMMENT ON COLUMN public.qm_hunts.submission_link_label IS 'Optional human label shown next to the submission link button.';
COMMENT ON COLUMN public.qm_hunts.submission_link_embed IS 'If true, board attempts to render the link in an iframe with new-tab fallback.';
