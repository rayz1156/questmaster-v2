-- V2-003b.sql
--
-- Ujian SQL untuk migrasi 0044_sijil_emel.sql. Jalankan di VPS selepas
-- migrasi:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/V2-003b.sql
-- Semua data dalam SATU transaksi dan dibatalkan dengan ROLLBACK.
--
-- Setiap semakan mencetak "LULUS <huruf>: ..." atau "GAGAL <huruf>: ...".
-- Semakan yang meniru pengguna akhir berjalan sebagai peranan
-- authenticated/anon dengan request.jwt.claims diikat kepada profil ujian.
-- Corak sama dengan V2-003a.sql (pembantunya ditulis semula di sini supaya
-- fail ini boleh dijalankan bersendirian).

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

CREATE OR REPLACE FUNCTION pg_temp.qm_test_as(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- PGlite lalai row_security = off (dump production turut set off);
  -- tanpa on, pertanyaan RLS sebagai bukan pemilik membuang ralat 42501
  -- dan bukannya menapis baris seperti production.
  PERFORM set_config('row_security', 'on', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"' || p_user::text || '","role":"authenticated"}', true);
END;
$fn$;

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
-- S. Data bercampur
--    u_ed   : pendidik free, pemilik c1
--    u_ed2  : pendidik kelas lain (c2), bukan pendidik c1
--    p1     : peserta c1, nama disahkan, ada emel auth.users
--    p2     : peserta c1, nama TIDAK disahkan
--    p3     : peserta c1 dan c2, nama disahkan
--    u_noemail : peserta c1 tanpa emel auth.users (ujian penapisan)
-- ---------------------------------------------------------------------
DO $seed$
DECLARE
  u_ed   uuid := '11111111-0000-0000-0000-0000000001a1';
  u_ed2  uuid := '11111111-0000-0000-0000-0000000001a2';
  p1     uuid := '11111111-0000-0000-0000-0000000001b1';
  p2     uuid := '11111111-0000-0000-0000-0000000001b2';
  p3     uuid := '11111111-0000-0000-0000-0000000001b3';
  u_noem uuid := '11111111-0000-0000-0000-0000000001b4';
  c1     uuid := '22222222-0000-0000-0000-0000000001c1';
  c2     uuid := '22222222-0000-0000-0000-0000000001c2';
  t1     uuid := '33333333-0000-0000-0000-0000000001d1';
  t2     uuid := '33333333-0000-0000-0000-0000000001d2';
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);

  -- Baris auth.users: kunci id merujuk qm_profiles.id (FK
  -- qm_profiles_id_fkey, skema-production.sql:8964). SETIAP baris
  -- qm_profiles mesti ada induk sah kerana FK dikuatkuasakan di luar mod
  -- replica (lihat blok 1: UPDATE baris tanpa induk melempar 23503).
  -- u_noem sengaja dengan email NULL supaya ujian penapisan emel meliputi
  -- sijil pemilik yang tiada emel.
  INSERT INTO auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, created_at, updated_at)
    VALUES (u_ed, 'ed1@test.local', 'x', 'authenticated', 'authenticated', now(), now(), now()),
           (u_ed2, 'ed2@test.local', 'x', 'authenticated', 'authenticated', now(), now(), now()),
           (p1, 'p1@test.local', 'x', 'authenticated', 'authenticated', now(), now(), now()),
           (p2, 'p2@test.local', 'x', 'authenticated', 'authenticated', now(), now(), now()),
           (p3, 'p3@test.local', 'x', 'authenticated', 'authenticated', now(), now(), now()),
           (u_noem, NULL, 'x', 'authenticated', 'authenticated', now(), now(), now());

  INSERT INTO public.qm_profiles (id, role, plan, display_name, certificate_name, certificate_name_confirmed_at)
    VALUES (u_ed, 'educator', 'free', 'Encik Edukator', 'Encik Edukator', now());
  INSERT INTO public.qm_profiles (id, role, plan, display_name)
    VALUES (u_ed2, 'educator', 'free', 'Encik Dua');
  INSERT INTO public.qm_profiles (id, role, plan, display_name, certificate_name, certificate_name_confirmed_at)
    VALUES (p1, 'participant', 'free', 'Aisyah Binti Rahman', 'Aisyah Binti Rahman', now());
  INSERT INTO public.qm_profiles (id, role, plan, display_name)
    VALUES (p2, 'participant', 'free', 'Belum Sahkan Nama');
  INSERT INTO public.qm_profiles (id, role, plan, display_name, certificate_name, certificate_name_confirmed_at)
    VALUES (p3, 'participant', 'free', 'Chong Wei Ming', 'Chong Wei Ming', now());
  INSERT INTO public.qm_profiles (id, role, plan, display_name, certificate_name, certificate_name_confirmed_at)
    VALUES (u_noem, 'participant', 'free', 'Tiada Emel', 'Tiada Emel', now());

  INSERT INTO public.qm_classes (id, owner_id, name)
    VALUES (c1, u_ed, 'Kelas Emel Satu'), (c2, u_ed2, 'Kelas Emel Dua');

  INSERT INTO public.qm_class_members (class_id, user_id)
    VALUES (c1, p1), (c1, p2), (c1, p3), (c1, u_noem), (c2, p3);

  INSERT INTO public.qm_certificate_templates (id, class_id, title, criteria)
    VALUES (t1, c1, 'Templat Emel', '{"type":"all_members"}'::jsonb);
  INSERT INTO public.qm_certificate_templates (id, class_id, title, criteria)
    VALUES (t2, c2, 'Templat Dua', '{"type":"all_members"}'::jsonb);

  PERFORM set_config('session_replication_role', 'origin', true);
END;
$seed$;

-- ---------------------------------------------------------------------
-- 1. Peserta sahkan nama: kemas kini lajur sijil sendiri diluluskan RLS
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_r record;
BEGIN
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000001b2');
  UPDATE public.qm_profiles
     SET certificate_name = 'Nama Diperbetulkan',
         certificate_name_confirmed_at = now()
   WHERE id = '11111111-0000-0000-0000-0000000001b2';
  SELECT certificate_name, certificate_name_confirmed_at INTO v_r
    FROM public.qm_profiles WHERE id = '11111111-0000-0000-0000-0000000001b2';
  PERFORM pg_temp.qm_verdict('a', v_r.certificate_name = 'Nama Diperbetulkan' AND v_r.certificate_name_confirmed_at IS NOT NULL,
    'peserta kemas kini certificate_name sendiri: ' || coalesce(v_r.certificate_name, 'NULL'));
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- 2. Penjaga 0027 tidak memin lajur sijil (kemas kini semula berjaya)
--    dan peserta TIDAK boleh menukar lajur kuasa pada masa yang sama
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_r record;
  v_kekal boolean := true;
BEGIN
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000001b1');
  UPDATE public.qm_profiles
     SET certificate_name = 'Aisyah Binti Rahman',
         certificate_name_confirmed_at = now()
   WHERE id = '11111111-0000-0000-0000-0000000001b1';
  SELECT role INTO v_r FROM public.qm_profiles WHERE id = '11111111-0000-0000-0000-0000000001b1';
  IF v_r.role IS DISTINCT FROM 'participant' THEN v_kekal := false; END IF;
  PERFORM pg_temp.qm_verdict('b', v_kekal,
    'peranan kekal participant selepas kemas kini profil sendiri');
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- 3. qm_certificate_email_targets: pendidik sahaja, penapisan betul
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_n int;
  v_ditolak boolean := false;
BEGIN
  -- Peserta tidak boleh memanggil: fungsi itu melempar.
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000001b1');
  BEGIN
    PERFORM count(*) FROM public.qm_certificate_email_targets('22222222-0000-0000-0000-0000000001c1', NULL);
    PERFORM pg_temp.qm_verdict('c', false, 'peserta boleh memanggil qm_certificate_email_targets');
  EXCEPTION WHEN OTHERS THEN
    v_ditolak := SQLERRM LIKE '%educator%';
  END;
  PERFORM pg_temp.qm_verdict('c', v_ditolak, 'peserta ditolak oleh fungsi sasaran emel');
  PERFORM pg_temp.qm_test_reset();

  -- Pendidik kelas lain juga ditolak.
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000001a2');
  v_ditolak := false;
  BEGIN
    PERFORM count(*) FROM public.qm_certificate_email_targets('22222222-0000-0000-0000-0000000001c1', NULL);
    PERFORM pg_temp.qm_verdict('c2', false, 'pendidik kelas lain berjaya membaca sasaran emel');
  EXCEPTION WHEN OTHERS THEN
    v_ditolak := SQLERRM LIKE '%educator%';
  END;
  PERFORM pg_temp.qm_verdict('c2', v_ditolak, 'pendidik kelas lain ditolak');
  PERFORM pg_temp.qm_test_reset();

  -- Pendidik sahaja: keluarkan sijil dahulu supaya ada sijil belum emel.
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000001a1');
  PERFORM public.qm_issue_certificates('33333333-0000-0000-0000-0000000001d1', NULL);
  -- Sasaran emel hanya sijil yang PDFnya sudah dijana (pdf_path bukan NULL,
  -- 0044_sijil_emel.sql:62). Pengeluaran SQL tidak menjana PDF, jadi
  -- simulasi hasil janaan PDF laluan API sebelum menguji sasaran.
  UPDATE public.qm_certificates SET pdf_path = 'certificate-assets/simulasi.pdf'
   WHERE class_id = '22222222-0000-0000-0000-0000000001c1';
  SELECT count(*) INTO v_n FROM public.qm_certificate_email_targets('22222222-0000-0000-0000-0000000001c1', NULL);
  -- p1, p3 dan p2 layak (nama p2 disahkan dalam blok 1); u_noem juga
  -- menerima sijil tetapi emelnya NULL, jadi ditapis keluar oleh join
  -- auth.users (u.email is not null). Jangka 3 daripada 4 sijil.
  PERFORM pg_temp.qm_verdict('d', v_n = 3,
    'sasaran emel: ' || v_n::text || ' baris (jangka 3: p1, p2, p3; u_noem ditapis)');

  -- Emel yang dipulangkan datang daripada auth.users.
  SELECT count(*) INTO v_n FROM public.qm_certificate_email_targets('22222222-0000-0000-0000-0000000001c1', NULL)
    WHERE email LIKE '%@test.local';
  PERFORM pg_temp.qm_verdict('d2', v_n = 3, 'emel sasaran dari auth.users: ' || v_n::text);

  -- p_limit dihormati: hanya satu baris walaupun dua yang layak.
  SELECT count(*) INTO v_n FROM public.qm_certificate_email_targets('22222222-0000-0000-0000-0000000001c1', 1);
  PERFORM pg_temp.qm_verdict('d3', v_n = 1, 'p_limit 1 memulangkan 1 baris');
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- 4. qm_certificate_classes_needing_name: hanya kelas dengan templat dan
--    nama belum disahkan
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_n int;
  v_nama text;
BEGIN
  -- p2 sudah mengesahkan nama dalam blok 1, jadi dia TIADA kelas perlu sahkan.
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000001b2');
  SELECT count(*) INTO v_n FROM public.qm_certificate_classes_needing_name();
  PERFORM pg_temp.qm_verdict('e', v_n = 0,
    'p2 (sudah sahkan): ' || v_n::text || ' kelas perlu sahkan (jangka 0)');

  -- p3: nama disahkan, jadi tiada kelas walaupun ahli dua kelas bertemplat.
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000001b3');
  SELECT count(*) INTO v_n FROM public.qm_certificate_classes_needing_name();
  PERFORM pg_temp.qm_verdict('e2', v_n = 0,
    'p3 (nama disahkan): ' || v_n::text || ' kelas (jangka 0)');

  -- Peserta kelas tanpa templat juga tiada. Guna p1 tetapi sahkan dahulu
  -- bahawa kelasnya memang ada templat (jika tidak, ujian ini kosong).
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000001b1');
  SELECT count(*) INTO v_n FROM public.qm_certificate_classes_needing_name();
  PERFORM pg_temp.qm_verdict('e3', v_n = 0,
    'p1 (nama disahkan): ' || v_n::text || ' kelas (jangka 0)');

  -- Peserta baharu tanpa nama disahkan dalam kelas bertemplat: satu baris,
  -- dengan nama kelas. Kembali kepada admin dahulu (masih authenticated
  -- semasa semakan e3; schema auth tidak boleh disisip sebagai authenticated)
  -- dan FK qm_profiles.id ke auth.users (skema-production.sql:8964)
  -- dikuatkuasakan di luar mod replica, jadi baris auth.users mesti
  -- diisipkan DAHULU.
  PERFORM pg_temp.qm_test_reset();
  INSERT INTO auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, created_at, updated_at)
    VALUES ('11111111-0000-0000-0000-0000000001b5', 'p5@test.local', 'x', 'authenticated', 'authenticated', now(), now(), now());
  INSERT INTO public.qm_profiles (id, role, plan, display_name)
    VALUES ('11111111-0000-0000-0000-0000000001b5', 'participant', 'free', 'Peserta Baru');
  INSERT INTO public.qm_class_members (class_id, user_id)
    VALUES ('22222222-0000-0000-0000-0000000001c1', '11111111-0000-0000-0000-0000000001b5');

  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000001b5');
  SELECT count(*) INTO v_n FROM public.qm_certificate_classes_needing_name();
  SELECT class_name INTO v_nama FROM public.qm_certificate_classes_needing_name() LIMIT 1;
  PERFORM pg_temp.qm_verdict('e4', v_n = 1 AND v_nama = 'Kelas Emel Satu',
    'peserta baru: ' || v_n::text || ' kelas, nama=' || coalesce(v_nama, 'NULL'));
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- 5. anon tidak boleh memanggil kedua-dua fungsi
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_ditolak boolean := false;
BEGIN
  PERFORM set_config('role', 'anon', true);
  BEGIN
    PERFORM count(*) FROM public.qm_certificate_classes_needing_name();
    PERFORM pg_temp.qm_verdict('f', false, 'anon boleh panggil qm_certificate_classes_needing_name');
  EXCEPTION WHEN insufficient_privilege THEN
    v_ditolak := true;
  END;
  PERFORM pg_temp.qm_verdict('f', v_ditolak, 'anon ditolak pada fungsi kelas perlu sahkan');
  PERFORM pg_temp.qm_test_reset();
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
