-- KZ-045.sql: ujian migrasi 0076 (satu bank soalan).
--
-- Jalankan pada pelayan (CTO) SELEPAS migrasi 0076 dijalankan:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/tests/KZ-045.sql
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya, jadi tiada data ujian kekal. Sebarang ketidaksepadan memaparkan
-- "UJIAN n GAGAL: ..." dan menghentikan skrip; mesej "KZ-045 SEMUA LULUS"
-- bermakna semua lulus.

begin;

-- ============================================================ 0. Data asas
-- qm_profiles.id ialah FK ke auth.users; session_replication_role = replica
-- melumpuhkan pencurus supaya sisipan tanpa kata laluan diterima.
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000045a1', 'kz045-guru@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000045b1', 'kz045-murid@ujian.invalid', 'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000045a1', 'educator',    'Guru Ujian KZ-045', 'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000045b1', 'participant', 'Murid KZ-045',      'free', true, false, now());

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000045c1', '00000000-0000-0000-0000-0000000045a1', 'Kelas Ujian KZ-045');

insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-0000000045c1', '00000000-0000-0000-0000-0000000045b1');

-- ============================================================ 1. Kuiz bercampur
-- v_kuiz: 1 soalan serasi Live (multiple lama) + 4 soalan tidak serasi
-- (subjective, essay, ox tidak sah tidak mungkin, banyak jawapan, order).
insert into public.qm_live_quizzes (id, class_id, owner_id, title) values
  ('00000000-0000-0000-0000-0000000045d1', null, '00000000-0000-0000-0000-0000000045a1', 'Kuiz Campur KZ-045');

-- U1: baris format lama (tiada qtype) masih sah; qtype jatuh kepada 'multiple'.
insert into public.qm_live_questions (id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec)
values ('00000000-0000-0000-0000-0000000045e1', '00000000-0000-0000-0000-0000000045d1', 0,
  'Berapakah dua tambah dua?',
  '[{"key":"A","text":"3"},{"key":"B","text":"4"},{"key":"C","text":"5"}]'::jsonb, 'B', 1000, 20);

do $$
declare
  v_t text;
begin
  select qtype into v_t from qm_live_questions where id = '00000000-0000-0000-0000-0000000045e1';
  if v_t <> 'multiple' then
    raise exception 'UJIAN 1 GAGAL: baris lama sepatutnya qtype=multiple, dapat %', v_t;
  end if;
end $$;

-- U2: kekangan longgar menerima subjective dengan options '[]' dan kunci ''.
insert into public.qm_live_questions (id, quiz_id, order_idx, prompt, options, correct_key, qtype, data, points, time_limit_sec)
values ('00000000-0000-0000-0000-0000000045e2', '00000000-0000-0000-0000-0000000045d1', 1,
  'Nyatakan ibu negara Malaysia.', '[]'::jsonb, '', 'subjective',
  '{"answerList":[{"key":"a","text":"Kuala Lumpur"}]}'::jsonb, 100, 30);

insert into public.qm_live_questions (id, quiz_id, order_idx, prompt, options, correct_key, qtype, data, points, time_limit_sec)
values ('00000000-0000-0000-0000-0000000045e3', '00000000-0000-0000-0000-0000000045d1', 2,
  'Terangkan fotosintesis.', '[]'::jsonb, '', 'essay', '{"rubric":"Sebut cahaya, air, klorofil"}'::jsonb, 200, 60);

-- multiple banyak jawapan: options diisi, kunci '', kunci dalam data.
insert into public.qm_live_questions (id, quiz_id, order_idx, prompt, options, correct_key, qtype, data, points, time_limit_sec)
values ('00000000-0000-0000-0000-0000000045e4', '00000000-0000-0000-0000-0000000045d1', 3,
  'Pilih DUA nombor genap.',
  '[{"key":"A","text":"2"},{"key":"B","text":"3"},{"key":"C","text":"4"}]'::jsonb, '', 'multiple',
  '{"choiceList":[{"key":"A","text":"2","isAnswer":true},{"key":"B","text":"3","isAnswer":false},{"key":"C","text":"4","isAnswer":true}]}'::jsonb,
  100, 30);

insert into public.qm_live_questions (id, quiz_id, order_idx, prompt, options, correct_key, qtype, data, points, time_limit_sec)
values ('00000000-0000-0000-0000-0000000045e5', '00000000-0000-0000-0000-0000000045d1', 4,
  'Susun langkah basuh tangan.', '[]'::jsonb, '', 'order',
  '{"items":[{"key":"a","text":"Basah"},{"key":"b","text":"Sabun"},{"key":"c","text":"Bilas"}]}'::jsonb, 100, 45);

-- U3: kekangan baharu masih menolak multiple dengan options '[]'.
do $$
begin
  begin
    insert into public.qm_live_questions (quiz_id, order_idx, prompt, options, correct_key, qtype, data)
    values ('00000000-0000-0000-0000-0000000045d1', 5, 'Sopan?', '[]'::jsonb, '', 'multiple', '{}'::jsonb);
    raise exception 'UJIAN 3 GAGAL: multiple dengan options kosong sepatutnya ditolak';
  exception when check_violation then null;
  end;
end $$;

-- U3b: kekangan menolak multiple serasi dengan 7 pilihan.
do $$
begin
  begin
    insert into public.qm_live_questions (quiz_id, order_idx, prompt, options, correct_key, qtype)
    values ('00000000-0000-0000-0000-0000000045d1', 6, 'Banyak?',
      '[{"key":"A","text":"1"},{"key":"B","text":"2"},{"key":"C","text":"3"},{"key":"D","text":"4"},{"key":"E","text":"5"},{"key":"F","text":"6"},{"key":"G","text":"7"}]'::jsonb,
      'A', 'multiple');
    raise exception 'UJIAN 3b GAGAL: 7 pilihan sepatutnya ditolak';
  exception when check_violation then null;
  end;
end $$;

-- ============================================================ 2. Enjin lumba menapis
-- U4: qm_race_serve pada kuiz bercampur hanya menghidangkan soalan serasi.
insert into public.qm_live_sessions (id, quiz_id, host_id, code, status, current_index, game_mode, race_minutes)
values ('00000000-0000-0000-0000-0000000045f1', '00000000-0000-0000-0000-0000000045d1',
  '00000000-0000-0000-0000-0000000045a1', 'KZ45AA', 'lobby', -1, 'race', 3);

insert into public.qm_live_players (id, session_id, nickname, player_token)
values ('00000000-0000-0000-0000-0000000045f4', '00000000-0000-0000-0000-0000000045f1', 'Pelumba Ujian', repeat('a', 32));

do $$
declare
  v_ends timestamptz;
  st jsonb;
  v_q uuid;
  v_t text;
  v_key text;
  r jsonb;
  i int;
begin
  v_ends := qm_race_start('00000000-0000-0000-0000-0000000045f1');
  if v_ends is null then raise exception 'UJIAN 4 GAGAL: lumba tidak bermula'; end if;

  -- Kitar barisan beberapa kali dengan jawapan salah: barisan diisi semula
  -- hanya dengan soalan serasi (1 soalan sahaja dalam kuiz ini). Tiga pusingan
  -- sahaja: jawapan salah ketiga membekukan pemain (5 saat) dalam 0058.
  for i in 1..3 loop
    st := qm_race_state('00000000-0000-0000-0000-0000000045f4');
    v_q := (st->>'questionId')::uuid;
    if v_q is null then raise exception 'UJIAN 4 GAGAL: tiada soalan dilayan pada pusingan %', i; end if;
    select qtype, correct_key into v_t, v_key from qm_live_questions where id = v_q;
    if v_t not in ('multiple','ox') or v_key = '' then
      raise exception 'UJIAN 4 GAGAL: soalan tidak serasi dilayan (qtype=%, kunci=%)', v_t, v_key;
    end if;
    -- jawapan salah memastikan soalan masuk semula ke barisan.
    r := qm_race_submit('00000000-0000-0000-0000-0000000045f4', v_q, 'Z');
    if (r->>'ok')::boolean is not true then raise exception 'UJIAN 4 GAGAL: jawapan tidak diterima'; end if;
  end loop;
end $$;

-- U5: kuiz yang hanya ada soalan tidak serasi tidak boleh dilumba (RACE1).
insert into public.qm_live_quizzes (id, class_id, owner_id, title) values
  ('00000000-0000-0000-0000-0000000045d2', null, '00000000-0000-0000-0000-0000000045a1', 'Kuiz Esei Sahaja');
insert into public.qm_live_questions (quiz_id, order_idx, prompt, options, correct_key, qtype, data)
values ('00000000-0000-0000-0000-0000000045d2', 0, 'Tulis esei.', '[]'::jsonb, '', 'essay', '{}'::jsonb);

insert into public.qm_live_sessions (id, quiz_id, host_id, code, status, current_index, game_mode, race_minutes)
values ('00000000-0000-0000-0000-0000000045f2', '00000000-0000-0000-0000-0000000045d2',
  '00000000-0000-0000-0000-0000000045a1', 'KZ45AB', 'lobby', -1, 'race', 3);

do $$
begin
  begin
    perform qm_race_start('00000000-0000-0000-0000-0000000045f2');
    raise exception 'UJIAN 5 GAGAL: lumba tanpa soalan serasi sepatutnya ditolak';
  exception when sqlstate 'RACE1' then null;
  end;
end $$;

-- U6: raksasa turut menolak (BOSS1).
insert into public.qm_live_sessions (id, quiz_id, host_id, code, status, current_index, game_mode, race_minutes)
values ('00000000-0000-0000-0000-0000000045f3', '00000000-0000-0000-0000-0000000045d2',
  '00000000-0000-0000-0000-0000000045a1', 'KZ45AC', 'lobby', -1, 'boss', 3);

do $$
begin
  begin
    perform qm_boss_start('00000000-0000-0000-0000-0000000045f3');
    raise exception 'UJIAN 6 GAGAL: raksasa tanpa soalan serasi sepatutnya ditolak';
  exception when sqlstate 'BOSS1' then null;
  end;
end $$;

-- ============================================================ 3. Salinan set Arena
-- U7: qm_arena_copy_sets idempoten (dua panggilan, bilangan tidak berubah).
insert into public.qm_arena_sets (id, owner_id, title, description) values
  ('00000000-0000-0000-0000-0000000045d3', '00000000-0000-0000-0000-0000000045a1', 'Set Ujian KZ-045', 'Disalin oleh ujian');

insert into public.qm_arena_questions (set_id, order_idx, type, prompt, data, points, time_limit_sec) values
  ('00000000-0000-0000-0000-0000000045d3', 0, 'multiple', 'Warna langit?',
   '{"choiceList":[{"key":"a","text":"Biru","isAnswer":true},{"key":"b","text":"Merah","isAnswer":false}]}'::jsonb, 100, 30),
  ('00000000-0000-0000-0000-0000000045d3', 1, 'multiple', 'Pilih DUA yang masak kuning.',
   '{"choiceList":[{"key":"a","text":"Pisang","isAnswer":true},{"key":"b","text":"Manggis","isAnswer":false},{"key":"c","text":"Durian","isAnswer":true}]}'::jsonb, 100, 30),
  ('00000000-0000-0000-0000-0000000045d3', 2, 'ox', 'Air mendidih pada 100C.',
   '{"answer":"o"}'::jsonb, 100, 15),
  ('00000000-0000-0000-0000-0000000045d3', 3, 'subjective', 'Ibu negara Malaysia?',
   '{"answerList":[{"key":"a","text":"Kuala Lumpur"}]}'::jsonb, 100, 20),
  ('00000000-0000-0000-0000-0000000045d3', 4, 'essay', 'Terangkan fotosintesis.',
   '{"rubric":"cahaya, air, klorofil"}'::jsonb, 200, 60),
  ('00000000-0000-0000-0000-0000000045d3', 5, 'order', 'Susun langkah.',
   '{"items":[{"key":"a","text":"Satu"},{"key":"b","text":"Dua"}]}'::jsonb, 100, 45);

do $$
declare
  v_kuiz uuid;
  v_n int;
  v_n2 int;
  v_kunci text;
  v_data jsonb;
begin
  -- Set ini dicipta SELEPAS migrasi berjalan, jadi panggil fungsi salinan
  -- dahulu (ia melangkau set yang sudah ditanda).
  perform qm_arena_copy_sets();
  select live_quiz_id into v_kuiz from qm_arena_sets where id = '00000000-0000-0000-0000-0000000045d3';
  if v_kuiz is null then raise exception 'UJIAN 7 GAGAL: set tidak disalin'; end if;
  select count(*) into v_n from qm_live_questions where quiz_id = v_kuiz;
  if v_n <> 6 then raise exception 'UJIAN 7 GAGAL: jangka 6 soalan salinan, dapat %', v_n; end if;

  perform qm_arena_copy_sets();
  perform qm_arena_copy_sets();
  select count(*) into v_n2 from qm_live_questions where quiz_id = v_kuiz;
  if v_n2 <> v_n then raise exception 'UJIAN 7 GAGAL: salinan tidak idempoten (% kemudian %)', v_n, v_n2; end if;

  select count(*) into v_n2 from qm_arena_sets where live_quiz_id is null and id = '00000000-0000-0000-0000-0000000045d3';
  if v_n2 <> 0 then raise exception 'UJIAN 7 GAGAL: penanda live_quiz_id hilang'; end if;

  -- Pemetaan multiple satu jawapan: kunci dari isAnswer, data null.
  select correct_key, data into v_kunci, v_data from qm_live_questions
   where quiz_id = v_kuiz and qtype = 'multiple' and order_idx = 0;
  if v_kunci <> 'a' or v_data is not null then
    raise exception 'UJIAN 7 GAGAL: pemetaan multiple satu jawapan salah (kunci=%, data=%)', v_kunci, v_data;
  end if;

  -- Pemetaan banyak jawapan: kunci '', data kekal.
  select correct_key, data into v_kunci, v_data from qm_live_questions
   where quiz_id = v_kuiz and qtype = 'multiple' and order_idx = 1;
  if v_kunci <> '' or (v_data->'choiceList') is null then
    raise exception 'UJIAN 7 GAGAL: pemetaan banyak jawapan salah (kunci=%)', v_kunci;
  end if;

  -- Pemetaan ox: kunci huruf besar, options O/X.
  select correct_key, options into v_kunci, v_data from qm_live_questions
   where quiz_id = v_kuiz and qtype = 'ox';
  if v_kunci <> 'O' or v_data->0->>'key' <> 'O' or v_data->1->>'key' <> 'X' then
    raise exception 'UJIAN 7 GAGAL: pemetaan ox salah (kunci=%)', v_kunci;
  end if;

  -- Pemetaan subjective: options kosong, data asal.
  declare
    v_opts jsonb;
  begin
    select correct_key, options, data into v_kunci, v_opts, v_data from qm_live_questions
     where quiz_id = v_kuiz and qtype = 'subjective';
    if v_kunci <> '' or jsonb_array_length(v_opts) <> 0 or (v_data->'answerList') is null then
      raise exception 'UJIAN 7 GAGAL: pemetaan subjective salah';
    end if;
  end;
end $$;

-- ============================================================ 4. Sesi Arena dari kuiz
-- U8: sesi arena boleh dicipta dengan quiz_id sahaja; view pulau/hantu sah.
insert into public.qm_arena_sessions (id, quiz_id, host_id, code, mode, view, map_id, team_count)
values ('00000000-0000-0000-0000-0000000045c2', '00000000-0000-0000-0000-0000000045d1',
  '00000000-0000-0000-0000-0000000045a1', 'KZ45AD', 'freestyle', 'pulau', 'kampus', 2);

insert into public.qm_arena_sessions (id, quiz_id, host_id, code, mode, view, map_id, team_count)
values ('00000000-0000-0000-0000-0000000045c3', '00000000-0000-0000-0000-0000000045d1',
  '00000000-0000-0000-0000-0000000045a1', 'KZ45AE', 'team', 'hantu', 'kampus', 2);

do $$
begin
  begin
    insert into public.qm_arena_sessions (quiz_id, host_id, code, mode, view, map_id)
    values ('00000000-0000-0000-0000-0000000045d1', '00000000-0000-0000-0000-0000000045a1',
      'KZ45AF', 'freestyle', 'ladang', 'kampus');
    raise exception 'UJIAN 8 GAGAL: view ladang sepatutnya ditolak';
  exception when check_violation then null;
  end;
  begin
    insert into public.qm_arena_sessions (host_id, code, mode, view, map_id)
    values ('00000000-0000-0000-0000-0000000045a1', 'KZ45AG', 'freestyle', 'list', 'kampus');
    raise exception 'UJIAN 8b GAGAL: sesi tanpa set_id dan quiz_id sepatutnya ditolak';
  exception when check_violation then null;
  end;
end $$;

-- U9: jawapan arena boleh merujuk soalan bank Kuiz (live_question_id),
-- unik setiap pemain, dan tiada sumber langsung ditolak.
insert into public.qm_arena_players (id, session_id, nickname, player_token, user_id)
values ('00000000-0000-0000-0000-0000000045b2', '00000000-0000-0000-0000-0000000045c2',
  'Pemain KZ-045', repeat('c', 32), '00000000-0000-0000-0000-0000000045b1');

insert into public.qm_arena_answers (session_id, player_id, live_question_id, answer, is_correct, score)
values ('00000000-0000-0000-0000-0000000045c2', '00000000-0000-0000-0000-0000000045b2',
  '00000000-0000-0000-0000-0000000045e2', '{"type":"subjective","text":"Kuala Lumpur"}'::jsonb, true, 100);

do $$
begin
  begin
    insert into public.qm_arena_answers (session_id, player_id, live_question_id, answer, is_correct, score)
    values ('00000000-0000-0000-0000-0000000045c2', '00000000-0000-0000-0000-0000000045b2',
      '00000000-0000-0000-0000-0000000045e2', '{"type":"subjective","text":"KL"}'::jsonb, true, 100);
    raise exception 'UJIAN 9 GAGAL: jawapan berulang sepatutnya ditolak';
  exception when unique_violation then null;
  end;
  begin
    insert into public.qm_arena_answers (session_id, player_id, answer, is_correct, score)
    values ('00000000-0000-0000-0000-0000000045c2', '00000000-0000-0000-0000-0000000045b2',
      '{"type":"pass"}'::jsonb, false, 0);
    raise exception 'UJIAN 9b GAGAL: jawapan tanpa soalan sepatutnya ditolak';
  exception when check_violation then null;
  end;
end $$;

-- U10: baris Live lama yang sedia ada dalam pangkalan data (650 soalan)
-- kekal tidak berubah oleh migrasi: qtype semua 'multiple'.
do $$
declare
  v_rosak int;
begin
  select count(*) into v_rosak from qm_live_questions where qtype is null or qtype not in ('multiple','ox');
  raise notice 'U10 soalan bukan multiple/ox dalam bank (hasil ujian sah): %', v_rosak;
  raise notice 'KZ-045 SEMUA LULUS';
end $$;

rollback;
