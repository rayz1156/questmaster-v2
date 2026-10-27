-- Migrasi 0067 (KZ-032): masa bonus kelajuan ditetapkan guru.
--
-- Masalah: bar Nitro (Speed Race) dan Critical (Boss Battle) habis dalam
-- SEPARUH time_limit_sec soalan, jadi pelajar menyangka kiraan masa
-- terlalu cepat. Sebenarnya tiada had masa jawapan dalam kedua mod itu.
-- Keputusan Boss 27 Okt 2026: guru memilih tempoh bonus kelajuan sesi
-- (15, 30, 45 atau 60 saat, lalai 30) semasa Start session; bar dan
-- pelayan mesti guna tempoh yang sama. Pelajar masih boleh menjawab
-- selepas bar habis; hanya bonus yang hilang.
--
-- Tiada BEGIN/COMMIT. Fungsi disalin tepat daripada definisi terkini
-- (qm_race_submit: migrasi 0058; qm_boss_submit: migrasi 0060) dan
-- hanya baris v_nf diubah: penyebut jadi tempoh bonus sesi bukan
-- separuh had masa soalan. Semak kebenaran, kunci baris, geran
-- (service_role sahaja) dan ambang kritikal v_nf > 0.6 kekal sama.

alter table public.qm_live_sessions
  add column if not exists race_bonus_sec integer not null default 30;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'qm_live_sessions_race_bonus_sec_chk'
       and conrelid = 'public.qm_live_sessions'::regclass
  ) then
    alter table public.qm_live_sessions
      add constraint qm_live_sessions_race_bonus_sec_chk
      check (race_bonus_sec between 5 and 120);
  end if;
end $$;

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
    -- Nitro (KZ-032): penuh jika jawab serta-merta, sifar selepas tempoh
    -- bonus guru (race_bonus_sec) habis; jawapan selepas itu tetap diterima.
    v_nf := greatest(0, 1 - v_ms::numeric / (greatest(s.race_bonus_sec, 1) * 1000));
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
    -- Kritikal (KZ-032): penuh jika dijawab serta-merta, sifar selepas tempoh
    -- bonus guru (race_bonus_sec) habis; ambang v_nf > 0.6 kekal.
    v_nf := greatest(0, 1 - v_ms::numeric / (greatest(s.race_bonus_sec, 1) * 1000));
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

revoke all on function public.qm_race_submit(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.qm_boss_submit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.qm_race_submit(uuid, uuid, text) to service_role;
grant execute on function public.qm_boss_submit(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';