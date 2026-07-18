-- 0025_video_provider_columns.sql
-- Provider-agnostic video reference columns for the Adilo -> Bunny Stream migration.
-- Additive + nullable: safe to run on the live database. Legacy adilo_* columns are
-- kept untouched; existing rows are backfilled with provider='adilo' so playback
-- code can switch on (video_provider, video_provider_id) uniformly.
--
-- Providers: 'adilo' (legacy), 'bunny' (Bunny Stream GUID), 'youtube' (11-char id)

BEGIN;

-- 1) qm_intro_posts ---------------------------------------------------------
ALTER TABLE public.qm_intro_posts
  ADD COLUMN IF NOT EXISTS video_provider text,
  ADD COLUMN IF NOT EXISTS video_provider_id text;

UPDATE public.qm_intro_posts
   SET video_provider = 'adilo', video_provider_id = video_adilo_file_id
 WHERE video_adilo_file_id IS NOT NULL AND video_provider IS NULL;

-- 2) qm_profiles ------------------------------------------------------------
ALTER TABLE public.qm_profiles
  ADD COLUMN IF NOT EXISTS intro_video_provider text,
  ADD COLUMN IF NOT EXISTS intro_video_provider_id text;

UPDATE public.qm_profiles
   SET intro_video_provider = 'adilo', intro_video_provider_id = intro_video_adilo_file_id
 WHERE intro_video_adilo_file_id IS NOT NULL AND intro_video_provider IS NULL;

-- 3) qm_learning_cards ------------------------------------------------------
ALTER TABLE public.qm_learning_cards
  ADD COLUMN IF NOT EXISTS video_provider text,
  ADD COLUMN IF NOT EXISTS video_provider_id text;

UPDATE public.qm_learning_cards
   SET video_provider = 'adilo', video_provider_id = adilo_file_id
 WHERE adilo_file_id IS NOT NULL AND video_provider IS NULL;

-- 4) qm_submission_board_items ---------------------------------------------
ALTER TABLE public.qm_submission_board_items
  ADD COLUMN IF NOT EXISTS video_provider text,
  ADD COLUMN IF NOT EXISTS video_provider_id text;

UPDATE public.qm_submission_board_items
   SET video_provider = 'adilo', video_provider_id = adilo_file_id
 WHERE adilo_file_id IS NOT NULL AND video_provider IS NULL;

-- 5) Board-level Bunny collections (upload-time grouping, mirrors adilo_project_id)
ALTER TABLE public.qm_boards            ADD COLUMN IF NOT EXISTS bunny_collection_id text;
ALTER TABLE public.qm_learning_boards   ADD COLUMN IF NOT EXISTS bunny_collection_id text;
ALTER TABLE public.qm_submission_boards ADD COLUMN IF NOT EXISTS bunny_collection_id text;

-- 6) Provider sanity checks (nullable-friendly, idempotent)
DO $$ BEGIN
  ALTER TABLE public.qm_intro_posts
    ADD CONSTRAINT qm_intro_posts_video_provider_chk
    CHECK (video_provider IS NULL OR video_provider IN ('adilo','bunny','youtube'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.qm_profiles
    ADD CONSTRAINT qm_profiles_intro_video_provider_chk
    CHECK (intro_video_provider IS NULL OR intro_video_provider IN ('adilo','bunny','youtube'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.qm_learning_cards
    ADD CONSTRAINT qm_learning_cards_video_provider_chk
    CHECK (video_provider IS NULL OR video_provider IN ('adilo','bunny','youtube'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.qm_submission_board_items
    ADD CONSTRAINT qm_sbi_video_provider_chk
    CHECK (video_provider IS NULL OR video_provider IN ('adilo','bunny','youtube'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7) Lookup indexes for the /embed/[id] style routes
CREATE INDEX IF NOT EXISTS idx_qm_intro_posts_video_provider_id
  ON public.qm_intro_posts (video_provider_id);
CREATE INDEX IF NOT EXISTS idx_qm_learning_cards_video_provider_id
  ON public.qm_learning_cards (video_provider_id);
CREATE INDEX IF NOT EXISTS idx_qm_sbi_video_provider_id
  ON public.qm_submission_board_items (video_provider_id);

COMMIT;

-- Make PostgREST pick up the new columns immediately
NOTIFY pgrst, 'reload schema';
