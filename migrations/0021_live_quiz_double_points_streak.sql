-- ============================================================
-- Migrasi 0021: mata berganda dan bonus jawapan berturut-turut
-- Keputusan Dr Hariz, 20 September 2026. Kedua-duanya meniru Kahoot.
--
-- double_points  : suis setiap soalan. Mata asas didarab dua.
-- streak_bonus   : suis setiap kuiz, dipetik ke sesi semasa sesi dicipta,
--                  supaya menukar tetapan kuiz tidak mengubah sesi yang
--                  sedang berjalan (pola sama dengan max_players).
-- streak         : bilangan jawapan betul berturut-turut pemain sekarang.
-- best_streak    : rentetan terpanjang pemain dalam sesi itu.
-- streak_bonus, streak_at pada jawapan: supaya skrin dedah boleh memecahkan
--                  mata asas dan bonus, dan supaya markah boleh diaudit.
--
-- Lalai: double_points false (tiada soalan sedia ada berubah), streak_bonus
-- true (Kahoot juga menghidupkannya secara lalai).
-- Idempoten. Akhiri dengan notify pgrst.
-- ============================================================

alter table public.qm_live_questions
  add column if not exists double_points boolean not null default false;

alter table public.qm_live_quizzes
  add column if not exists streak_bonus boolean not null default true;

alter table public.qm_live_sessions
  add column if not exists streak_bonus boolean not null default true;

alter table public.qm_live_players
  add column if not exists streak integer not null default 0;

alter table public.qm_live_players
  add column if not exists best_streak integer not null default 0;

alter table public.qm_live_answers
  add column if not exists streak_bonus integer not null default 0;

alter table public.qm_live_answers
  add column if not exists streak_at integer not null default 0;

-- WAJIB. Tanpa ini PostgREST tidak nampak lajur baharu.
notify pgrst, 'reload schema';
