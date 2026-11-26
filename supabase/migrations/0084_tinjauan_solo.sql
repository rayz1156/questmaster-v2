-- 0084_tinjauan_solo.sql
-- KZ-UTT Fasa 2: item tinjauan (skala berangka) selepas garisan penamat
-- Lumba Solo mod ujian, untuk T1, T2, T3 (MAILS 0 hingga 10, API dan
-- pemindahan 1 hingga 5, kekerapan guna AI).
--
-- Dua jadual baharu; tiada jadual sedia ada diubah.
--   qm_solo_survey_items   : item tinjauan setiap kuiz, dengan titik (T1/T2/T3)
--                            di mana item dipaparkan;
--   qm_solo_survey_answers : satu nilai bagi setiap larian dan item.
--
-- Akses hanya melalui API (service role). RLS dihidupkan tanpa polisi
-- supaya anon/authenticated tidak boleh membaca atau menulis terus.
-- Idempoten: create table/index if not exists.

create table if not exists public.qm_solo_survey_items (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.qm_live_quizzes(id) on delete cascade,
  position    int  not null default 0,
  -- Kod item untuk analisis, contohnya MAILS_01, API_03, PIND_01.
  code        text check (code is null or char_length(code) between 1 and 40),
  -- Konstruk, contohnya MAILS, API, PEMINDAHAN, KEKERAPAN.
  construct   text check (construct is null or char_length(construct) between 1 and 40),
  prompt      text not null check (char_length(prompt) between 1 and 500),
  scale_min   int  not null check (scale_min in (0, 1)),
  scale_max   int  not null check (scale_max between 2 and 10),
  label_min   text check (label_min is null or char_length(label_min) <= 80),
  label_max   text check (label_max is null or char_length(label_max) <= 80),
  points      text[] not null default array['T1','T2','T3']::text[]
              check (cardinality(points) between 1 and 3 and points <@ array['T1','T2','T3']::text[]),
  created_at  timestamptz not null default now(),
  constraint qm_solo_survey_items_skala_check check (scale_max > scale_min)
);
alter table public.qm_solo_survey_items enable row level security;

create index if not exists qm_solo_survey_items_quiz_idx
  on public.qm_solo_survey_items (quiz_id, position);

create table if not exists public.qm_solo_survey_answers (
  run_id      uuid not null references public.qm_solo_runs(id) on delete cascade,
  -- NO ACTION (bukan RESTRICT): disemak di hujung kenyataan, jadi memadam
  -- kuiz (lata ke larian, jawapan dan item) berjaya, tetapi memadam item
  -- yang sudah berjawapan secara terus ditolak.
  item_id     uuid not null references public.qm_solo_survey_items(id) on delete no action,
  value       int  not null,
  answered_at timestamptz not null default now(),
  primary key (run_id, item_id)
);
alter table public.qm_solo_survey_answers enable row level security;

create index if not exists qm_solo_survey_answers_item_idx
  on public.qm_solo_survey_answers (item_id);

notify pgrst, 'reload schema';
