-- Ujian KZ-013 (Lawan Raksasa). Dijalankan SELEPAS kandungan migrasi 0060
-- dalam transaksi yang sama, kemudian ROLLBACK. Tiada data kekal.
do $$
declare
  v_quiz uuid; v_host uuid; v_sess uuid; v_s2 uuid; v_a uuid; v_b uuid; v_c uuid;
  v_q uuid; v_key text; v_wrong text; r jsonb; st jsonb; i int; n int; v_hp int; v_hp2 int;
begin
  -- Kuiz sebenar mana-mana yang ada sekurang-kurangnya 2 soalan.
  select q.id, q.owner_id into v_quiz, v_host from qm_live_quizzes q
   where (select count(*) from qm_live_questions x where x.quiz_id = q.id) >= 2
   order by q.created_at desc limit 1;
  if v_quiz is null then raise exception 'tiada kuiz untuk diuji'; end if;

  insert into qm_live_sessions (quiz_id, host_id, code, status, current_index, game_mode, race_minutes, boss_k)
    values (v_quiz, v_host, 'BOSSZZ', 'lobby', -1, 'boss', 1, 65) returning id into v_sess;

  -- B1: tiada pemain -> BOSS3
  begin
    perform qm_boss_start(v_sess);
    raise exception 'B1 GAGAL: mula tanpa pemain diterima';
  exception when sqlstate 'BOSS3' then raise notice 'B1 mula tanpa pemain ditolak (BOSS3): betul';
  end;

  insert into qm_live_players (session_id, nickname, player_token) values (v_sess, 'Ujian A', repeat('a', 32)) returning id into v_a;
  insert into qm_live_players (session_id, nickname, player_token) values (v_sess, 'Ujian B', repeat('b', 32)) returning id into v_b;

  r := qm_boss_start(v_sess);
  raise notice 'B2 mula: maxHp=% (jangka 2 x 1 x 65 = 130)', r->>'maxHp';
  if (r->>'maxHp')::int <> 130 then raise exception 'B2 GAGAL nyawa'; end if;

  -- B3: mula kali kedua -> BOSS2
  begin
    perform qm_boss_start(v_sess);
    raise exception 'B3 GAGAL';
  exception when sqlstate 'BOSS2' then raise notice 'B3 mula semula ditolak (BOSS2): betul';
  end;

  -- B4: jawapan betul serta-merta = 10 + 6 x ~1 = 16
  st := qm_boss_state(v_a); v_q := (st->>'questionId')::uuid;
  select correct_key into v_key from qm_live_questions where id = v_q;
  r := qm_boss_submit(v_a, v_q, lower(v_key));
  raise notice 'B4 betul: damage=% crit=% hp=% points=%', r->>'damage', r->>'crit', r->>'hp', r->>'points';
  if (r->>'damage')::int not between 15 and 16 or (r->>'hp')::int <> 130 - (r->>'damage')::int then raise exception 'B4 GAGAL'; end if;
  v_hp := (r->>'hp')::int;

  -- B5: soalan lapuk
  r := qm_boss_submit(v_a, v_q, v_key);
  raise notice 'B5 soalan lapuk: ok=% reason=%', r->>'ok', r->>'reason';

  -- B6: B salah -> raksasa pulih 4
  st := qm_boss_state(v_b); v_q := (st->>'questionId')::uuid;
  select correct_key into v_key from qm_live_questions where id = v_q;
  v_wrong := case when v_key = 'A' then 'B' else 'A' end;
  r := qm_boss_submit(v_b, v_q, v_wrong);
  raise notice 'B6 salah: heal=% hp=% (jangka %)', r->>'heal', r->>'hp', v_hp + 4;
  if (r->>'hp')::int <> v_hp + 4 then raise exception 'B6 GAGAL'; end if;

  -- B7: dua lagi salah -> pengsan, jawapan ditolak semasa pengsan
  for i in 1..2 loop
    st := qm_boss_state(v_b); v_q := (st->>'questionId')::uuid;
    select correct_key into v_key from qm_live_questions where id = v_q;
    r := qm_boss_submit(v_b, v_q, case when v_key = 'A' then 'B' else 'A' end);
  end loop;
  st := qm_boss_state(v_b);
  r := qm_boss_submit(v_b, (st->>'questionId')::uuid, 'A');
  raise notice 'B7 pengsan: frozenUntil ada=% jawapan ditolak reason=%', st->>'frozenUntil' is not null, r->>'reason';

  -- B8: pulih tidak melebihi nyawa penuh
  update qm_live_sessions set boss_hp = boss_max_hp where id = v_sess;
  update qm_live_players set race_frozen_until = null, race_served_at = now() where id = v_b;
  st := qm_boss_state(v_b); v_q := (st->>'questionId')::uuid;
  select correct_key into v_key from qm_live_questions where id = v_q;
  r := qm_boss_submit(v_b, v_q, case when v_key = 'A' then 'B' else 'A' end);
  raise notice 'B8 pulih pada nyawa penuh: heal=% hp=%', r->>'heal', r->>'hp';
  if (r->>'heal')::int <> 0 or (r->>'hp')::int <> 130 then raise exception 'B8 GAGAL'; end if;

  -- B9: A menyerang sehingga raksasa tumbang
  update qm_live_sessions set boss_hp = 30 where id = v_sess;
  for i in 1..10 loop
    st := qm_boss_state(v_a);
    exit when st->>'status' = 'ended';
    v_q := (st->>'questionId')::uuid;
    select correct_key into v_key from qm_live_questions where id = v_q;
    r := qm_boss_submit(v_a, v_q, v_key);
  end loop;
  st := qm_boss_state(v_a);
  raise notice 'B9 tumbang: status=% result=% hp=% defeated=% lastHitByMe=%',
    st->>'status', st->>'result', st->>'hp', r->>'defeated', st->>'lastHitByMe';
  if st->>'result' <> 'win' or (st->>'hp')::int <> 0 or (st->>'lastHitByMe')::boolean is not true then raise exception 'B9 GAGAL'; end if;
  select sum(boss_effect) filter (where boss_effect > 0) into n from qm_live_answers where session_id = v_sess;
  select boss_damage into v_hp2 from qm_live_players where id = v_a;
  raise notice 'B10 jumlah boss_effect positif=% kerosakan A=% (pemain B tiada kerosakan)', n, v_hp2;

  -- B11: jawapan selepas tamat
  r := qm_boss_submit(v_a, v_q, v_key);
  raise notice 'B11 selepas tamat: reason=%', r->>'reason';

  -- B12: sesi kedua kalah masa, dan hentian guru
  insert into qm_live_sessions (quiz_id, host_id, code, status, current_index, game_mode, race_minutes, boss_k)
    values (v_quiz, v_host, 'BOSSZY', 'lobby', -1, 'boss', 2, 55) returning id into v_s2;
  insert into qm_live_players (session_id, nickname, player_token) values (v_s2, 'Ujian C', repeat('c', 32)) returning id into v_c;
  r := qm_boss_start(v_s2);
  raise notice 'B12 sesi 2 maxHp=% (jangka 1 x 2 x 55 = 110)', r->>'maxHp';
  update qm_live_sessions set race_ends_at = now() - interval '1 second' where id = v_s2;
  st := qm_boss_state(v_c);
  raise notice 'B13 masa tamat: status=% result=%', st->>'status', st->>'result';
  if st->>'result' <> 'lose' then raise exception 'B13 GAGAL'; end if;

  update qm_live_sessions set status = 'lobby', boss_result = null where id = v_s2;
  perform qm_boss_end(v_s2, 'stopped');
  select boss_result into v_wrong from qm_live_sessions where id = v_s2;
  raise notice 'B14 hentian guru: result=%', v_wrong;

  begin
    perform qm_boss_end(v_s2, 'menang');
    raise exception 'B15 GAGAL';
  exception when sqlstate 'BOSS5' then raise notice 'B15 keputusan tidak sah ditolak (BOSS5): betul';
  end;

  -- B16: fungsi boss menolak sesi race
  update qm_live_sessions set game_mode = 'race' where id = v_s2;
  begin
    perform qm_boss_submit(v_c, v_q, 'A');
    raise exception 'B16 GAGAL';
  exception when sqlstate 'BOSS4' then raise notice 'B16 sesi bukan boss ditolak (BOSS4): betul';
  end;

  -- B17: kekangan mod
  begin
    update qm_live_sessions set game_mode = 'battle' where id = v_s2;
    raise exception 'B17 GAGAL';
  exception when check_violation then raise notice 'B17 mod asing ditolak oleh kekangan: betul';
  end;

  raise notice 'KZ-013 SEMUA LULUS';
end $$;
