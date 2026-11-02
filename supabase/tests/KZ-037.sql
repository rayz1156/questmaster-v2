-- Ujian KZ-037: tag Kuiz Langsung kepada Outcome (migrasi 0072_kuiz_langsung_outcome.sql).
-- Dijalankan SELEPAS migrasi 0072 dipasang, dalam SATU transaksi yang
-- digulung sepenuhnya. Tiada data kekal.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/KZ-037.sql
-- Output akhir "KZ-037: SEMUA UJIAN LULUS" bermakna lulus.
--
-- Ikut pengajaran v2: UUID heksadesimal sahaja; lajur NOT NULL
-- qm_profiles dihormati (role, plan, approved, suspended); raise
-- notice hanya dalam blok do.
--
-- Data (semua id diawali 0000000370xx supaya tidak bertembung dengan
-- data sebenar dan mudah dikesan selepas rollback):
--   Kelas A (0370c1, guru 0370e1) lawan kelas B (0370c2, guru 0370e2).
--   Ahli kelas A: P1 (0370a1), P2 (0370a2), P3 (0370a3).
--   "Bukan ahli" (0370b1) hanya ahli kelas B.
--   Outcome O1 (0370d1) dan O2 (0370d2) kelas A; OB (0370d3) kelas B.
--   Kuiz bertag Q1 (0370f1, kelas A); kuiz tidak bertag Q2 (0370f2,
--   kelas A); kuiz tanpa kelas Q3 (0370f3).
--   Hunt 0370f4 + cabaran 0370f5 ditag O1 dengan satu hantaran P2
--   approved (ujian gabungan sumber).
--   Sesi 037011 dan 037012 pada Q1 (ulangan dikira); sesi 037013 pada Q2.

begin;

-- Pengguna ujian. Pencemas qm_handle_new_user dimatikan seketika
-- supaya qm_profiles dikawal sepenuhnya di bawah (corak KZ-035).
set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000370e1', 'kz037-guru-a@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000370e2', 'kz037-guru-b@ujian.invalid',     'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000370a1', 'kz037-p1@ujian.invalid',         'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000370a2', 'kz037-p2@ujian.invalid',         'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000370a3', 'kz037-p3@ujian.invalid',         'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000370b1', 'kz037-bukan-ahli@ujian.invalid',  'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000370e1', 'educator',    'Guru A KZ-037', 'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000370e2', 'educator',    'Guru B KZ-037', 'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000370a1', 'participant', 'Pelajar 1',     'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000370a2', 'participant', 'Pelajar 2',     'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000370a3', 'participant', 'Pelajar 3',     'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000370b1', 'participant', 'Bukan Ahli',    'free', true, false, now())
on conflict (id) do nothing;

-- Ujian 1: dua kelas.
insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000370c1', '00000000-0000-0000-0000-0000000370e1', 'Kelas A KZ-037'),
  ('00000000-0000-0000-0000-0000000370c2', '00000000-0000-0000-0000-0000000370e2', 'Kelas B KZ-037');

-- Ahli: P1, P2, P3 dalam kelas A; "bukan ahli" hanya dalam kelas B.
insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-0000000370c1', '00000000-0000-0000-0000-0000000370a1'),
  ('00000000-0000-0000-0000-0000000370c1', '00000000-0000-0000-0000-0000000370a2'),
  ('00000000-0000-0000-0000-0000000370c1', '00000000-0000-0000-0000-0000000370a3'),
  ('00000000-0000-0000-0000-0000000370c2', '00000000-0000-0000-0000-0000000370b1');

-- Outcome kelas A (O1, O2) dan kelas B (OB, untuk ujian silang).
insert into public.qm_learning_outcomes (id, class_id, code, label) values
  ('00000000-0000-0000-0000-0000000370d1', '00000000-0000-0000-0000-0000000370c1', 'K1', 'Boleh menjawab soalan mudah'),
  ('00000000-0000-0000-0000-0000000370d2', '00000000-0000-0000-0000-0000000370c1', 'K2', 'Boleh mengira markah'),
  ('00000000-0000-0000-0000-0000000370d3', '00000000-0000-0000-0000-0000000370c2', 'B1', 'Outcome kelas B');

-- Sumber pertama (cabaran) untuk ujian 7: O1 juga ditag pada satu
-- cabaran kelas A, dengan satu hantaran P2 yang sudah approved.
insert into public.qm_hunts (id, owner_id, title, class_id) values
  ('00000000-0000-0000-0000-0000000370f4', '00000000-0000-0000-0000-0000000370e1', 'Hunt KZ-037', '00000000-0000-0000-0000-0000000370c1');
insert into public.qm_challenges (id, hunt_id, title) values
  ('00000000-0000-0000-0000-0000000370f5', '00000000-0000-0000-0000-0000000370f4', 'Cabaran KZ-037');
insert into public.qm_challenge_outcomes (challenge_id, outcome_id) values
  ('00000000-0000-0000-0000-0000000370f5', '00000000-0000-0000-0000-0000000370d1');
insert into public.qm_submissions (id, challenge_id, user_id, status) values
  ('00000000-0000-0000-0000-0000000370f6', '00000000-0000-0000-0000-0000000370f5', '00000000-0000-0000-0000-0000000370a2', 'approved');

-- Kuiz langsung: Q1 kelas A (akan ditag), Q2 kelas A (tidak ditag),
-- Q3 tanpa kelas (ujian pencemas 8b).
insert into public.qm_live_quizzes (id, class_id, owner_id, title) values
  ('00000000-0000-0000-0000-0000000370f1', '00000000-0000-0000-0000-0000000370c1', '00000000-0000-0000-0000-0000000370e1', 'Kuiz bertag KZ-037'),
  ('00000000-0000-0000-0000-0000000370f2', '00000000-0000-0000-0000-0000000370c1', '00000000-0000-0000-0000-0000000370e1', 'Kuiz tidak bertag KZ-037'),
  ('00000000-0000-0000-0000-0000000370f3', null, '00000000-0000-0000-0000-0000000370e1', 'Kuiz tanpa kelas KZ-037');

-- Soalan: lima pada kuiz bertag, satu pada kuiz tidak bertag.
insert into public.qm_live_questions (id, quiz_id, order_idx, prompt, options, correct_key) values
  ('00000000-0000-0000-0000-000000037031', '00000000-0000-0000-0000-0000000370f1', 1, 'Soalan 1?', '[{"key":"A","text":"Betul"},{"key":"B","text":"Salah"}]'::jsonb, 'A'),
  ('00000000-0000-0000-0000-000000037032', '00000000-0000-0000-0000-0000000370f1', 2, 'Soalan 2?', '[{"key":"A","text":"Betul"},{"key":"B","text":"Salah"}]'::jsonb, 'A'),
  ('00000000-0000-0000-0000-000000037033', '00000000-0000-0000-0000-0000000370f1', 3, 'Soalan 3?', '[{"key":"A","text":"Betul"},{"key":"B","text":"Salah"}]'::jsonb, 'A'),
  ('00000000-0000-0000-0000-000000037034', '00000000-0000-0000-0000-0000000370f1', 4, 'Soalan 4?', '[{"key":"A","text":"Betul"},{"key":"B","text":"Salah"}]'::jsonb, 'A'),
  ('00000000-0000-0000-0000-000000037035', '00000000-0000-0000-0000-0000000370f1', 5, 'Soalan 5?', '[{"key":"A","text":"Betul"},{"key":"B","text":"Salah"}]'::jsonb, 'A'),
  ('00000000-0000-0000-0000-000000037036', '00000000-0000-0000-0000-0000000370f2', 1, 'Soalan kuiz lain?', '[{"key":"A","text":"Betul"},{"key":"B","text":"Salah"}]'::jsonb, 'A');

-- Sesi: dua sesi pada kuiz bertag (ulangan dikira), satu pada kuiz
-- tidak bertag. Status 'ended': semua sesi tetap dikira.
insert into public.qm_live_sessions (id, quiz_id, host_id, code, status) values
  ('00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-0000000370f1', '00000000-0000-0000-0000-0000000370e1', 'AAA222', 'ended'),
  ('00000000-0000-0000-0000-000000037012', '00000000-0000-0000-0000-0000000370f1', '00000000-0000-0000-0000-0000000370e1', 'BBB223', 'ended'),
  ('00000000-0000-0000-0000-000000037013', '00000000-0000-0000-0000-0000000370f2', '00000000-0000-0000-0000-0000000370e1', 'CCC224', 'ended');

-- Pemain: P1 dalam dua sesi kuiz bertag; P2 dalam sesi 1; pemain
-- tetamu (user_id null) dan bukan ahli dalam sesi 1; P1 juga dalam
-- sesi kuiz tidak bertag.
insert into public.qm_live_players (id, session_id, nickname, user_id, player_token) values
  ('00000000-0000-0000-0000-000000037021', '00000000-0000-0000-0000-000000037011', 'P1',        '00000000-0000-0000-0000-0000000370a1', 'abcdefabcdefabcdefabcdefabcdef12'),
  ('00000000-0000-0000-0000-000000037022', '00000000-0000-0000-0000-000000037012', 'P1',        '00000000-0000-0000-0000-0000000370a1', 'abcdefabcdefabcdefabcdefabcdef12'),
  ('00000000-0000-0000-0000-000000037023', '00000000-0000-0000-0000-000000037011', 'P2',        '00000000-0000-0000-0000-0000000370a2', 'abcdefabcdefabcdefabcdefabcdef12'),
  ('00000000-0000-0000-0000-000000037024', '00000000-0000-0000-0000-000000037011', 'Tetamu',     null,                                    'abcdefabcdefabcdefabcdefabcdef12'),
  ('00000000-0000-0000-0000-000000037025', '00000000-0000-0000-0000-000000037011', 'BukanAhli', '00000000-0000-0000-0000-0000000370b1', 'abcdefabcdefabcdefabcdefabcdef12'),
  ('00000000-0000-0000-0000-000000037026', '00000000-0000-0000-0000-000000037013', 'P1',        '00000000-0000-0000-0000-0000000370a1', 'abcdefabcdefabcdefabcdefabcdef12');

-- Tag sah: kuiz kelas A ditag O1 dan O2 (INSERT melalui pencemas,
-- seperti service role laluan API).
insert into public.qm_live_quiz_outcomes (quiz_id, outcome_id) values
  ('00000000-0000-0000-0000-0000000370f1', '00000000-0000-0000-0000-0000000370d1'),
  ('00000000-0000-0000-0000-0000000370f1', '00000000-0000-0000-0000-0000000370d2');

-- Jawapan (ujian 2, 3, 5, 6):
--   P1: sesi 1 betul, betul, salah; sesi 2 betul, betul  (4 betul + 1 salah)
--   P2: sesi 1 betul, salah, salah, salah                (1 betul + 3 salah)
--   Tetamu: betul (tidak dikira).  Bukan ahli: betul (tidak dikira).
--   P1 pada kuiz tidak bertag: betul (tidak dikira).
insert into public.qm_live_answers (id, session_id, player_id, question_id, choice_key, is_correct, ms_taken, points_awarded) values
  ('00000000-0000-0000-0000-000000037041', '00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037021', '00000000-0000-0000-0000-000000037031', 'A', true,  1000, 1000),
  ('00000000-0000-0000-0000-000000037042', '00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037021', '00000000-0000-0000-0000-000000037032', 'A', true,  1200, 1000),
  ('00000000-0000-0000-0000-000000037043', '00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037021', '00000000-0000-0000-0000-000000037033', 'B', false, 1500, 0),
  ('00000000-0000-0000-0000-000000037044', '00000000-0000-0000-0000-000000037012', '00000000-0000-0000-0000-000000037022', '00000000-0000-0000-0000-000000037034', 'A', true,  900,  1000),
  ('00000000-0000-0000-0000-000000037045', '00000000-0000-0000-0000-000000037012', '00000000-0000-0000-0000-000000037022', '00000000-0000-0000-0000-000000037035', 'A', true,  800,  1000),
  ('00000000-0000-0000-0000-000000037046', '00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037023', '00000000-0000-0000-0000-000000037031', 'A', true,  2000, 1000),
  ('00000000-0000-0000-0000-000000037047', '00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037023', '00000000-0000-0000-0000-000000037032', 'B', false, 3000, 0),
  ('00000000-0000-0000-0000-000000037048', '00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037023', '00000000-0000-0000-0000-000000037033', 'B', false, 3000, 0),
  ('00000000-0000-0000-0000-000000037049', '00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037023', '00000000-0000-0000-0000-000000037034', 'B', false, 3000, 0),
  ('00000000-0000-0000-0000-00000003704a', '00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037024', '00000000-0000-0000-0000-000000037031', 'A', true,  1000, 1000),
  ('00000000-0000-0000-0000-00000003704b', '00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037025', '00000000-0000-0000-0000-000000037031', 'A', true,  1000, 1000),
  ('00000000-0000-0000-0000-00000003704c', '00000000-0000-0000-0000-000000037013', '00000000-0000-0000-0000-000000037026', '00000000-0000-0000-0000-000000037036', 'A', true,  1000, 1000);

-- Ujian 1: kuiz kelas A ditag tepat O1 dan O2; satu kuiz kelas A
-- lain tidak ditag sama sekali.
do $u$
declare
  v_bil int;
begin
  select count(*) into v_bil from public.qm_live_quiz_outcomes
    where quiz_id = '00000000-0000-0000-0000-0000000370f1';
  if v_bil <> 2 then
    raise exception 'UJIAN 1 GAGAL: kuiz bertag ada % tag (jangka 2)', v_bil;
  end if;
  select count(*) into v_bil from public.qm_live_quiz_outcomes
    where quiz_id = '00000000-0000-0000-0000-0000000370f2';
  if v_bil <> 0 then
    raise exception 'UJIAN 1 GAGAL: kuiz tidak bertag ada % tag (jangka 0)', v_bil;
  end if;
  raise notice 'Ujian 1: dua kelas; kuiz kelas A ditag O1+O2; satu kuiz kelas A tidak bertag (betul)';
end $u$;

-- Ujian 2 hingga 7 dan 9: qm_mastery_summary sebagai guru kelas A.
-- Jangkaan (formula bucket tidak berubah):
--   P1 O1: approved 4, rejected 1, scored 5, total 6 (5 jawapan +
--          1 cabaran ditag tanpa hantaran), mastery 80, mastered.
--   P1 O2: approved 4, rejected 1, scored 5, total 5, mastery 80, mastered.
--   P2 O1: approved 2 (1 hantaran + 1 jawapan betul), rejected 3,
--          scored 5, total 5 (1 cabaran + 4 jawapan), mastery 40,
--          developing.
--   P2 O2: approved 1, rejected 3, scored 4, total 4, mastery 25, struggling.
--   P3 O1 dan O2: scored 0, mastery null, not_attempted; baris P3 O2
--          mesti wujud walaupun O2 tidak ditag pada satu pun cabaran.
--   Tetamu dan bukan ahli tidak menambah pelajar (students tetap 3).
--   Jawapan P1 pada kuiz tidak bertag tidak menambah approved P1.
--   totals.tagged_live_quizzes = 1; O1: challenges 1 + quizzes 1;
--   O2: challenges 0 + quizzes 1.
do $u$
declare
  v_kelas_a constant uuid := '00000000-0000-0000-0000-0000000370c1';
  v_guru    constant uuid := '00000000-0000-0000-0000-0000000370e1';
  v_p1      constant uuid := '00000000-0000-0000-0000-0000000370a1';
  v_p2      constant uuid := '00000000-0000-0000-0000-0000000370a2';
  v_p3      constant uuid := '00000000-0000-0000-0000-0000000370a3';
  v_o1      constant uuid := '00000000-0000-0000-0000-0000000370d1';
  v_o2      constant uuid := '00000000-0000-0000-0000-0000000370d2';
  v_h       jsonb;
  v_t       jsonb;
  v_baris   jsonb;
  v_pel     jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_guru, 'role', 'authenticated')::text, true);

  select public.qm_mastery_summary(v_kelas_a) into v_h;

  -- Ujian 9a: kunci atas output kekal.
  if not (v_h ? 'class_id' and v_h ? 'totals' and v_h ? 'outcomes'
        and v_h ? 'students' and v_h ? 'generated_at') then
    raise exception 'UJIAN 9 GAGAL: medan atas output hilang';
  end if;

  v_t := v_h->'totals';
  if not (v_t ? 'outcomes' and v_t ? 'tagged_challenges' and v_t ? 'students') then
    raise exception 'UJIAN 9 GAGAL: medan lama totals hilang';
  end if;
  if not (v_t ? 'tagged_live_quizzes') then
    raise exception 'UJIAN 9 GAGAL: totals tiada tagged_live_quizzes';
  end if;
  if (v_t->>'outcomes')::int <> 2 then
    raise exception 'UJIAN 9 GAGAL: totals.outcomes % (jangka 2)', v_t->>'outcomes';
  end if;
  if (v_t->>'tagged_challenges')::int <> 1 then
    raise exception 'UJIAN 9 GAGAL: totals.tagged_challenges % (jangka 1)', v_t->>'tagged_challenges';
  end if;
  if (v_t->>'tagged_live_quizzes')::int <> 1 then
    raise exception 'UJIAN 9 GAGAL: totals.tagged_live_quizzes % (jangka 1)', v_t->>'tagged_live_quizzes';
  end if;
  if (v_t->>'students')::int <> 3 then
    raise exception 'UJIAN 9 GAGAL: totals.students % (jangka 3)', v_t->>'students';
  end if;

  -- Ujian 9b: baris outcomes lengkap medan lama + tagged_live_quizzes.
  v_baris := null;
  select x into v_baris from jsonb_array_elements(v_h->'outcomes') x
    where x->>'outcome_id' = v_o1::text;
  if v_baris is null then
    raise exception 'UJIAN 9 GAGAL: O1 tiada dalam outcomes';
  end if;
  if not (v_baris ? 'outcome_id' and v_baris ? 'code' and v_baris ? 'label'
        and v_baris ? 'description' and v_baris ? 'tagged_challenges'
        and v_baris ? 'tagged_live_quizzes' and v_baris ? 'mastered_students'
        and v_baris ? 'struggling_students' and v_baris ? 'developing_students'
        and v_baris ? 'not_attempted_students' and v_baris ? 'avg_mastery_pct') then
    raise exception 'UJIAN 9 GAGAL: medan baris outcomes O1 tidak lengkap';
  end if;
  if (v_baris->>'tagged_challenges')::int <> 1
     or (v_baris->>'tagged_live_quizzes')::int <> 1 then
    raise exception 'UJIAN 9 GAGAL: O1 challenges/quizzes %/% (jangka 1/1)',
      v_baris->>'tagged_challenges', v_baris->>'tagged_live_quizzes';
  end if;
  v_baris := null;
  select x into v_baris from jsonb_array_elements(v_h->'outcomes') x
    where x->>'outcome_id' = v_o2::text;
  if v_baris is null then
    raise exception 'UJIAN 9 GAGAL: O2 tiada dalam outcomes';
  end if;
  if (v_baris->>'tagged_challenges')::int <> 0
     or (v_baris->>'tagged_live_quizzes')::int <> 1 then
    raise exception 'UJIAN 9 GAGAL: O2 challenges/quizzes %/% (jangka 0/1)',
      v_baris->>'tagged_challenges', v_baris->>'tagged_live_quizzes';
  end if;

  -- Ujian 9c: baris students dan outcomes pelajar lengkap medan lama.
  v_pel := null;
  select x into v_pel from jsonb_array_elements(v_h->'students') x
    where x->>'user_id' = v_p1::text;
  if v_pel is null then
    raise exception 'UJIAN 9 GAGAL: P1 tiada dalam students';
  end if;
  if not (v_pel ? 'user_id' and v_pel ? 'name' and v_pel ? 'outcomes'
        and v_pel ? 'mastered_count' and v_pel ? 'struggling_count') then
    raise exception 'UJIAN 9 GAGAL: medan baris students tidak lengkap';
  end if;
  v_baris := null;
  select y into v_baris from jsonb_array_elements(v_pel->'outcomes') y
    where y->>'outcome_id' = v_o1::text;
  if v_baris is null then
    raise exception 'UJIAN 9 GAGAL: P1 O1 tiada dalam outcomes pelajar';
  end if;
  if not (v_baris ? 'outcome_id' and v_baris ? 'approved' and v_baris ? 'rejected'
        and v_baris ? 'scored' and v_baris ? 'total' and v_baris ? 'mastery_pct'
        and v_baris ? 'bucket') then
    raise exception 'UJIAN 9 GAGAL: medan outcomes pelajar tidak lengkap';
  end if;

  -- Ujian 2: P1 4 betul + 1 salah dalam dua sesi: 80, mastered, scored 5.
  -- v_baris masih baris P1 O1 dari 9c di atas.
  if (v_baris->>'approved')::int <> 4 then
    raise exception 'UJIAN 2 GAGAL: P1 O1 approved % (jangka 4)', v_baris->>'approved';
  end if;
  if (v_baris->>'rejected')::int <> 1 then
    raise exception 'UJIAN 2 GAGAL: P1 O1 rejected % (jangka 1)', v_baris->>'rejected';
  end if;
  if (v_baris->>'scored')::int <> 5 then
    raise exception 'UJIAN 2 GAGAL: P1 O1 scored % (jangka 5)', v_baris->>'scored';
  end if;
  -- total termasuk cabaran ditag O1 yang belum P1 hantar: 5 jawapan + 1.
  if (v_baris->>'total')::int <> 6 then
    raise exception 'UJIAN 2 GAGAL: P1 O1 total % (jangka 6)', v_baris->>'total';
  end if;
  if (v_baris->>'mastery_pct')::int <> 80 then
    raise exception 'UJIAN 2 GAGAL: P1 O1 mastery % (jangka 80)', v_baris->>'mastery_pct';
  end if;
  if v_baris->>'bucket' <> 'mastered' then
    raise exception 'UJIAN 2 GAGAL: P1 O1 bucket % (jangka mastered)', v_baris->>'bucket';
  end if;
  -- P1 O2: jawapan yang sama, tiada cabaran.
  v_baris := null;
  select y into v_baris from jsonb_array_elements(v_pel->'outcomes') y
    where y->>'outcome_id' = v_o2::text;
  if v_baris is null then
    raise exception 'UJIAN 2 GAGAL: P1 O2 tiada dalam outcomes pelajar';
  end if;
  if (v_baris->>'approved')::int <> 4 or (v_baris->>'rejected')::int <> 1
     or (v_baris->>'scored')::int <> 5 or (v_baris->>'total')::int <> 5
     or (v_baris->>'mastery_pct')::int <> 80 or v_baris->>'bucket' <> 'mastered' then
    raise exception 'UJIAN 2 GAGAL: P1 O2 tidak seperti jangkaan: %', v_baris;
  end if;

  -- Ujian 3 dan 7: P2, 1 betul + 3 salah = 25 pada O2; gabungan
  -- dengan hantaran cabaran approved pada O1: approved 2, scored 5.
  v_pel := null;
  select x into v_pel from jsonb_array_elements(v_h->'students') x
    where x->>'user_id' = v_p2::text;
  if v_pel is null then
    raise exception 'UJIAN 3 GAGAL: P2 tiada dalam students';
  end if;
  v_baris := null;
  select y into v_baris from jsonb_array_elements(v_pel->'outcomes') y
    where y->>'outcome_id' = v_o1::text;
  if v_baris is null then
    raise exception 'UJIAN 7 GAGAL: P2 O1 tiada dalam outcomes pelajar';
  end if;
  if (v_baris->>'approved')::int <> 2 then
    raise exception 'UJIAN 7 GAGAL: P2 O1 approved % (jangka 2)', v_baris->>'approved';
  end if;
  if (v_baris->>'rejected')::int <> 3 then
    raise exception 'UJIAN 7 GAGAL: P2 O1 rejected % (jangka 3)', v_baris->>'rejected';
  end if;
  if (v_baris->>'scored')::int <> 5 then
    raise exception 'UJIAN 7 GAGAL: P2 O1 scored % (jangka 5)', v_baris->>'scored';
  end if;
  if (v_baris->>'total')::int <> 5 then
    raise exception 'UJIAN 7 GAGAL: P2 O1 total % (jangka 5)', v_baris->>'total';
  end if;
  if (v_baris->>'mastery_pct')::int <> 40 or v_baris->>'bucket' <> 'developing' then
    raise exception 'UJIAN 7 GAGAL: P2 O1 mastery/bucket % % (jangka 40 developing)',
      v_baris->>'mastery_pct', v_baris->>'bucket';
  end if;
  v_baris := null;
  select y into v_baris from jsonb_array_elements(v_pel->'outcomes') y
    where y->>'outcome_id' = v_o2::text;
  if v_baris is null then
    raise exception 'UJIAN 3 GAGAL: P2 O2 tiada dalam outcomes pelajar';
  end if;
  if (v_baris->>'approved')::int <> 1 or (v_baris->>'rejected')::int <> 3
     or (v_baris->>'scored')::int <> 4 or (v_baris->>'total')::int <> 4 then
    raise exception 'UJIAN 3 GAGAL: P2 O2 kiraan tidak seperti jangkaan: %', v_baris;
  end if;
  if (v_baris->>'mastery_pct')::int <> 25 or v_baris->>'bucket' <> 'struggling' then
    raise exception 'UJIAN 3 GAGAL: P2 O2 mastery/bucket % % (jangka 25 struggling)',
      v_baris->>'mastery_pct', v_baris->>'bucket';
  end if;

  -- Ujian 4: P3 tiada jawapan: baris mesti wujud untuk O2 (hanya
  -- ditag kuiz, bukan cabaran) supaya not_attempted dikira.
  v_pel := null;
  select x into v_pel from jsonb_array_elements(v_h->'students') x
    where x->>'user_id' = v_p3::text;
  if v_pel is null then
    raise exception 'UJIAN 4 GAGAL: P3 tiada dalam students';
  end if;
  v_baris := null;
  select y into v_baris from jsonb_array_elements(v_pel->'outcomes') y
    where y->>'outcome_id' = v_o2::text;
  if v_baris is null then
    raise exception 'UJIAN 4 GAGAL: baris P3 O2 tidak wujud (grid outcome-ditag rosak)';
  end if;
  if (v_baris->>'scored')::int <> 0 then
    raise exception 'UJIAN 4 GAGAL: P3 O2 scored % (jangka 0)', v_baris->>'scored';
  end if;
  if jsonb_typeof(v_baris->'mastery_pct') <> 'null' then
    raise exception 'UJIAN 4 GAGAL: P3 O2 mastery_pct % (jangka null)', v_baris->'mastery_pct';
  end if;
  if v_baris->>'bucket' <> 'not_attempted' then
    raise exception 'UJIAN 4 GAGAL: P3 O2 bucket % (jangka not_attempted)', v_baris->>'bucket';
  end if;
  v_baris := null;
  select y into v_baris from jsonb_array_elements(v_pel->'outcomes') y
    where y->>'outcome_id' = v_o1::text;
  if v_baris is null then
    raise exception 'UJIAN 4 GAGAL: baris P3 O1 tidak wujud';
  end if;
  if (v_baris->>'scored')::int <> 0
     or v_baris->>'bucket' <> 'not_attempted' then
    raise exception 'UJIAN 4 GAGAL: P3 O1 sepatutnya not_attempted: %', v_baris;
  end if;

  -- Ujian 5: pemain tetamu (user_id null) dan bukan ahli menjawab
  -- kuiz bertag tetapi tidak menambah pelajar dan tidak mengubah
  -- kiraan P1 (approved kekal 4, bukan 5 atau 6).
  if jsonb_array_length(v_h->'students') <> 3 then
    raise exception 'UJIAN 5 GAGAL: bilangan pelajar % (jangka 3)',
      jsonb_array_length(v_h->'students');
  end if;

  -- Ujian 6: jawapan P1 pada kuiz tidak bertag tidak dikira
  -- (approved P1 kekal 4, bukan 5). Sudut disemak dalam ujian 2 di
  -- atas; di sini kita pastikan sekali lagi melalui purata kelas.
  v_baris := null;
  select x into v_baris from jsonb_array_elements(v_h->'outcomes') x
    where x->>'outcome_id' = v_o1::text;
  if v_baris is null then
    raise exception 'UJIAN 6 GAGAL: O1 tiada dalam outcomes';
  end if;
  if (v_baris->>'avg_mastery_pct')::int <> 60 then
    raise exception 'UJIAN 6 GAGAL: O1 avg_mastery_pct % (jangka 60)',
      v_baris->>'avg_mastery_pct';
  end if;

  raise notice 'Ujian 2 hingga 7 dan 9: penguasaan kira jawapan Kuiz Langsung dengan betul';
end $u$;

-- Ujian 8: pencemas menolak tag kuiz kelas A dengan Outcome kelas
-- lain, dan tag kuiz tanpa kelas. Jika INSERT berjaya, raise
-- exception kita sendiri ditangkap oleh handler; semakan
-- position() dalam mesej membezakan ralat pencemas daripada
-- kejayaan yang tidak diingini.
do $u$
declare
  v_f1 constant uuid := '00000000-0000-0000-0000-0000000370f1';
  v_f3 constant uuid := '00000000-0000-0000-0000-0000000370f3';
  v_o1 constant uuid := '00000000-0000-0000-0000-0000000370d1';
  v_ob constant uuid := '00000000-0000-0000-0000-0000000370d3';
  v_bil int;
begin
  begin
    insert into public.qm_live_quiz_outcomes (quiz_id, outcome_id) values (v_f1, v_ob);
    raise exception 'UJIAN 8 GAGAL: tag Outcome kelas lain diterima';
  exception when others then
    if position('different class' in sqlerrm) = 0 then
      raise exception 'UJIAN 8 GAGAL: ralat tidak dijangka: %', sqlerrm;
    end if;
    raise notice 'Ujian 8a: tag kuiz kelas A dengan Outcome kelas B ditolak (betul)';
  end;

  begin
    insert into public.qm_live_quiz_outcomes (quiz_id, outcome_id) values (v_f3, v_o1);
    raise exception 'UJIAN 8 GAGAL: tag kuiz tanpa kelas diterima';
  exception when others then
    if position('Share the quiz' in sqlerrm) = 0 then
      raise exception 'UJIAN 8 GAGAL: ralat tidak dijangka: %', sqlerrm;
    end if;
    raise notice 'Ujian 8b: tag kuiz tanpa kelas ditolak (betul)';
  end;

  -- Tiada baris tercicir daripada kedua-dua percubaan.
  select count(*) into v_bil from public.qm_live_quiz_outcomes where quiz_id = v_f1;
  if v_bil <> 2 then
    raise exception 'UJIAN 8 GAGAL: baris tag kuiz bertag kini % (jangka 2)', v_bil;
  end if;
  select count(*) into v_bil from public.qm_live_quiz_outcomes where quiz_id = v_f3;
  if v_bil <> 0 then
    raise exception 'UJIAN 8 GAGAL: baris tag kuiz tanpa kelas kini % (jangka 0)', v_bil;
  end if;
end $u$;

-- Ujian 10: pelajar (ahli kelas) tidak boleh memanggil
-- qm_mastery_summary; kekal 'Forbidden' seperti sebelum KZ-037.
do $u$
declare
  v_kelas_a constant uuid := '00000000-0000-0000-0000-0000000370c1';
  v_p1      constant uuid := '00000000-0000-0000-0000-0000000370a1';
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_p1, 'role', 'authenticated')::text, true);
  begin
    perform public.qm_mastery_summary(v_kelas_a);
    raise exception 'UJIAN 10 GAGAL: pelajar diberi akses';
  exception when others then
    if sqlerrm <> 'Forbidden' then
      raise exception 'UJIAN 10 GAGAL: ralat bukan Forbidden: %', sqlerrm;
    end if;
    raise notice 'Ujian 10: pelajar ditolak (Forbidden) (betul)';
  end;
end $u$;

-- Gulung semula semua data ujian.
rollback;

-- Ujian 11: selepas ROLLBACK tiada data ujian yang kekal. Jadual
-- qm_live_quiz_outcomes itu sendiri dicipta oleh migrasi 0072 di
-- luar skrip ini; skrip CTO menyemak jadual bersih daripada data
-- ujian selepas skrip ini berjalan.
do $u$
declare
  v_bil int;
begin
  select count(*) into v_bil from public.qm_live_quiz_outcomes
    where quiz_id in ('00000000-0000-0000-0000-0000000370f1',
                      '00000000-0000-0000-0000-0000000370f3');
  if v_bil <> 0 then
    raise exception 'UJIAN 11 GAGAL: % baris tag ujian kekal selepas rollback', v_bil;
  end if;
  select count(*) into v_bil from auth.users
    where email like 'kz037-%@ujian.invalid';
  if v_bil <> 0 then
    raise exception 'UJIAN 11 GAGAL: % pengguna ujian kekal selepas rollback', v_bil;
  end if;
  select count(*) into v_bil from public.qm_classes
    where name like 'Kelas % KZ-037';
  if v_bil <> 0 then
    raise exception 'UJIAN 11 GAGAL: % kelas ujian kekal selepas rollback', v_bil;
  end if;
  raise notice 'Ujian 11: tiada data ujian kekal selepas rollback (betul)';
end $u$;

do $u$
begin
  raise notice 'KZ-037: SEMUA UJIAN LULUS';
end $u$;