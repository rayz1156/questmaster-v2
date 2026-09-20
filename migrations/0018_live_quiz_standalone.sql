-- ============================================================
-- Migrasi 0018: Kuiz Langsung sebagai objek tahap atas (Fasa 2)
-- Keputusan produk Dr Hariz, 20 September 2026.
--   1. qm_live_quizzes.class_id jadi NULLABLE (null = kuiz peribadi).
--   2. qm_profiles.max_live_players = kelayakan pengguna (pola sama dengan
--      max_classes_owned / can_upload_files; TIADA sistem pelan berasingan).
--   3. qm_live_sessions.max_players = petikan had pada masa sesi dicipta,
--      supaya menurunkan taraf pengguna tidak menjejaskan sesi yang sedang
--      berjalan.
-- Idempoten. Akhiri dengan notify pgrst.
-- ============================================================

-- 1. class_id nullable ---------------------------------------------------
alter table public.qm_live_quizzes alter column class_id drop not null;

-- 2. Kelayakan had pemain pada profil ------------------------------------
alter table public.qm_profiles
  add column if not exists max_live_players integer not null default 50;

-- 3. Had petikan pada sesi -----------------------------------------------
alter table public.qm_live_sessions
  add column if not exists max_players integer not null default 50;

-- ============================================================
-- RLS: kemas kini polisi untuk class_id nullable
-- ============================================================
-- Polisi sedia ada menganggap class_id sentiasa ada. Kini:
--   - pemilik kuiz (owner_id = auth.uid()) sentiasa ada akses penuh;
--   - pendidik kelas ada akses HANYA apabila class_id tidak null;
--   - admin kekal seperti sedia ada.
-- JANGAN sekali-kali semak qm_class_members; itu jadual PESERTA.

-- ---- qm_live_quizzes ----
drop policy if exists p_live_quiz_educator_all on public.qm_live_quizzes;
drop policy if exists p_live_quiz_owner_all on public.qm_live_quizzes;

create policy p_live_quiz_owner_all on public.qm_live_quizzes
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy p_live_quiz_educator_all on public.qm_live_quizzes
  for all
  using (class_id is not null and public.qm_is_class_educator(class_id))
  with check (class_id is not null and public.qm_is_class_educator(class_id));

-- ---- qm_live_questions ----
drop policy if exists p_live_question_educator_all on public.qm_live_questions;
drop policy if exists p_live_question_owner_all on public.qm_live_questions;

create policy p_live_question_owner_all on public.qm_live_questions
  for all
  using (
    exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and q.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and q.owner_id = auth.uid()
    )
  );

create policy p_live_question_educator_all on public.qm_live_questions
  for all
  using (
    exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and q.class_id is not null
        and public.qm_is_class_educator(q.class_id)
    )
  )
  with check (
    exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and q.class_id is not null
        and public.qm_is_class_educator(q.class_id)
    )
  );

-- ---- qm_live_sessions ----
drop policy if exists p_live_session_educator_all on public.qm_live_sessions;
drop policy if exists p_live_session_owner_all on public.qm_live_sessions;

create policy p_live_session_owner_all on public.qm_live_sessions
  for all
  using (
    host_id = auth.uid()
    or exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and q.owner_id = auth.uid()
    )
  )
  with check (
    host_id = auth.uid()
    or exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and q.owner_id = auth.uid()
    )
  );

create policy p_live_session_educator_all on public.qm_live_sessions
  for all
  using (
    exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and q.class_id is not null
        and public.qm_is_class_educator(q.class_id)
    )
  )
  with check (
    exists (
      select 1 from public.qm_live_quizzes q
      where q.id = quiz_id
        and q.class_id is not null
        and public.qm_is_class_educator(q.class_id)
    )
  );

-- ---- qm_live_players ----
drop policy if exists p_live_player_educator_all on public.qm_live_players;
drop policy if exists p_live_player_owner_all on public.qm_live_players;

create policy p_live_player_owner_all on public.qm_live_players
  for all
  using (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and (q.owner_id = auth.uid() or s.host_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and (q.owner_id = auth.uid() or s.host_id = auth.uid())
    )
  );

create policy p_live_player_educator_all on public.qm_live_players
  for all
  using (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and q.class_id is not null
        and public.qm_is_class_educator(q.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and q.class_id is not null
        and public.qm_is_class_educator(q.class_id)
    )
  );

-- ---- qm_live_answers ----
drop policy if exists p_live_answer_educator_all on public.qm_live_answers;
drop policy if exists p_live_answer_owner_all on public.qm_live_answers;

create policy p_live_answer_owner_all on public.qm_live_answers
  for all
  using (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and (q.owner_id = auth.uid() or s.host_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and (q.owner_id = auth.uid() or s.host_id = auth.uid())
    )
  );

create policy p_live_answer_educator_all on public.qm_live_answers
  for all
  using (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and q.class_id is not null
        and public.qm_is_class_educator(q.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.qm_live_sessions s
      join public.qm_live_quizzes q on q.id = s.quiz_id
      where s.id = session_id
        and q.class_id is not null
        and public.qm_is_class_educator(q.class_id)
    )
  );

-- ============================================================
-- Sisipan pemain selamat daripada perlumbaan (Bahagian 2.3)
-- ============================================================
-- Kiraan pemain dan sisipan mesti atomik supaya dua pemain yang masuk
-- serentak pada tempat terakhir tidak kedua-duanya berjaya. Fungsi ini
-- mengunci baris sesi (for update), kemudian membuat SATU sisipan
-- bersyarat dalam transaksi yang sama. Kembali kod ralat tersuai:
--   LV005 = sesi penuh, LV009 = nama sudah diambil, LV004 = sesi tiada.
-- NOTA: JANGAN guna gen_random_bytes di sini. Fungsi itu datang daripada
-- pgcrypto yang dipasang dalam skema "extensions", bukan "public", jadi ia
-- TIDAK dapat dicapai dengan "set search_path = public" di bawah dan sisipan
-- pemain akan gagal sepenuhnya. gen_random_uuid() ialah sebahagian teras
-- Postgres dan sentiasa ada. Disahkan pada pangkalan data sebenar.
create or replace function public.qm_live_join_player(
  p_session_id uuid,
  p_nickname text
)
returns table (player_id uuid, player_token text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_limit integer;
begin
  select s.max_players into v_limit
  from public.qm_live_sessions s
  where s.id = p_session_id
  for update;
  -- Sesi tiada: raise exception, bukan balik kosong (balik kosong merencana
  -- pengendalian ralat di pelayan aplikasi).
  if v_limit is null then
    raise exception 'Sesi tidak dijumpai.' using errcode = 'LV004';
  end if;

  insert into public.qm_live_players (session_id, nickname, player_token)
  select
    p_session_id,
    p_nickname,
    substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32)
  where (select count(*) from public.qm_live_players where session_id = p_session_id) < v_limit
  returning id, player_token into player_id, player_token;

  if player_id is null then
    raise exception 'Sesi ini sudah penuh. Had sesi ini ialah % pemain.', v_limit
      using errcode = 'LV005';
  end if;
  return;
exception
  when unique_violation then
    raise exception 'Nama sudah diambil. Sila pilih nama lain.'
      using errcode = 'LV009';
end;
$$;

-- WAJIB. Tanpa ini PostgREST tidak nampak jadual/fungsi baharu.
notify pgrst, 'reload schema';
