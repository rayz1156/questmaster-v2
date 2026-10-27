-- Ujian KZ-032: masa bonus kelajuan ditetapkan guru (migrasi 0067).
-- Dijalankan SELEPAS kandungan migrasi 0067 dalam transaksi yang sama,
-- kemudian ROLLBACK. Tiada data kekal.
begin;

do $$
declare
  v_quiz uuid; v_host uuid; v_sess uuid; v_s2 uuid; v_s3 uuid;
  v_a uuid; v_b uuid; v_q uuid; v_key text;
  r jsonb; st jsonb; v_n int; v_nf numeric;
begin
  -- Kuiz sebenar mana-mana yang ada sekurang-kurangnya 2 soalan.
  select q.id, q.owner_id into v_quiz, v_host from qm_live_quizzes q
   where (select count(*) from qm_live_questions x where x.quiz_id = q.id) >= 2
   order by q.created_at desc limit 1;
  if v_quiz is null then raise exception 'tiada kuiz untuk diuji'; end if;

  -- R1: sesi baharu tanpa race_bonus_sec mendapat lalai 30.
  insert into qm_live_sessions (quiz_id, host_id, code, status, current_index, game_mode)
    values (v_quiz, v_host, 'KZ32AD', 'lobby', -1, 'classic')
    returning id, race_bonus_sec into v_s3, v_n;
  if v_n <> 30 then raise exception 'R1 GAGAL: lalai %, jangka 30', v_n; end if;
  raise notice 'R1 sesi tanpa race_bonus_sec: lalai %', v_n;

  -- R2: kekangan CHECK menolak 3 dan 200.
  begin
    update public.qm_live_sessions set race_bonus_sec = 3 where id = v_s3;
    raise exception 'R2 GAGAL: bonus 3 diterima';
  exception when check_violation then
    raise notice 'R2 bonus 3 ditolak oleh kekangan: betul';
  end;
  begin
    update public.qm_live_sessions set race_bonus_sec = 200 where id = v_s3;
    raise exception 'R2 GAGAL: bonus 200 diterima';
  exception when check_violation then
    raise notice 'R2 bonus 200 ditolak oleh kekangan: betul';
  end;

  -- R3: sesi race bonus 60. Jawapan betul selepas 20 saat masih diterima
  -- dan mendapat nitro sekitar 0.67 (1 - 20000/60000), bukan 0 seperti
  -- formula lama yang guna separuh time_limit_sec soalan.
  insert into qm_live_sessions (quiz_id, host_id, code, status, current_index,
                               game_mode, race_minutes, race_bonus_sec)
    values (v_quiz, v_host, 'KZ32AB', 'lobby', -1, 'race', 2, 60)
    returning id, race_bonus_sec into v_sess, v_n;
  if v_n <> 60 then raise exception 'R3 GAGAL: race_bonus_sec %, jangka 60', v_n; end if;
  insert into qm_live_players (session_id, nickname, player_token)
    values (v_sess, 'Ujian A', repeat('a', 32)) returning id into v_a;
  perform qm_race_start(v_sess);
  st := qm_race_state(v_a);
  v_q := (st->>'questionId')::uuid;
  select correct_key into v_key from qm_live_questions where id = v_q;
  update qm_live_players set race_served_at = now() - interval '20 seconds' where id = v_a;
  r := qm_race_submit(v_a, v_q, lower(v_key));
  raise notice 'R3 jawapan lewat 20 s pada bonus 60: ok=% nitro=% jarak=%',
    r->>'ok', r->>'nitro', r->>'distance';
  if (r->>'ok')::boolean is not true then raise exception 'R3 GAGAL: jawapan ditolak'; end if;
  v_nf := (r->>'nitro')::numeric;
  if v_nf not between 0.66 and 0.68 then
    raise exception 'R3 GAGAL: nitro %, jangka sekitar 0.67', v_nf;
  end if;

  -- R4: sesi boss bonus 15. Selepas 20 saat bar sudah habis; jawapan
  -- masih diterima (ok=true, tiada had masa) tetapi tiada kritikal.
  insert into qm_live_sessions (quiz_id, host_id, code, status, current_index,
                               game_mode, race_minutes, boss_k, race_bonus_sec)
    values (v_quiz, v_host, 'KZ32AC', 'lobby', -1, 'boss', 2, 65, 15)
    returning id into v_s2;
  insert into qm_live_players (session_id, nickname, player_token)
    values (v_s2, 'Ujian B', repeat('b', 32)) returning id into v_b;
  perform qm_boss_start(v_s2);
  st := qm_boss_state(v_b);
  v_q := (st->>'questionId')::uuid;
  select correct_key into v_key from qm_live_questions where id = v_q;
  update qm_live_players set race_served_at = now() - interval '20 seconds' where id = v_b;
  r := qm_boss_submit(v_b, v_q, lower(v_key));
  raise notice 'R4 jawapan lewat 20 s pada bonus 15: ok=% crit=% hp=%',
    r->>'ok', r->>'crit', r->>'hp';
  if (r->>'ok')::boolean is not true then raise exception 'R4 GAGAL: jawapan ditolak'; end if;
  if (r->>'crit')::boolean is not false then raise exception 'R4 GAGAL: masih kritikal'; end if;

  raise notice 'KZ-032 SEMUA LULUS';
end $$;

rollback;