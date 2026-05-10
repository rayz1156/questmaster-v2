-- 0018: Intro Board video support + QR cards on Learning Board

-- ---------------------------------------------------------------
-- 1) qm_intro_posts: add video columns, allow image to be optional
-- ---------------------------------------------------------------
alter table public.qm_intro_posts
  add column if not exists media_type text not null default 'image'
    check (media_type in ('image','video')),
  add column if not exists video_adilo_file_id text,
  add column if not exists video_adilo_project_id text,
  add column if not exists video_thumbnail_url text,
  add column if not exists video_duration_seconds integer;

-- relax NOT NULLs so a video-only post is valid
alter table public.qm_intro_posts alter column image_url drop not null;
alter table public.qm_intro_posts alter column image_path drop not null;

-- ---------------------------------------------------------------
-- 2) qm_learning_cards: track QR-code link cards
-- ---------------------------------------------------------------
alter table public.qm_learning_cards
  add column if not exists is_qr boolean not null default false,
  add column if not exists qr_filelu_file_code text;

-- Ensure card_type check accepts 'file' (already used by file uploads).
-- Drop and recreate the constraint with the expanded set.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.qm_learning_cards'::regclass
      and conname = 'qm_learning_cards_card_type_check'
  ) then
    alter table public.qm_learning_cards drop constraint qm_learning_cards_card_type_check;
  end if;
end $$;
alter table public.qm_learning_cards
  add constraint qm_learning_cards_card_type_check
    check (card_type in ('video','link','image','text','file'));

-- 3) qm_boards: track Adilo project for intro video uploads
alter table public.qm_boards add column if not exists adilo_project_id text;
