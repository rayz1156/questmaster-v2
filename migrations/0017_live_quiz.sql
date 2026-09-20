-- 0017_live_quiz.sql
-- Kuiz langsung gaya Kahoot (mod pemain individu).
--
-- Lima jadual baharu dengan awalan qm_live_. Tiada jadual sedia ada diubah.
-- Kunci jawapan (correct_key) ialah rahsia: peserta tidak melalui RLS langsung;
-- semua laluan peserta menggunakan service role di pelayan dan menapis lajur
-- sendiri. RLS di sini hanya untuk pendidik kelas dan admin.
--
-- Idempoten sepenuhnya: create table/index if not exists, dan setiap polisi
-- RLS dibungkus drop policy if exists.

-- NOTA SEMAKAN: qm_is_admin() dan qm_is_class_educator() SUDAH WUJUD dalam
-- pangkalan data dan digunakan oleh dasar RLS jadual sedia ada (qm_hunts,
-- qm_challenges dan lain-lain). Migrasi ini hanya MEMANGGIL fungsi tersebut.
-- Jangan sekali-kali create or replace fungsi itu di sini: ia akan menulis
-- ganti takrifan sedia ada dan boleh mematahkan akses admin seluruh aplikasi.

-- ============================================================
-- 1. qm_live_quizzes
-- ============================================================
create table if not exists public.qm_live_quizzes (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid        not null references public.qm_classes(id) on delete cascade,
  owner_id    uuid        not null references public.qm_profiles(id) on delete cascade,
  title       text        not null,
  description text,
  created_at  timestamptz not null default now()
);
alter table public.qm_live_quizzes enable row level security;

-- ============================================================
-- 2. qm_live_questions
-- ============================================================
create table if not exists public.qm_live_questions (
  id             uuid primary key default gen_random_uuid(),
  quiz_id        uuid        not null references public.qm_live_quizzes(id) on delete cascade,
  order_idx      integer     not null default 0,
  prompt         text        not null,
  -- array [{"key":"A","text":"..."}], 2 hingga 6 item
  options        jsonb       not null check (jsonb_array_length(options) between 2 and 6),
  correct_key    text        not null, -- RAHSIA: jangan dedah kepada peserta
  points         integer     not null default 1000 check (points > 0),
  time_limit_sec integer     not null default 20 check (time_limit_sec > 0)
);

create index if not exists qm_live_questions_quiz_order_idx
  on public.qm_live_questions (quiz_id, order_idx);

alter table public.qm_live_questions enable row level security;

-- ============================================================
-- 3. qm_live_sessions
-- ============================================================
create table if not exists public.qm_live_sessions (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid        not null references public.qm_live_quizzes(id) on delete cascade,
  host_id             uuid        not null references public.qm_profiles(id),
  -- 6 aksara huruf besar, elak 0/O/1/I
  code                text        not null unique
                      check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  status              text        not null check (status in ('lobby','asking','revealed','ended')),
  current_index       integer     not null default -1,
  question_started_at timestamptz,
  created_at          timestamptz not null default now(),
  ended_at            timestamptz
);

create index if not exists qm_live_sessions_quiz_idx
  on public.qm_live_sessions (quiz_id, created_at desc);

alter table public.qm_live_sessions enable row level security;

-- ============================================================
-- 4. qm_live_players
-- ============================================================
create table if not exists public.qm_live_players (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid        not null references public.qm_live_sessions(id) on delete cascade,
  nickname      text        not null check (char_length(nickname) between 1 and 24),
  user_id       uuid        references public.qm_profiles(id) on delete set null, -- boleh null
  -- rahsia pemain: rawak 32 aksara, disimpan di pelayan sahaja
  player_token  text        not null check (char_length(player_token) = 32),
  score         integer     not null default 0,
  total_ms      integer     not null default 0,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- Nama tidak bertindih dalam satu sesi (tidak kira huruf besar/kecil).
create unique index if not exists qm_live_players_session_nickname_key
  on public.qm_live_players (session_id, lower(nickname));

create index if not exists qm_live_players_session_score_idx
  on public.qm_live_players (session_id, score desc);

alter table public.qm_live_players enable row level security;

-- ============================================================
-- 5. qm_live_answers
-- ============================================================
create table if not exists public.qm_live_answers (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid        not null references public.qm_live_sessions(id) on delete cascade,
  player_id       uuid        not null references public.qm_live_players(id) on delete cascade,
  question_id     uuid        not null references public.qm_live_questions(id) on delete cascade,
  choice_key      text        not null,
  is_correct      boolean     not null,
  ms_taken        integer     not null check (ms_taken >= 0),
  points_awarded  integer     not null check (points_awarded >= 0),
  created_at      timestamptz not null default now(),

  -- Kekangan unik ini yang menghalang jawapan berulang (satu jawapan satu
  -- soalan), bukan semakan aplikasi sahaja.
  constraint qm_live_answers_session_player_question_key
    unique (session_id, player_id, question_id)
);

create index if not exists qm_live_answers_session_idx
  on public.qm_live_answers (session_id, created_at);

alter table public.qm_live_answers enable row level security;

-- ============================================================
-- RLS
-- ============================================================
-- Pendidik kelas dan admin sahaja. Peserta tanpa akaun TIDAK melalui RLS:
-- semua laluan peserta guna getServiceSupabase() di pelayan (service role)
-- dan menapis lajur sendiri, jadi tiada polisi anon/perauthenticated di sini.

-- qm_live_quizzes: pendidik kelas miliknya
drop policy if exists p_live_quiz_educator_all on public.qm_live_quizzes;
create policy p_live_quiz_educator_all on public.qm_live_quizzes
  for all
  using (public.qm_is_class_educator(class_id))
  with check (public.qm_is_class_educator(class_id));

drop policy if exists p_live_quiz_admin_all on public.qm_live_quizzes;
create policy p_live_quiz_admin_all on public.qm_live_quizzes
  for all using (public.qm_is_admin()) with check (public.qm_is_admin());

-- qm_live_questions: melalui kelas kuiz induk
drop policy if exists p_live_question_educator_all on public.qm_live_questions;
create policy p_live_question_educator_all on public.qm_live_questions
  for all
  using (
    exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and public.qm_is_class_educator(q.class_id)
    )
  )
  with check (
    exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and public.qm_is_class_educator(q.class_id)
    )
  );

drop policy if exists p_live_question_admin_all on public.qm_live_questions;
create policy p_live_question_admin_all on public.qm_live_questions
  for all using (public.qm_is_admin()) with check (public.qm_is_admin());

-- qm_live_sessions: hos sesi (pendidik) dan pendidik kelas kuiz
drop policy if exists p_live_session_educator_all on public.qm_live_sessions;
create policy p_live_session_educator_all on public.qm_live_sessions
  for all
  using (
    host_id = auth.uid()
    or exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and public.qm_is_class_educator(q.class_id)
    )
  )
  with check (
    host_id = auth.uid()
    or exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and public.qm_is_class_educator(q.class_id)
    )
  );

drop policy if exists p_live_session_admin_all on public.qm_live_sessions;
create policy p_live_session_admin_all on public.qm_live_sessions
  for all using (public.qm_is_admin()) with check (public.qm_is_admin());

-- qm_live_players: pendidik kelas kuiz sahaja (hos perlu lihat senarai pemain)
drop policy if exists p_live_player_educator_all on public.qm_live_players;
create policy p_live_player_educator_all on public.qm_live_players
  for all
  using (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and public.qm_is_class_educator(q.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and public.qm_is_class_educator(q.class_id)
    )
  );

drop policy if exists p_live_player_admin_all on public.qm_live_players;
create policy p_live_player_admin_all on public.qm_live_players
  for all using (public.qm_is_admin()) with check (public.qm_is_admin());

-- qm_live_answers: pendidik kelas kuiz sahaja
drop policy if exists p_live_answer_educator_all on public.qm_live_answers;
create policy p_live_answer_educator_all on public.qm_live_answers
  for all
  using (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and public.qm_is_class_educator(q.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and public.qm_is_class_educator(q.class_id)
    )
  );

drop policy if exists p_live_answer_admin_all on public.qm_live_answers;
create policy p_live_answer_admin_all on public.qm_live_answers
  for all using (public.qm_is_admin()) with check (public.qm_is_admin());

-- WAJIB. Tanpa ini PostgREST tidak nampak jadual baharu dan setiap panggilan
-- akan gagal dengan "Could not find the table in the schema cache".
notify pgrst, 'reload schema';
