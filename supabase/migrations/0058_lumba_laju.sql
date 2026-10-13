-- 0058_lumba_laju.sql
-- Mod Lumba Laju untuk Kuiz Langsung.
-- Hanya menambah lajur dan fungsi. Sesi kuiz biasa (game_mode = 'classic')
-- berkelakuan sama seperti sebelum ini.
--
-- Rollback (jika perlu):
--   drop function if exists public.qm_race_submit(uuid, uuid, text), public.qm_race_state(uuid),
--     public.qm_race_start(uuid), public.qm_race_end(uuid), public.qm_race_serve(uuid);
--   alter table public.qm_live_answers drop constraint if exists qm_live_answers_spq_attempt_key;
--   delete from public.qm_live_answers where attempt > 1;
--   alter table public.qm_live_answers add constraint qm_live_answers_session_player_question_key
--     unique (session_id, player_id, question_id);
--   (lajur baharu boleh dibiarkan; semuanya ada nilai lalai)

begin;

-- 1. Sesi: jenis mod dan tetapan lumba ------------------------------------
alter table public.qm_live_sessions
  add column if not exists game_mode     text          not null default 'classic',
  add column if not exists race_minutes  integer       not null default 5,
  add column if not exists race_ends_at  timestamptz,
  add column if not exists race_base     numeric(5,2)  not null default 5,
  add column if not exists race_nitro    numeric(5,2)  not null default 3,
  add column if not exists race_streak   numeric(5,2)  not null default 2,
  add column if not exists race_finished integer       not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qm_live_sessions_game_mode_check') then
    alter table public.qm_live_sessions add constraint qm_live_sessions_game_mode_check
      check (game_mode in ('classic', 'race'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qm_live_sessions_race_minutes_check') then
    alter table public.qm_live_sessions add constraint qm_live_sessions_race_minutes_check
      check (race_minutes between 1 and 60);
  end if;
end $$;

-- 2. Pemain: kedudukan kenderaan di trek ----------------------------------
alter table public.qm_live_players
  add column if not exists race_distance     numeric(6,2) not null default 0,
  add column if not exists race_wrong        integer      not null default 0,
  add column if not exists race_frozen_until timestamptz,
  add column if not exists race_rank         integer,
  add column if not exists race_finished_at  timestamptz,
  add column if not exists race_question_id  uuid references public.qm_live_questions(id) on delete set null,
  add column if not exists race_served_at    timestamptz,
  add column if not exists race_queue        uuid[]       not null default '{}';

-- 3. Jawapan: soalan boleh dijawab lebih sekali dalam lumba ----------------
alter table public.qm_live_answers
  add column if not exists attempt integer not null default 1;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'qm_live_answers_session_player_question_key') then
    alter table public.qm_live_answers drop constraint qm_live_answers_session_player_question_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qm_live_answers_spq_attempt_key') then
    alter table public.qm_live_answers add constraint qm_live_answers_spq_attempt_key
      unique (session_id, player_id, question_id, attempt);
  end if;
end $$;

-- 4. Fungsi -----------------------------------------------------------------
-- Semua fungsi SECURITY DEFINER dan hanya boleh dipanggil oleh service_role.
-- Laluan API mengesahkan player_token sebelum memanggilnya.

-- Tamatkan lumba.
create or replace function public.qm_race_end(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update qm_live_sessions set status = 'ended', ended_at = now()
   where id = p_session and game_mode = 'race' and status <> 'ended';
  update qm_live_players set race_question_id = null
   where session_id = p_session;
end $$;

-- Beri pemain soalan seterusnya daripada barisannya. Barisan kosong diisi
-- semula dengan semua soalan kuiz dalam susunan rawak; soalan yang baru
-- dijawab tidak diberi semula serta-merta jika ada pilihan lain.
create or replace function public.qm_race_serve(p_player uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_quiz uuid; v_queue uuid[]; v_prev uuid; v_q uuid;
begin
  select s.quiz_id, p.race_queue, p.race_question_id
    into v_quiz, v_queue, v_prev
    from qm_live_players p join qm_live_sessions s on s.id = p.session_id
   where p.id = p_player;
  if coalesce(array_length(v_queue, 1), 0) = 0 then
    select coalesce(array_agg(id order by random()), '{}') into v_queue
      from qm_live_questions where quiz_id = v_quiz;
    if array_length(v_queue, 1) > 1 and v_queue[1] = v_prev then
      v_queue := v_queue[2:2] || v_queue[1:1] || v_queue[3:];
    end if;
  end if;
  v_q := v_queue[1];
  update qm_live_players
     set race_queue = coalesce(v_queue[2:], '{}'),
         race_question_id = v_q,
         race_served_at = now()
   where id = p_player;
  return v_q;
end $$;

-- Mula lumba: lobby -> asking, tetapkan masa tamat, beri soalan pertama.
create or replace function public.qm_race_start(p_session uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_ends timestamptz; v_n int; r record;
begin
  select count(*) into v_n from qm_live_questions q
    join qm_live_sessions s on s.quiz_id = q.quiz_id where s.id = p_session;
  if v_n < 1 then
    raise exception 'This quiz has no questions.' using errcode = 'RACE1';
  end if;
  update qm_live_sessions
     set status = 'asking', current_index = 0, question_started_at = now(),
         race_ends_at = now() + make_interval(mins => race_minutes), race_finished = 0
   where id = p_session and game_mode = 'race' and status = 'lobby'
  returning race_ends_at into v_ends;
  if v_ends is null then
    raise exception 'The race is not in the lobby.' using errcode = 'RACE2';
  end if;
  for r in select id from qm_live_players where session_id = p_session loop
    update qm_live_players
       set race_distance = 0, race_wrong = 0, race_frozen_until = null, race_rank = null,
           race_finished_at = null, race_queue = '{}', race_question_id = null,
           score = 0, total_ms = 0, streak = 0, best_streak = 0
     where id = r.id;
    perform qm_race_serve(r.id);
  end loop;
  return v_ends;
end $$;

-- Keadaan seorang pemain. Menamatkan lumba jika masa sudah habis, dan memberi
-- soalan kepada pemain yang menyertai lewat.
create or replace function public.qm_race_state(p_player uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p qm_live_players%rowtype; s qm_live_sessions%rowtype; v_pos int; v_total int;
begin
  select * into p from qm_live_players where id = p_player;
  if not found then
    raise exception 'Player not found.' using errcode = 'RACE3';
  end if;
  select * into s from qm_live_sessions where id = p.session_id;
  if s.game_mode = 'race' and s.status = 'asking' and now() >= s.race_ends_at then
    perform qm_race_end(s.id);
    select * into s from qm_live_sessions where id = p.session_id;
  end if;
  if s.status = 'asking' and p.race_finished_at is null and p.race_question_id is null then
    perform qm_race_serve(p.id);
  end if;
  select * into p from qm_live_players where id = p_player;
  select count(*) into v_total from qm_live_players where session_id = s.id;
  select count(*) + 1 into v_pos from qm_live_players o
   where o.session_id = s.id and o.id <> p.id
     and (   (o.race_rank is not null and (p.race_rank is null or o.race_rank < p.race_rank))
          or (o.race_rank is null and p.race_rank is null and o.race_distance > p.race_distance));
  return jsonb_build_object(
    'status', s.status, 'gameMode', s.game_mode, 'endsAt', s.race_ends_at,
    'serverNow', now(), 'distance', p.race_distance, 'score', p.score,
    'streak', p.streak, 'wrongStreak', p.race_wrong, 'frozenUntil', p.race_frozen_until,
    'rank', p.race_rank, 'position', v_pos, 'playerCount', v_total,
    'finishedCount', s.race_finished, 'questionId', p.race_question_id,
    'servedAt', p.race_served_at);
end $$;

-- Hantar jawapan. Semua pengiraan di pelayan, baris pemain dikunci supaya
-- dua jawapan serentak daripada pemain sama tidak bertindih.
create or replace function public.qm_race_submit(p_player uuid, p_question uuid, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p qm_live_players%rowtype; s qm_live_sessions%rowtype; q record;
  v_choice text := upper(trim(coalesce(p_choice, '')));
  v_ms int; v_ok boolean; v_nf numeric := 0; v_adv numeric := 0; v_pts int := 0;
  v_mult int; v_attempt int; v_queue uuid[]; v_pos int; v_next uuid; v_bonus boolean := false;
begin
  select * into p from qm_live_players where id = p_player for update;
  if not found then
    raise exception 'Player not found.' using errcode = 'RACE3';
  end if;
  select * into s from qm_live_sessions where id = p.session_id;
  if s.game_mode <> 'race' then
    raise exception 'This session is not a race.' using errcode = 'RACE4';
  end if;
  if s.status = 'asking' and now() >= s.race_ends_at then
    perform qm_race_end(s.id);
    return jsonb_build_object('ok', false, 'reason', 'ended');
  end if;
  if s.status <> 'asking' then
    return jsonb_build_object('ok', false, 'reason', case when s.status = 'ended' then 'ended' else 'not_started' end);
  end if;
  if p.race_finished_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'finished', 'rank', p.race_rank);
  end if;
  if p.race_frozen_until is not null and now() < p.race_frozen_until then
    return jsonb_build_object('ok', false, 'reason', 'frozen', 'frozenUntil', p.race_frozen_until);
  end if;
  if p.race_question_id is distinct from p_question then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'questionId', p.race_question_id);
  end if;

  select id, correct_key, points, time_limit_sec, double_points into q
    from qm_live_questions where id = p_question;
  v_ms := greatest(0, floor(extract(epoch from (now() - p.race_served_at)) * 1000))::int;
  v_ok := v_choice = q.correct_key;
  v_mult := case when q.double_points then 2 else 1 end;
  select coalesce(max(attempt), 0) + 1 into v_attempt from qm_live_answers
   where session_id = s.id and player_id = p.id and question_id = q.id;

  if v_ok then
    -- Nitro: penuh jika jawab serta-merta, sifar selepas separuh had masa.
    v_nf := greatest(0, 1 - v_ms::numeric / (q.time_limit_sec * 500));
    p.streak := p.streak + 1;
    p.race_wrong := 0;
    v_adv := (s.race_base + s.race_nitro * v_nf) * v_mult;
    if p.streak % 3 = 0 then
      v_adv := v_adv + s.race_streak;
      v_bonus := true;
    end if;
    v_pts := round(q.points * (1 + 0.5 * v_nf) * v_mult);
    p.race_distance := least(100, p.race_distance + v_adv);
    if p.race_distance >= 100 then
      update qm_live_sessions set race_finished = race_finished + 1
       where id = s.id returning race_finished into p.race_rank;
      p.race_finished_at := now();
    end if;
    v_queue := p.race_queue;
  else
    p.streak := 0;
    p.race_wrong := p.race_wrong + 1;
    -- Soalan yang dijawab salah masuk semula ke kedudukan 2 atau 3 barisan.
    v_pos := least(coalesce(array_length(p.race_queue, 1), 0), 1 + floor(random() * 2)::int);
    v_queue := p.race_queue[1:v_pos] || q.id || p.race_queue[v_pos + 1:];
    if p.race_wrong >= 3 then
      p.race_wrong := 0;
      p.race_frozen_until := now() + interval '5 seconds';
    end if;
  end if;

  insert into qm_live_answers
    (session_id, player_id, question_id, choice_key, is_correct, ms_taken,
     points_awarded, streak_bonus, streak_at, attempt)
  values
    (s.id, p.id, q.id, v_choice, v_ok, v_ms, v_pts, 0, p.streak, v_attempt);

  update qm_live_players
     set score = score + v_pts, total_ms = total_ms + v_ms,
         streak = p.streak, best_streak = greatest(best_streak, p.streak),
         race_wrong = p.race_wrong, race_distance = p.race_distance,
         race_rank = p.race_rank, race_finished_at = p.race_finished_at,
         race_frozen_until = p.race_frozen_until, race_queue = coalesce(v_queue, '{}'),
         last_seen_at = now()
   where id = p.id;

  if p.race_finished_at is null then
    v_next := qm_race_serve(p.id);
    if p.race_frozen_until is not null and p.race_frozen_until > now() then
      -- Jam soalan seterusnya bermula selepas beku tamat.
      update qm_live_players set race_served_at = p.race_frozen_until where id = p.id;
    end if;
  else
    update qm_live_players set race_question_id = null where id = p.id;
    if not exists (select 1 from qm_live_players
                    where session_id = s.id and race_finished_at is null) then
      perform qm_race_end(s.id);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'correct', v_ok, 'correctKey', q.correct_key,
    'advance', round(v_adv, 2), 'nitro', round(v_nf, 2), 'streakBonus', v_bonus,
    'points', v_pts, 'distance', p.race_distance, 'streak', p.streak,
    'wrongStreak', p.race_wrong, 'frozenUntil', p.race_frozen_until,
    'rank', p.race_rank, 'nextQuestionId', v_next);
end $$;

revoke all on function public.qm_race_end(uuid)                from public, anon, authenticated;
revoke all on function public.qm_race_serve(uuid)              from public, anon, authenticated;
revoke all on function public.qm_race_start(uuid)              from public, anon, authenticated;
revoke all on function public.qm_race_state(uuid)              from public, anon, authenticated;
revoke all on function public.qm_race_submit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.qm_race_end(uuid)                to service_role;
grant execute on function public.qm_race_serve(uuid)              to service_role;
grant execute on function public.qm_race_start(uuid)              to service_role;
grant execute on function public.qm_race_state(uuid)              to service_role;
grant execute on function public.qm_race_submit(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
