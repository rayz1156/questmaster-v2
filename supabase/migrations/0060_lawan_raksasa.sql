-- 0060_lawan_raksasa.sql
-- Mod Lawan Raksasa (Boss Battle) untuk Kuiz Langsung, KZ-013.
-- Seluruh kelas bekerjasama: jawapan betul mencederakan raksasa, jawapan
-- salah memulihkannya. Kelas menang jika nyawa raksasa sifar sebelum masa
-- tamat. Guna semula lajur race_* (barisan soalan, beku, masa dihidang),
-- race_minutes, attempt dan review_* daripada 0058/0059, serta qm_race_serve.
--
-- Rollback (jika perlu):
--   drop function if exists public.qm_boss_start(uuid), public.qm_boss_state(uuid),
--     public.qm_boss_submit(uuid, uuid, text), public.qm_boss_end(uuid, text);
--   (lajur baharu ada nilai lalai dan boleh dibiarkan; kekangan game_mode boleh
--    dikembalikan kepada ('classic','race') hanya selepas tiada sesi 'boss')

begin;

-- 1. Mod baharu ------------------------------------------------------------
alter table public.qm_live_sessions drop constraint if exists qm_live_sessions_game_mode_check;
alter table public.qm_live_sessions add constraint qm_live_sessions_game_mode_check
  check (game_mode in ('classic', 'race', 'boss'));

-- 2. Sesi: keadaan raksasa ------------------------------------------------
alter table public.qm_live_sessions
  add column if not exists boss_k           integer not null default 65,
  add column if not exists boss_dmg         integer not null default 10,
  add column if not exists boss_crit        integer not null default 6,
  add column if not exists boss_heal        integer not null default 4,
  add column if not exists boss_max_hp      integer not null default 0,
  add column if not exists boss_hp          integer not null default 0,
  add column if not exists boss_crits       integer not null default 0,
  add column if not exists boss_healed      integer not null default 0,
  add column if not exists boss_last_hit    uuid references public.qm_live_players(id) on delete set null,
  add column if not exists boss_result      text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qm_live_sessions_boss_k_check') then
    alter table public.qm_live_sessions add constraint qm_live_sessions_boss_k_check
      check (boss_k between 20 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qm_live_sessions_boss_result_check') then
    alter table public.qm_live_sessions add constraint qm_live_sessions_boss_result_check
      check (boss_result is null or boss_result in ('win', 'lose', 'stopped'));
  end if;
end $$;

-- 3. Pemain dan jawapan ---------------------------------------------------
alter table public.qm_live_players
  add column if not exists boss_damage integer not null default 0;

-- Kesan setiap jawapan pada raksasa: positif = kerosakan, negatif = pulih.
alter table public.qm_live_answers
  add column if not exists boss_effect integer not null default 0,
  add column if not exists boss_crit   boolean not null default false;

-- Suapan serangan guna indeks sedia ada qm_live_answers_session_idx (session_id, created_at).

-- 4. Fungsi -----------------------------------------------------------------
-- SECURITY DEFINER, service_role sahaja. Laluan API mengesahkan hos atau
-- player_token sebelum memanggilnya.

-- Tamatkan pertarungan dengan keputusan 'win', 'lose' atau 'stopped'.
create or replace function public.qm_boss_end(p_session uuid, p_result text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_result not in ('win', 'lose', 'stopped') then
    raise exception 'Invalid boss result.' using errcode = 'BOSS5';
  end if;
  update qm_live_sessions
     set status = 'ended', ended_at = now(), boss_result = p_result
   where id = p_session and game_mode = 'boss' and status <> 'ended';
  update qm_live_players set race_question_id = null where session_id = p_session;
end $$;

-- Mula: lobby -> asking. Nyawa = bilangan pemain x minit x boss_k (dikunci
-- semasa mula; pemain lewat menyertai membantu tanpa menambah nyawa).
create or replace function public.qm_boss_start(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s qm_live_sessions%rowtype; v_n int; v_q int; v_hp int; r record;
begin
  select * into s from qm_live_sessions where id = p_session for update;
  if not found or s.game_mode <> 'boss' then
    raise exception 'This session is not a Boss Battle.' using errcode = 'BOSS4';
  end if;
  if s.status <> 'lobby' then
    raise exception 'The battle is not in the lobby.' using errcode = 'BOSS2';
  end if;
  select count(*) into v_q from qm_live_questions where quiz_id = s.quiz_id;
  if v_q < 1 then
    raise exception 'This quiz has no questions.' using errcode = 'BOSS1';
  end if;
  select count(*) into v_n from qm_live_players where session_id = p_session;
  if v_n < 1 then
    raise exception 'Nobody has joined yet.' using errcode = 'BOSS3';
  end if;
  v_hp := greatest(1, v_n * s.race_minutes * s.boss_k);
  update qm_live_sessions
     set status = 'asking', current_index = 0, question_started_at = now(),
         race_ends_at = now() + make_interval(mins => race_minutes),
         boss_max_hp = v_hp, boss_hp = v_hp, boss_crits = 0, boss_healed = 0,
         boss_last_hit = null, boss_result = null, review_index = -1, review_revealed = false
   where id = p_session;
  for r in select id from qm_live_players where session_id = p_session loop
    update qm_live_players
       set race_wrong = 0, race_frozen_until = null, race_queue = '{}', race_question_id = null,
           score = 0, total_ms = 0, streak = 0, best_streak = 0, boss_damage = 0
     where id = r.id;
    perform qm_race_serve(r.id);
  end loop;
  return jsonb_build_object('maxHp', v_hp, 'endsAt', (select race_ends_at from qm_live_sessions where id = p_session));
end $$;

-- Keadaan seorang pemain. Menamatkan pertarungan bila masa habis
-- (keputusan 'lose'), dan memberi soalan kepada pemain yang menyertai lewat.
create or replace function public.qm_boss_state(p_player uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p qm_live_players%rowtype; s qm_live_sessions%rowtype; v_pos int; v_total int;
begin
  select * into p from qm_live_players where id = p_player;
  if not found then
    raise exception 'Player not found.' using errcode = 'BOSS6';
  end if;
  select * into s from qm_live_sessions where id = p.session_id;
  if s.game_mode = 'boss' and s.status = 'asking' and now() >= s.race_ends_at then
    perform qm_boss_end(s.id, 'lose');
    select * into s from qm_live_sessions where id = p.session_id;
  end if;
  if s.status = 'asking' and p.race_question_id is null then
    perform qm_race_serve(p.id);
  end if;
  select * into p from qm_live_players where id = p_player;
  select count(*) into v_total from qm_live_players where session_id = s.id;
  -- Kedudukan ikut kerosakan, seri dipecahkan ikut nama (sama dengan skrin guru).
  select count(*) + 1 into v_pos from qm_live_players o
   where o.session_id = s.id and o.id <> p.id
     and (o.boss_damage > p.boss_damage
          or (o.boss_damage = p.boss_damage and lower(o.nickname) < lower(p.nickname)));
  return jsonb_build_object(
    'status', s.status, 'gameMode', s.game_mode, 'endsAt', s.race_ends_at, 'serverNow', now(),
    'hp', s.boss_hp, 'maxHp', s.boss_max_hp, 'result', s.boss_result,
    'myDamage', p.boss_damage, 'score', p.score, 'streak', p.streak,
    'wrongStreak', p.race_wrong, 'frozenUntil', p.race_frozen_until,
    'position', v_pos, 'playerCount', v_total,
    'questionId', p.race_question_id, 'servedAt', p.race_served_at,
    'lastHitByMe', s.boss_last_hit is not null and s.boss_last_hit = p.id);
end $$;

-- Hantar jawapan. Baris SESI dikunci dahulu (nyawa raksasa dikongsi semua
-- pemain), kemudian baris pemain, supaya jawapan serentak tidak bertindih.
create or replace function public.qm_boss_submit(p_player uuid, p_question uuid, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sid uuid; s qm_live_sessions%rowtype; p qm_live_players%rowtype; q record;
  v_choice text := upper(trim(coalesce(p_choice, '')));
  v_ms int; v_ok boolean; v_nf numeric := 0; v_dmg int := 0; v_heal int := 0; v_pts int := 0;
  v_mult int; v_attempt int; v_pos int; v_crit boolean := false; v_bonus boolean := false;
  v_queue uuid[]; v_next uuid;
begin
  select session_id into v_sid from qm_live_players where id = p_player;
  if not found then
    raise exception 'Player not found.' using errcode = 'BOSS6';
  end if;
  select * into s from qm_live_sessions where id = v_sid for update;
  if s.game_mode <> 'boss' then
    raise exception 'This session is not a Boss Battle.' using errcode = 'BOSS4';
  end if;
  select * into p from qm_live_players where id = p_player for update;

  if s.status = 'asking' and now() >= s.race_ends_at then
    perform qm_boss_end(s.id, 'lose');
    return jsonb_build_object('ok', false, 'reason', 'ended');
  end if;
  if s.status <> 'asking' then
    return jsonb_build_object('ok', false, 'reason', case when s.status = 'ended' then 'ended' else 'not_started' end);
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
    -- Kritikal: penuh jika dijawab serta-merta, sifar selepas separuh had masa.
    v_nf := greatest(0, 1 - v_ms::numeric / (q.time_limit_sec * 500));
    p.streak := p.streak + 1;
    p.race_wrong := 0;
    v_dmg := round(s.boss_dmg + s.boss_crit * v_nf);
    if p.streak % 3 = 0 then
      v_dmg := v_dmg + 5;
      v_bonus := true;
    end if;
    v_dmg := v_dmg * v_mult;
    v_crit := v_nf > 0.6;
    -- Kerosakan yang dikira hanya setakat nyawa yang tinggal.
    v_dmg := least(v_dmg, s.boss_hp);
    v_pts := round(q.points * (1 + 0.5 * v_nf) * v_mult);
    s.boss_hp := s.boss_hp - v_dmg;
    v_queue := p.race_queue;
  else
    p.streak := 0;
    p.race_wrong := p.race_wrong + 1;
    v_heal := least(s.boss_heal, s.boss_max_hp - s.boss_hp);
    s.boss_hp := s.boss_hp + v_heal;
    v_pos := least(coalesce(array_length(p.race_queue, 1), 0), 1 + floor(random() * 2)::int);
    v_queue := p.race_queue[1:v_pos] || q.id || p.race_queue[v_pos + 1:];
    if p.race_wrong >= 3 then
      p.race_wrong := 0;
      p.race_frozen_until := now() + interval '5 seconds';
    end if;
  end if;

  insert into qm_live_answers
    (session_id, player_id, question_id, choice_key, is_correct, ms_taken,
     points_awarded, streak_bonus, streak_at, attempt, boss_effect, boss_crit)
  values
    (s.id, p.id, q.id, v_choice, v_ok, v_ms, v_pts, 0, p.streak, v_attempt,
     case when v_ok then v_dmg else -v_heal end, v_crit);

  update qm_live_players
     set score = score + v_pts, total_ms = total_ms + v_ms, boss_damage = boss_damage + v_dmg,
         streak = p.streak, best_streak = greatest(best_streak, p.streak),
         race_wrong = p.race_wrong, race_frozen_until = p.race_frozen_until,
         race_queue = coalesce(v_queue, '{}'), last_seen_at = now()
   where id = p.id;

  update qm_live_sessions
     set boss_hp = s.boss_hp,
         boss_crits = boss_crits + case when v_crit then 1 else 0 end,
         boss_healed = boss_healed + v_heal,
         boss_last_hit = case when v_ok and s.boss_hp = 0 then p.id else boss_last_hit end
   where id = s.id;

  if s.boss_hp <= 0 then
    perform qm_boss_end(s.id, 'win');
  else
    v_next := qm_race_serve(p.id);
    if p.race_frozen_until is not null and p.race_frozen_until > now() then
      update qm_live_players set race_served_at = p.race_frozen_until where id = p.id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'correct', v_ok, 'correctKey', q.correct_key,
    'damage', v_dmg, 'heal', v_heal, 'crit', v_crit, 'streakBonus', v_bonus,
    'points', v_pts, 'hp', s.boss_hp, 'maxHp', s.boss_max_hp, 'streak', p.streak,
    'wrongStreak', p.race_wrong, 'frozenUntil', p.race_frozen_until,
    'defeated', s.boss_hp <= 0, 'nextQuestionId', v_next);
end $$;

revoke all on function public.qm_boss_end(uuid, text)             from public, anon, authenticated;
revoke all on function public.qm_boss_start(uuid)                 from public, anon, authenticated;
revoke all on function public.qm_boss_state(uuid)                 from public, anon, authenticated;
revoke all on function public.qm_boss_submit(uuid, uuid, text)    from public, anon, authenticated;
grant execute on function public.qm_boss_end(uuid, text)          to service_role;
grant execute on function public.qm_boss_start(uuid)              to service_role;
grant execute on function public.qm_boss_state(uuid)              to service_role;
grant execute on function public.qm_boss_submit(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
