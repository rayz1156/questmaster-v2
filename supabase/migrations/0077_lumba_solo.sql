-- 0077_lumba_solo.sql
-- KZ-053: Lumba Solo. Cabaran kuiz kendiri (bukan sesi langsung) dengan
-- papan top scorer.
--
-- Tiga perubahan:
--   1. qm_live_quizzes mendapat suis solo_enabled dan kod solo_code
--      (6 aksara huruf besar/nombor tanpa 0/O/1/I, dijana pelayan);
--   2. jadual qm_solo_runs (satu baris setiap larian pemain);
--   3. jadual qm_solo_answers (satu baris setiap jawapan, unik setiap soal).
--
-- RLS dihidupkan pada kedua-dua jadual baharu TANPA sebarang polisi, dan
-- semua keterangan ditarik balik daripada anon/authenticated: hanya API
-- pelayan (service role selepas semakan kebenaran) boleh membaca dan
-- menulis. Tiada fungsi SECURITY DEFINER baharu.
--
-- Idempoten: setiap alter dibungkus if not exists / add column if not
-- exists; kekangan dicari melalui pg_constraint. Tiada BEGIN/COMMIT
-- (corak 0075 dan 0076); "satu transaksi" dicapai dengan satu larian psql.

-- ============================================================ 1. qm_live_quizzes
alter table public.qm_live_quizzes
  add column if not exists solo_enabled boolean not null default false;

alter table public.qm_live_quizzes
  add column if not exists solo_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'qm_live_quizzes_solo_code_key'
       and conrelid = 'public.qm_live_quizzes'::regclass
  ) then
    alter table public.qm_live_quizzes
      add constraint qm_live_quizzes_solo_code_key unique (solo_code);
  end if;
end $$;

-- ============================================================ 2. qm_solo_runs
-- user_id boleh null (tetamu); token_hash ialah sha256 hex token larian,
-- token mentah tidak pernah disimpan. question_ids ialah susunan soalan
-- larian yang dikocok oleh pelayan semasa mula.
create table if not exists public.qm_solo_runs (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.qm_live_quizzes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  nickname text not null check (char_length(nickname) between 1 and 24),
  token_hash text not null,
  question_ids uuid[] not null,
  next_idx int not null default 0,
  served_at timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score int not null default 0,
  correct int not null default 0,
  wrong int not null default 0,
  elapsed_ms int,
  status text not null default 'playing'
    check (status in ('playing','finished','expired')),
  ip_hash text
);

-- Papan: larian finished setiap kuiz mengikut markah menurun, masa menaik.
create index if not exists qm_solo_runs_papan_idx
  on public.qm_solo_runs (quiz_id, status, score desc, elapsed_ms asc);

-- Larian milik pengguna berdaftar setiap kuiz (sambung semula / had kadar).
create index if not exists qm_solo_runs_quiz_user_idx
  on public.qm_solo_runs (quiz_id, user_id);

-- ============================================================ 3. qm_solo_answers
-- Satu jawapan bagi setiap soal dalam satu larian; kekangan unique
-- (run_id, question_id) menolak jawapan berganda pada peringkat DB walaupun
-- laluan API sudah menolak terlebih dahulu.
create table if not exists public.qm_solo_answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qm_solo_runs(id) on delete cascade,
  question_id uuid not null,
  choice text,
  is_correct boolean not null,
  ms int not null,
  points int not null,
  created_at timestamptz not null default now(),
  unique (run_id, question_id)
);

-- ============================================================ 4. RLS
alter table public.qm_solo_runs enable row level security;
alter table public.qm_solo_answers enable row level security;

-- Tiada polisi: jadual ini tertutup kepada semua peranan aplikasi.
revoke all on public.qm_solo_runs from anon, authenticated;
revoke all on public.qm_solo_answers from anon, authenticated;

-- ============================================================ 5. PostgREST
notify pgrst, 'reload schema';
