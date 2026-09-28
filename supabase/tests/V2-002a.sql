-- V2-002a.sql
--
-- Ujian SQL untuk migrasi 0040_pelan_v2.sql. Jalankan di VPS selepas migrasi:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/V2-002a.sql
-- (atau psql terus sebagai superuser). Semua data dalam SATU transaksi dan
-- dibatalkan dengan ROLLBACK, jadi tiada data kekal.
--
-- Setiap semakan mencetak "LULUS <huruf>: ..." atau "GAGAL <huruf>: ...".
-- Semakan yang meniru pengguna akhir berjalan sebagai peranan `authenticated`
-- dengan request.jwt.claims diikat kepada profil ujian. Semakan pemain sesi
-- (d) sengaja berjalan tanpa set role untuk membuktikan tiada pintasan
-- service_role/postgres.

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Pembantu ujian
-- ---------------------------------------------------------------------
CREATE TEMP TABLE qm_verdicts (
  k      text primary key,
  ok     boolean not null,
  detail text not null
);
GRANT SELECT, INSERT, UPDATE ON pg_temp.qm_verdicts TO authenticated;

-- SECURITY DEFINER: pembantu keputusan kekal boleh tulis walaupun sesi
-- ditukar kepada authenticated/anon untuk meniru pengguna akhir.
CREATE OR REPLACE FUNCTION pg_temp.qm_verdict(p_k text, p_ok boolean, p_detail text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  INSERT INTO pg_temp.qm_verdicts (k, ok, detail) VALUES (p_k, p_ok, p_detail);
  IF p_ok THEN
    RAISE NOTICE 'LULUS %: %', p_k, p_detail;
  ELSE
    RAISE NOTICE 'GAGAL %: %', p_k, p_detail;
  END IF;
END;
$fn$;

-- Meniru sesi pengguna akhir: peranan authenticated + JWT claims.
CREATE OR REPLACE FUNCTION pg_temp.qm_test_as(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"' || p_user::text || '","role":"authenticated"}', true);
END;
$fn$;

-- Kembali kepada peranan sesi dan buang konteks pengguna.
CREATE OR REPLACE FUNCTION pg_temp.qm_test_reset()
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  EXECUTE 'reset role';
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('session_replication_role', 'origin', true);
END;
$fn$;

-- ---------------------------------------------------------------------
-- S. Data bercampur (replica: langkau pencetus dan RLS semasa benih)
--    ID tetap supaya setiap blok semakan boleh merujuknya.
-- ---------------------------------------------------------------------
DO $seed$
DECLARE
  u_free  uuid := '11111111-1111-1111-1111-111111111101';
  u_free2 uuid := '11111111-1111-1111-1111-111111111102';
  u_pro   uuid := '11111111-1111-1111-1111-111111111201';
  u_exp   uuid := '11111111-1111-1111-1111-111111111301';
  u_coed  uuid := '11111111-1111-1111-1111-111111111501';
  u_part  uuid := '11111111-1111-1111-1111-111111111601';
  u_unl   uuid := '11111111-1111-1111-1111-111111111701';
  c_f1    uuid := '22222222-2222-2222-2222-222222222101';
  c_f2    uuid := '22222222-2222-2222-2222-222222222102';
  c_f3    uuid := '22222222-2222-2222-2222-222222222103';
  c_f2b   uuid := '22222222-2222-2222-2222-222222222104';
  c_p     uuid := '22222222-2222-2222-2222-222222222201';
  c_e     uuid := '22222222-2222-2222-2222-222222222301';
  c_e2    uuid := '22222222-2222-2222-2222-222222222302';
  c_e3    uuid := '22222222-2222-2222-2222-222222222303';
  q1      uuid := '33333333-3333-3333-3333-333333333101';
  q2      uuid := '33333333-3333-3333-3333-333333333201';
  s1      uuid := '44444444-4444-4444-4444-444444444101';
  s2      uuid := '44444444-4444-4444-4444-444444444201';
  inst1   uuid := '55555555-5555-5555-5555-555555555101';
  v_i     int;
  v_m     uuid;
  v_h     uuid;
  v_c     uuid;
  v_uc    uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);

  -- Pengguna: educator free, educator free kedua, pro, pro tamat tempoh,
  -- ko-pendidik free, peserta, educator unlimited.
  INSERT INTO public.qm_profiles (id, role, plan, max_classes_owned, max_classes_as_coeducator, max_live_players, can_upload_files)
    VALUES (u_free, 'educator', 'free', 3, 3, 60, true);
  INSERT INTO public.qm_profiles (id, role, plan, max_classes_owned, max_classes_as_coeducator, max_live_players, can_upload_files)
    VALUES (u_free2, 'educator', 'free', 3, 3, 60, true);
  INSERT INTO public.qm_profiles (id, role, plan, plan_expires_at, max_classes_owned, max_classes_as_coeducator, max_live_players, can_upload_files)
    VALUES (u_pro, 'educator', 'pro', now() + interval '365 days', 30, 30, 300, true);
  INSERT INTO public.qm_profiles (id, role, plan, plan_expires_at, max_classes_owned, max_classes_as_coeducator, max_live_players, can_upload_files)
    VALUES (u_exp, 'educator', 'pro', now() - interval '1 day', 30, 30, 300, true);
  INSERT INTO public.qm_profiles (id, role, plan, max_classes_owned, max_classes_as_coeducator, max_live_players, can_upload_files)
    VALUES (u_coed, 'educator', 'free', 3, 3, 60, true);
  INSERT INTO public.qm_profiles (id, role, plan)
    VALUES (u_part, 'participant', 'free');
  -- Unlimited: semua had NULL (tanpa had), boleh muat naik video.
  INSERT INTO public.qm_profiles (id, role, plan, max_classes_owned, max_classes_as_coeducator, max_live_players, can_upload_files, can_upload_videos)
    VALUES (u_unl, 'educator', 'unlimited', NULL, NULL, NULL, true, true);

  -- Kelas: 3 milik u_free, 1 milik u_free2, 3 milik u_pro, 3 milik u_exp.
  INSERT INTO public.qm_classes (id, owner_id, name) VALUES
    (c_f1, u_free, 'Kelas Free 1'), (c_f2, u_free, 'Kelas Free 2'),
    (c_f3, u_free, 'Kelas Free 3'), (c_f2b, u_free2, 'Kelas Free2 A'),
    (c_p, u_pro, 'Kelas Pro 1'), (c_e, u_exp, 'Kelas Tamat 1'),
    (c_e2, u_exp, 'Kelas Tamat 2'), (c_e3, u_exp, 'Kelas Tamat 3');

  -- Baris pendidik pemilik untuk setiap kelas benih, mengikut corak
  -- backfill 0009 (setiap kelas ada satu baris role 'owner' dengan
  -- accepted_at). Perlu untuk dasar RLS sebenar seperti
  -- p_pr_educator_write pada qm_peer_rounds (0034), yang menyemak
  -- qm_is_class_educator: tanpa baris ini, sisipan pengguna sah akan
  -- ditolak RLS sebelum penjaga pelan sempat dinilai.
  INSERT INTO public.qm_class_educators (class_id, educator_id, role, invited_by, accepted_at)
    VALUES (c_f1, u_free, 'owner', u_free, now()),
           (c_f2, u_free, 'owner', u_free, now()),
           (c_f3, u_free, 'owner', u_free, now()),
           (c_f2b, u_free2, 'owner', u_free2, now()),
           (c_p, u_pro, 'owner', u_pro, now()),
           (c_e, u_exp, 'owner', u_exp, now()),
           (c_e2, u_exp, 'owner', u_exp, now()),
           (c_e3, u_exp, 'owner', u_exp, now());

  -- Ko-pendidik free dalam kelas pemilik Pro (diterima).
  INSERT INTO public.qm_class_educators (class_id, educator_id, role, invited_by, accepted_at)
    VALUES (c_p, u_coed, 'co_creator', u_pro, now());

  -- Institusi untuk semakan (f).
  INSERT INTO public.qm_institutions (id, name) VALUES (inst1, 'Institusi Ujian');

  -- 30 aktiviti campuran (20 hunt + 10 kuiz) milik u_free dalam c_f1.
  FOR v_i IN 1..20 LOOP
    INSERT INTO public.qm_hunts (owner_id, class_id, title)
      VALUES (u_free, c_f1, 'Hunt Free ' || v_i);
  END LOOP;
  FOR v_i IN 1..10 LOOP
    INSERT INTO public.qm_live_quizzes (owner_id, class_id, title)
      VALUES (u_free, c_f1, 'Kuiz Free ' || v_i);
  END LOOP;

  -- 30 aktiviti milik u_pro dalam c_p (15 hunt + 15 kuiz).
  FOR v_i IN 1..15 LOOP
    INSERT INTO public.qm_hunts (owner_id, class_id, title)
      VALUES (u_pro, c_p, 'Hunt Pro ' || v_i);
  END LOOP;
  FOR v_i IN 1..15 LOOP
    INSERT INTO public.qm_live_quizzes (owner_id, class_id, title)
      VALUES (u_pro, c_p, 'Kuiz Pro ' || v_i);
  END LOOP;

  -- 30 aktiviti milik u_exp dalam c_e.
  FOR v_i IN 1..15 LOOP
    INSERT INTO public.qm_hunts (owner_id, class_id, title)
      VALUES (u_exp, c_e, 'Hunt Tamat ' || v_i);
  END LOOP;
  FOR v_i IN 1..15 LOOP
    INSERT INTO public.qm_live_quizzes (owner_id, class_id, title)
      VALUES (u_exp, c_e, 'Kuiz Tamat ' || v_i);
  END LOOP;

  -- 5 papan manual milik u_free: 3 papan pembelajaran + 2 papan penghantaran.
  INSERT INTO public.qm_learning_boards (class_id) VALUES (c_f1), (c_f2), (c_f3);
  -- Pilih hunt dengan ORDER BY title (nilai unik) supaya dua papan ini
  -- PASTI berbeza (activity_id, class_id) ialah kekangan unik pada
  -- qm_submission_boards; ORDER BY created_at mempunyai seri kerana
  -- now() ialah masa transaksi yang sama, dan OFFSET 1 boleh memulangkan
  -- baris yang sama (kegagalan CTO 29 Sep).
  SELECT h.id INTO v_h FROM public.qm_hunts h WHERE h.class_id = c_f1 ORDER BY h.title LIMIT 1;
  INSERT INTO public.qm_submission_boards (activity_id, class_id, title, created_by)
    VALUES (v_h, c_f1, 'Papan Ujian 1', u_free);
  SELECT h.id INTO v_h FROM public.qm_hunts h WHERE h.class_id = c_f1 ORDER BY h.title LIMIT 1 OFFSET 1;
  INSERT INTO public.qm_submission_boards (activity_id, class_id, title, created_by)
    VALUES (v_h, c_f1, 'Papan Ujian 2', u_free);

  -- 150 ahli dalam kelas free c_f1.
  FOR v_i IN 1..150 LOOP
    INSERT INTO public.qm_profiles (id, role) VALUES (gen_random_uuid(), 'participant')
      RETURNING id INTO v_m;
    INSERT INTO public.qm_class_members (class_id, user_id) VALUES (c_f1, v_m);
  END LOOP;

  -- Kuiz langsung, sesi (max_players 300: lebih tinggi daripada had pelan
  -- free 60, untuk membuktikan LEAST menguatkuasakan had pelan) dan 60 pemain.
  INSERT INTO public.qm_live_quizzes (id, owner_id, class_id, title)
    VALUES (q1, u_free, c_f1, 'Kuiz Live');
  INSERT INTO public.qm_live_sessions (id, quiz_id, host_id, code, status, max_players)
    VALUES (s1, q1, u_free, 'ABCDEF', 'lobby', 300);
  FOR v_i IN 1..60 LOOP
    INSERT INTO public.qm_live_players (session_id, nickname, player_token)
      VALUES (s1, 'P' || lpad(v_i::text, 4, '0'), md5(random()::text));
  END LOOP;

  -- ------------------------------------------------------------------
  -- Benih akaun unlimited: 30 kelas, 30 aktiviti, 5 papan, 150 ahli
  -- dalam satu kelas, 300 pemain dalam satu sesi (max_players sengaja
  -- 40: pemain ke-301 mesti tetap dibenarkan walaupun sesi "penuh").
  FOR v_i IN 1..30 LOOP
    INSERT INTO public.qm_classes (owner_id, name)
      VALUES (u_unl, 'Kelas Unlimited ' || v_i)
      RETURNING id INTO v_c;
    v_uc := array_append(v_uc, v_c);
  END LOOP;

  -- Baris pendidik pemilik untuk kelas unlimited (corak backfill 0009).
  INSERT INTO public.qm_class_educators (class_id, educator_id, role, invited_by, accepted_at)
    SELECT x, u_unl, 'owner', u_unl, now() FROM unnest(v_uc) AS x;

  -- 30 aktiviti campuran dalam kelas pertama (15 hunt + 14 kuiz + 1 kuiz
  -- sesi langsung di bawah).
  FOR v_i IN 1..15 LOOP
    INSERT INTO public.qm_hunts (owner_id, class_id, title)
      VALUES (u_unl, v_uc[1], 'Hunt Unlimited ' || v_i);
  END LOOP;
  FOR v_i IN 1..14 LOOP
    INSERT INTO public.qm_live_quizzes (owner_id, class_id, title)
      VALUES (u_unl, v_uc[1], 'Kuiz Unlimited ' || v_i);
  END LOOP;

  -- 5 papan: 3 papan pembelajaran (satu per kelas sahaja, kekangan unik
  -- qm_learning_boards.class_id) dan 2 papan penghantaran (hunt berbeza).
  INSERT INTO public.qm_learning_boards (class_id) VALUES (v_uc[1]), (v_uc[2]), (v_uc[3]);
  SELECT h.id INTO v_h FROM public.qm_hunts h WHERE h.class_id = v_uc[1] ORDER BY h.title LIMIT 1;
  INSERT INTO public.qm_submission_boards (activity_id, class_id, title, created_by)
    VALUES (v_h, v_uc[1], 'Papan Unlimited 1', u_unl);
  SELECT h.id INTO v_h FROM public.qm_hunts h WHERE h.class_id = v_uc[1] ORDER BY h.title LIMIT 1 OFFSET 1;
  INSERT INTO public.qm_submission_boards (activity_id, class_id, title, created_by)
    VALUES (v_h, v_uc[1], 'Papan Unlimited 2', u_unl);

  -- 150 ahli dalam kelas keempat.
  FOR v_i IN 1..150 LOOP
    INSERT INTO public.qm_profiles (id, role) VALUES (gen_random_uuid(), 'participant')
      RETURNING id INTO v_m;
    INSERT INTO public.qm_class_members (class_id, user_id) VALUES (v_uc[4], v_m);
  END LOOP;

  -- Kuiz dan sesi unlimited. max_players 40 sengaja kecil supaya semakan
  -- m5 membuktikan pelan unlimited tidak dihadkan oleh max_players.
  INSERT INTO public.qm_live_quizzes (id, owner_id, class_id, title)
    VALUES (q2, u_unl, v_uc[1], 'Kuiz Live Unlimited');
  INSERT INTO public.qm_live_sessions (id, quiz_id, host_id, code, status, max_players)
    VALUES (s2, q2, u_unl, 'UNL123', 'lobby', 40);
  FOR v_i IN 1..300 LOOP
    INSERT INTO public.qm_live_players (session_id, nickname, player_token)
      VALUES (s2, 'U' || lpad(v_i::text, 4, '0'), md5('unl' || v_i::text));
  END LOOP;

  PERFORM set_config('session_replication_role', 'origin', true);
END;
$seed$;

-- ---------------------------------------------------------------------
-- a. Kelas ke-4 educator free disekat
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
BEGIN
  PERFORM pg_temp.qm_test_as(u_free);
  BEGIN
    INSERT INTO public.qm_classes (owner_id, name) VALUES (u_free, 'Kelas ke-4');
    PERFORM pg_temp.qm_verdict('a', false, 'kelas ke-4 educator free TIDAK disekat');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_CLASSES:%' THEN
        PERFORM pg_temp.qm_verdict('a', true, 'kelas ke-4 educator free disekat');
      ELSE
        PERFORM pg_temp.qm_verdict('a', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- b. Aktiviti ke-31 (campuran hunt dan kuiz): disekat untuk free,
--    dibenarkan untuk pro
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  c_f1   uuid := '22222222-2222-2222-2222-222222222101';
BEGIN
  PERFORM pg_temp.qm_test_as(u_free);
  BEGIN
    INSERT INTO public.qm_hunts (owner_id, class_id, title) VALUES (u_free, c_f1, 'Hunt ke-31');
    PERFORM pg_temp.qm_verdict('b1', false, 'aktiviti ke-31 free TIDAK disekat');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_ACTIVITIES:%' THEN
        PERFORM pg_temp.qm_verdict('b1', true, 'aktiviti ke-31 free disekat (kiraan campuran hunt + kuiz)');
      ELSE
        PERFORM pg_temp.qm_verdict('b1', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

DO $chk$
DECLARE
  u_pro uuid := '11111111-1111-1111-1111-111111111201';
  c_p   uuid := '22222222-2222-2222-2222-222222222201';
BEGIN
  PERFORM pg_temp.qm_test_as(u_pro);
  BEGIN
    INSERT INTO public.qm_hunts (owner_id, class_id, title) VALUES (u_pro, c_p, 'Hunt Pro ke-31');
    PERFORM pg_temp.qm_verdict('b2', true, 'aktiviti ke-31 pro dibenarkan (tiada had)');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('b2', false, 'pro disekat secara salah: ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- c. Papan ke-6 disekat untuk free; papan automatik daripada hunt baharu
--    tidak menyebabkan ralat dan tidak dikira
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  c_f1   uuid := '22222222-2222-2222-2222-222222222101';
  v_h    uuid;
BEGIN
  PERFORM pg_temp.qm_test_as(u_free);
  -- OFFSET 2 atas susunan title: hunt yang berbeza daripada dua hunt
  -- yang sudah dipakai papan benih (kekangan unik activity_id, class_id).
  SELECT h.id INTO v_h FROM public.qm_hunts h WHERE h.class_id = c_f1 ORDER BY h.title LIMIT 1 OFFSET 2;
  BEGIN
    INSERT INTO public.qm_submission_boards (activity_id, class_id, title, created_by)
      VALUES (v_h, c_f1, 'Papan ke-6', u_free);
    PERFORM pg_temp.qm_verdict('c1', false, 'papan ke-6 free TIDAK disekat');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_BOARDS:%' THEN
        PERFORM pg_temp.qm_verdict('c1', true, 'papan ke-6 free disekat');
      ELSE
        PERFORM pg_temp.qm_verdict('c1', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

DO $chk$
DECLARE
  u_free2 uuid := '11111111-1111-1111-1111-111111111102';
  c_f2b   uuid := '22222222-2222-2222-2222-222222222104';
BEGIN
  PERFORM pg_temp.qm_test_as(u_free2);
  BEGIN
    INSERT INTO public.qm_hunts (owner_id, class_id, title) VALUES (u_free2, c_f2b, 'Hunt Auto Papan');
    PERFORM pg_temp.qm_verdict('c2', true, 'hunt baharu dengan papan automatik tidak mengalami ralat');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('c2', false, 'hunt baharu gagal: ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- d. Pemain ke-61 dalam sesi pemilik free disekat walaupun dijalankan
--    sebagai peranan sesi (postgres/supabase_admin), TANPA set role
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  s1 uuid := '44444444-4444-4444-4444-444444444101';
BEGIN
  BEGIN
    INSERT INTO public.qm_live_players (session_id, nickname, player_token)
      VALUES (s1, 'Pempenjah', md5('pintasan'));
    PERFORM pg_temp.qm_verdict('d', false, 'pemain ke-61 TIDAK disekat (pintasan wujud!)');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_PLAYERS:%' THEN
        PERFORM pg_temp.qm_verdict('d', true, 'pemain ke-61 disekat walaupun tanpa set role');
      ELSE
        PERFORM pg_temp.qm_verdict('d', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
END;
$chk$;

-- ---------------------------------------------------------------------
-- e. Ahli ke-151 dalam kelas free disekat
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_part uuid := '11111111-1111-1111-1111-111111111601';
  c_f1   uuid := '22222222-2222-2222-2222-222222222101';
BEGIN
  PERFORM pg_temp.qm_test_as(u_part);
  BEGIN
    INSERT INTO public.qm_class_members (class_id, user_id) VALUES (c_f1, u_part);
    PERFORM pg_temp.qm_verdict('e', false, 'ahli ke-151 TIDAK disekat');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_MEMBERS:%' THEN
        PERFORM pg_temp.qm_verdict('e', true, 'ahli ke-151 dalam kelas free disekat');
      ELSE
        PERFORM pg_temp.qm_verdict('e', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- f. Pengguna gagal menukar plan (pro dan unlimited), plan_expires_at
--    atau institution_id sendiri melalui UPDATE sebagai authenticated
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
BEGIN
  PERFORM pg_temp.qm_test_as(u_free);
  BEGIN
    UPDATE public.qm_profiles
       SET plan = 'pro',
           plan_expires_at = '2030-01-01 00:00:00+08'::timestamptz,
           institution_id = (SELECT id FROM public.qm_institutions LIMIT 1)
     WHERE id = u_free;
  EXCEPTION
    WHEN OTHERS THEN NULL; -- RLS mungkin menolak; nilai tetap disemak di bawah
  END;
  -- Percubaan kedua: pelan unlimited (keputusan Boss Hariz, 29 Sep).
  BEGIN
    UPDATE public.qm_profiles
       SET plan = 'unlimited',
           can_upload_videos = true
     WHERE id = u_free;
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  v_plan text;
  v_exp  timestamptz;
  v_inst uuid;
  v_vid  boolean;
BEGIN
  SELECT plan, plan_expires_at, institution_id, can_upload_videos
    INTO v_plan, v_exp, v_inst, v_vid
    FROM public.qm_profiles WHERE id = u_free;
  IF v_plan = 'free' AND v_exp IS NULL AND v_inst IS NULL AND COALESCE(v_vid, false) = false THEN
    PERFORM pg_temp.qm_verdict('f', true, 'pengguna tidak dapat menukar plan (pro dan unlimited), plan_expires_at, institution_id atau can_upload_videos sendiri');
  ELSE
    PERFORM pg_temp.qm_verdict('f', false, 'profil berubah: ' || v_plan || ' ' || COALESCE(v_exp::text, 'null') || ' ' || COALESCE(v_inst::text, 'null') || ' video=' || COALESCE(v_vid::text, 'null'));
  END IF;
END;
$chk$;

-- ---------------------------------------------------------------------
-- g. Ko-pendidik free dalam kelas pemilik Pro boleh mencipta aktiviti
--    ke-31 (pelan pemilik kelas mengawal)
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_coed uuid := '11111111-1111-1111-1111-111111111501';
  c_p    uuid := '22222222-2222-2222-2222-222222222201';
BEGIN
  PERFORM pg_temp.qm_test_as(u_coed);
  BEGIN
    INSERT INTO public.qm_hunts (owner_id, class_id, title) VALUES (u_coed, c_p, 'Hunt Ko-Pendidik');
    PERFORM pg_temp.qm_verdict('g', true, 'ko-pendidik free dalam kelas Pro boleh mencipta aktiviti ke-31');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('g', false, 'ko-pendidik disekat secara salah: ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- h. Pro yang tamat tempoh berkelakuan seperti free untuk ciptaan baharu
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_exp uuid := '11111111-1111-1111-1111-111111111301';
  v_eff text;
BEGIN
  v_eff := public.qm_effective_plan(u_exp);
  IF v_eff = 'free' THEN
    PERFORM pg_temp.qm_verdict('h1', true, 'pelan berkesan pro yang tamat tempoh ialah free');
  ELSE
    PERFORM pg_temp.qm_verdict('h1', false, 'pelan berkesan pro tamat tempoh: ' || COALESCE(v_eff, 'null'));
  END IF;
END;
$chk$;

DO $chk$
DECLARE
  u_exp uuid := '11111111-1111-1111-1111-111111111301';
BEGIN
  PERFORM pg_temp.qm_test_as(u_exp);
  BEGIN
    INSERT INTO public.qm_classes (owner_id, name) VALUES (u_exp, 'Kelas ke-4 Tamat');
    PERFORM pg_temp.qm_verdict('h2', false, 'kelas ke-4 pro tamat tempoh TIDAK disekat');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_CLASSES:%' THEN
        PERFORM pg_temp.qm_verdict('h2', true, 'kelas ke-4 pro tamat tempoh disekat seperti free');
      ELSE
        PERFORM pg_temp.qm_verdict('h2', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

DO $chk$
DECLARE
  u_exp uuid := '11111111-1111-1111-1111-111111111301';
  c_e   uuid := '22222222-2222-2222-2222-222222222301';
BEGIN
  PERFORM pg_temp.qm_test_as(u_exp);
  BEGIN
    INSERT INTO public.qm_hunts (owner_id, class_id, title) VALUES (u_exp, c_e, 'Hunt ke-31 Tamat');
    PERFORM pg_temp.qm_verdict('h3', false, 'aktiviti ke-31 pro tamat tempoh TIDAK disekat');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_ACTIVITIES:%' THEN
        PERFORM pg_temp.qm_verdict('h3', true, 'aktiviti ke-31 pro tamat tempoh disekat seperti free');
      ELSE
        PERFORM pg_temp.qm_verdict('h3', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- i. Penilaian rakan disekat untuk free, dibenarkan untuk pro
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  c_f1   uuid := '22222222-2222-2222-2222-222222222101';
BEGIN
  PERFORM pg_temp.qm_test_as(u_free);
  BEGIN
    INSERT INTO public.qm_peer_rounds (class_id, name, kind, opens_at, closes_at, created_by)
      VALUES (c_f1, 'Pusingan Free', 'formatif', now() - interval '1 hour', now() + interval '1 day', u_free);
    PERFORM pg_temp.qm_verdict('i1', false, 'penilaian rakan free TIDAK disekat');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_PLAN_PRO:%' THEN
        PERFORM pg_temp.qm_verdict('i1', true, 'penilaian rakan free disekat (QM_PLAN_PRO)');
      ELSE
        PERFORM pg_temp.qm_verdict('i1', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

DO $chk$
DECLARE
  u_pro uuid := '11111111-1111-1111-1111-111111111201';
  c_p   uuid := '22222222-2222-2222-2222-222222222201';
BEGIN
  PERFORM pg_temp.qm_test_as(u_pro);
  BEGIN
    INSERT INTO public.qm_peer_rounds (class_id, name, kind, opens_at, closes_at, created_by)
      VALUES (c_p, 'Pusingan Pro', 'formatif', now() - interval '1 hour', now() + interval '1 day', u_pro);
    PERFORM pg_temp.qm_verdict('i2', true, 'penilaian rakan pro dibenarkan');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('i2', false, 'pro disekat secara salah: ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- j. qm_plan_limits('xyz') pulangkan had free
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_limits jsonb;
BEGIN
  v_limits := public.qm_plan_limits('xyz');
  IF v_limits ->> 'classes' = '3'
     AND v_limits ->> 'activities' = '30'
     AND v_limits ->> 'boards' = '5'
     AND (v_limits ->> 'peer_review')::boolean = false
     AND (v_limits ->> 'video')::boolean = false THEN
    PERFORM pg_temp.qm_verdict('j', true, 'qm_plan_limits(xyz) pulangkan had free dengan video false');
  ELSE
    PERFORM pg_temp.qm_verdict('j', false, 'qm_plan_limits(xyz): ' || v_limits::text);
  END IF;
END;
$chk$;

-- ---------------------------------------------------------------------
-- k. anon tidak boleh memanggil qm_my_plan_usage dan qm_set_plan
-- ---------------------------------------------------------------------
DO $chk$
BEGIN
  PERFORM set_config('role', 'anon', true);
  BEGIN
    PERFORM public.qm_my_plan_usage();
    PERFORM pg_temp.qm_verdict('k', false, 'anon boleh panggil qm_my_plan_usage');
  EXCEPTION
    WHEN insufficient_privilege THEN
      BEGIN
        PERFORM public.qm_set_plan(gen_random_uuid(), 'pro');
        PERFORM pg_temp.qm_verdict('k', false, 'anon boleh panggil qm_set_plan');
      EXCEPTION
        WHEN insufficient_privilege THEN
          PERFORM pg_temp.qm_verdict('k', true, 'anon tidak boleh panggil qm_my_plan_usage dan qm_set_plan');
      END;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- m. Akaun unlimited: tiada had (kelas ke-31, aktiviti ke-31, papan ke-6,
--    ahli ke-151, pemain sesi ke-301) dan kunci video = true
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_unl uuid := '11111111-1111-1111-1111-111111111701';
BEGIN
  PERFORM pg_temp.qm_test_as(u_unl);
  BEGIN
    INSERT INTO public.qm_classes (owner_id, name) VALUES (u_unl, 'Kelas ke-31 Unlimited');
    PERFORM pg_temp.qm_verdict('m1', true, 'kelas ke-31 unlimited dibenarkan');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('m1', false, 'unlimited disekat secara salah (kelas): ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

DO $chk$
DECLARE
  u_unl uuid := '11111111-1111-1111-1111-111111111701';
  v_c1  uuid;
BEGIN
  SELECT c.id INTO v_c1 FROM public.qm_classes c WHERE c.owner_id = u_unl ORDER BY c.name LIMIT 1;
  PERFORM pg_temp.qm_test_as(u_unl);
  BEGIN
    INSERT INTO public.qm_hunts (owner_id, class_id, title) VALUES (u_unl, v_c1, 'Hunt Unlimited ke-31');
    PERFORM pg_temp.qm_verdict('m2', true, 'aktiviti ke-31 unlimited dibenarkan');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('m2', false, 'unlimited disekat secara salah (aktiviti): ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

DO $chk$
DECLARE
  u_unl uuid := '11111111-1111-1111-1111-111111111701';
  v_c1  uuid;
  v_h   uuid;
BEGIN
  SELECT c.id INTO v_c1 FROM public.qm_classes c WHERE c.owner_id = u_unl ORDER BY c.name LIMIT 1;
  -- Hunt ketiga dalam kelas itu: berbeza daripada dua hunt papan benih
  -- (kekangan unik activity_id, class_id).
  SELECT h.id INTO v_h FROM public.qm_hunts h WHERE h.class_id = v_c1 ORDER BY h.title LIMIT 1 OFFSET 2;
  PERFORM pg_temp.qm_test_as(u_unl);
  BEGIN
    INSERT INTO public.qm_submission_boards (activity_id, class_id, title, created_by)
      VALUES (v_h, v_c1, 'Papan Unlimited ke-6', u_unl);
    PERFORM pg_temp.qm_verdict('m3', true, 'papan ke-6 unlimited dibenarkan');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('m3', false, 'unlimited disekat secara salah (papan): ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

DO $chk$
DECLARE
  u_unl  uuid := '11111111-1111-1111-1111-111111111701';
  v_m    uuid;
  v_c4   uuid;
BEGIN
  SELECT c.id INTO v_c4 FROM public.qm_classes c WHERE c.owner_id = u_unl ORDER BY c.name LIMIT 1 OFFSET 3;
  INSERT INTO public.qm_profiles (id, role) VALUES (gen_random_uuid(), 'participant')
    RETURNING id INTO v_m;
  PERFORM pg_temp.qm_test_as(v_m);
  BEGIN
    INSERT INTO public.qm_class_members (class_id, user_id) VALUES (v_c4, v_m);
    PERFORM pg_temp.qm_verdict('m4', true, 'ahli ke-151 unlimited dibenarkan');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('m4', false, 'unlimited disekat secara salah (ahli): ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- Pemain ke-301 dalam sesi unlimited yang max_players sudah tercapai.
-- Dijalankan TANPA set role (peranan sesi) seperti semakan d: pencetus
-- 0031 tiada pintasan peranan, jadi laluan ini ialah yang paling curiga.
DO $chk$
DECLARE
  s2 uuid := '44444444-4444-4444-4444-444444444201';
BEGIN
  BEGIN
    INSERT INTO public.qm_live_players (session_id, nickname, player_token)
      VALUES (s2, 'U0301', md5('unl301'));
    PERFORM pg_temp.qm_verdict('m5', true, 'pemain ke-301 unlimited dibenarkan walaupun max_players = 40');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('m5', false, 'pemain ke-301 unlimited disekat secara salah: ' || sqlerrm);
  END;
END;
$chk$;

DO $chk$
DECLARE
  v_limits jsonb;
BEGIN
  v_limits := public.qm_plan_limits('unlimited');
  IF (v_limits ->> 'video')::boolean = true
     AND v_limits ->> 'classes' IS NULL
     AND v_limits ->> 'members_per_class' IS NULL
     AND v_limits ->> 'live_players' IS NULL
     AND (v_limits ->> 'peer_review')::boolean = true THEN
    PERFORM pg_temp.qm_verdict('m6', true, 'qm_plan_limits(unlimited): semua had null, video true');
  ELSE
    PERFORM pg_temp.qm_verdict('m6', false, 'qm_plan_limits(unlimited): ' || v_limits::text);
  END IF;
END;
$chk$;

-- ---------------------------------------------------------------------
-- n. Adversarial auto_created (kzqa penemuan 1): nilai yang dihantar
--    pelanggan mesti diabaikan dan UPDATE mesti dipin
-- ---------------------------------------------------------------------
-- n1: educator free dengan 5 papan manual cuba memintas kuota dengan
--     auto_created = true. Dengan pepijat lama, sisipan ini LULUS.
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  c_f1   uuid := '22222222-2222-2222-2222-222222222101';
  v_h    uuid;
BEGIN
  PERFORM pg_temp.qm_test_as(u_free);
  SELECT h.id INTO v_h FROM public.qm_hunts h WHERE h.class_id = c_f1 ORDER BY h.title LIMIT 1 OFFSET 3;
  BEGIN
    INSERT INTO public.qm_submission_boards (activity_id, class_id, title, created_by, auto_created)
      VALUES (v_h, c_f1, 'Papan Bypass', u_free, true);
    PERFORM pg_temp.qm_verdict('n1', false, 'bypass auto_created = true TIDAK disekat');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_BOARDS:%' THEN
        PERFORM pg_temp.qm_verdict('n1', true, 'bypass auto_created = true disekat oleh kuota papan');
      ELSE
        PERFORM pg_temp.qm_verdict('n1', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- n2: papan yang berjaya dicipta dengan auto_created = true mesti
--     disimpan sebagai false (bendera dipaksa, bukan dipercayai).
DO $chk$
DECLARE
  u_pro  uuid := '11111111-1111-1111-1111-111111111201';
  c_p    uuid := '22222222-2222-2222-2222-222222222201';
  v_flag boolean;
BEGIN
  PERFORM pg_temp.qm_test_as(u_pro);
  BEGIN
    INSERT INTO public.qm_learning_boards (class_id, auto_created)
      VALUES (c_p, true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_test_reset();
      PERFORM pg_temp.qm_verdict('n2', false, 'papan pembelajaran pro gagal: ' || sqlerrm);
      RETURN;
  END;
  PERFORM pg_temp.qm_test_reset();
  SELECT auto_created INTO v_flag FROM public.qm_learning_boards WHERE class_id = c_p;
  IF v_flag = false THEN
    PERFORM pg_temp.qm_verdict('n2', true, 'papan auto_created = true disimpan sebagai false');
  ELSE
    PERFORM pg_temp.qm_verdict('n2', false, 'auto_created = true diterima terus (bypass masih ada)');
  END IF;
END;
$chk$;

-- n3: UPDATE auto_created = true mesti dipin kembali ke nilai lama.
DO $chk$
DECLARE
  u_pro  uuid := '11111111-1111-1111-1111-111111111201';
  c_p    uuid := '22222222-2222-2222-2222-222222222201';
  v_flag boolean;
BEGIN
  PERFORM pg_temp.qm_test_as(u_pro);
  BEGIN
    UPDATE public.qm_learning_boards
       SET auto_created = true
     WHERE class_id = c_p AND auto_created = false;
  EXCEPTION
    WHEN OTHERS THEN NULL; -- RLS mungkin menolak; nilai tetap disemak di bawah
  END;
  PERFORM pg_temp.qm_test_reset();
  SELECT auto_created INTO v_flag FROM public.qm_learning_boards WHERE class_id = c_p;
  IF v_flag = false THEN
    PERFORM pg_temp.qm_verdict('n3', true, 'UPDATE auto_created dipin: kekal false');
  ELSE
    PERFORM pg_temp.qm_verdict('n3', false, 'UPDATE auto_created berjaya diubah pelanggan');
  END IF;
END;
$chk$;

-- ---------------------------------------------------------------------
-- Ringkasan
-- ---------------------------------------------------------------------
DO $sum$
DECLARE
  r record;
  v_gagal int := 0;
BEGIN
  FOR r IN SELECT k, ok, detail FROM pg_temp.qm_verdicts ORDER BY k LOOP
    IF NOT r.ok THEN v_gagal := v_gagal + 1; END IF;
    RAISE NOTICE '  [%] % %', r.k, CASE WHEN r.ok THEN 'LULUS' ELSE 'GAGAL' END, r.detail;
  END LOOP;
  IF v_gagal = 0 THEN
    RAISE NOTICE 'RINGKASAN: semua semakan LULUS';
  ELSE
    RAISE NOTICE 'RINGKASAN: % semakan GAGAL', v_gagal;
  END IF;
END;
$sum$;

ROLLBACK;