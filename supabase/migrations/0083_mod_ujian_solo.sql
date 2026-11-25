-- 0083_mod_ujian_solo.sql
-- KZ-UTT Fasa 1: mod ujian Lumba Solo untuk pengukuran T1, T2, T3
-- (kajian latihan AI dewasa, STANDARD v1).
--
-- Perubahan (tambah sahaja; tiada lajur atau data sedia ada diubah):
--   1. qm_live_quizzes: solo_test_mode (suis mod ujian) dan
--      solo_measure_point (titik yang sedang dibuka pendidik: T1, T2, T3
--      atau null bila ujian ditutup);
--   2. qm_solo_runs: test_mode dan measure_point disalin semasa larian
--      dimulakan, supaya analisis tahu titik setiap larian walaupun
--      pendidik menukar titik kemudian;
--   3. indeks unik separa: SATU larian mod ujian bagi setiap pengguna,
--      kuiz dan titik. Larian yang terputus disambung oleh API (token
--      baharu), bukan diganti, jadi indeks merangkumi semua status.
--
-- Idempoten: add column if not exists, kekangan dicari melalui pg_constraint,
-- create index if not exists. Corak 0077: tiada BEGIN/COMMIT.

-- ============================================================ 1. qm_live_quizzes
alter table public.qm_live_quizzes
  add column if not exists solo_test_mode boolean not null default false;

alter table public.qm_live_quizzes
  add column if not exists solo_measure_point text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'qm_live_quizzes_solo_measure_point_check'
       and conrelid = 'public.qm_live_quizzes'::regclass
  ) then
    alter table public.qm_live_quizzes
      add constraint qm_live_quizzes_solo_measure_point_check
      check (solo_measure_point is null or solo_measure_point in ('T1','T2','T3'));
  end if;
end $$;

-- ============================================================ 2. qm_solo_runs
alter table public.qm_solo_runs
  add column if not exists test_mode boolean not null default false;

alter table public.qm_solo_runs
  add column if not exists measure_point text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'qm_solo_runs_measure_point_check'
       and conrelid = 'public.qm_solo_runs'::regclass
  ) then
    alter table public.qm_solo_runs
      add constraint qm_solo_runs_measure_point_check
      check (
        (test_mode = false and measure_point is null)
        -- 'is not null' wajib: NULL in (...) bernilai NULL dan CHECK menerimanya.
        or (test_mode = true and measure_point is not null and measure_point in ('T1','T2','T3'))
        -- user_id sengaja tidak diwajibkan di sini: lajur itu ON DELETE SET
        -- NULL, dan kekangan akan menghalang pemadaman akaun. API menolak
        -- tetamu dalam mod ujian.
      );
  end if;
end $$;

-- ============================================================ 3. satu larian setiap titik
create unique index if not exists qm_solo_runs_ujian_satu_idx
  on public.qm_solo_runs (quiz_id, user_id, measure_point)
  where test_mode = true;

-- ============================================================ 4. PostgREST
notify pgrst, 'reload schema';
