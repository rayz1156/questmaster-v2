-- V2-003a.sql
--
-- Ujian SQL untuk migrasi 0042_sijil.sql. Jalankan di VPS selepas migrasi:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/V2-003a.sql
-- (atau psql terus sebagai superuser). Semua data dalam SATU transaksi dan
-- dibatalkan dengan ROLLBACK, jadi tiada data kekal.
--
-- Setiap semakan mencetak "LULUS <huruf>: ..." atau "GAGAL <huruf>: ...".
-- Semakan yang meniru pengguna akhir berjalan sebagai peranan
-- authenticated/anon dengan request.jwt.claims diikat kepada profil ujian.

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
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"' || p_user::text || '","role":"authenticated"}', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.qm_test_as_anon()
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
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
--    u_ed   : pendidik free, pemilik c1 (kelas sijil)
--    u_ed2  : pendidik free, pemilik c2 (kelas lain)
--    p1     : peserta dengan nama sijil disahkan
--    p2     : peserta TANPA nama sijil
--    p3     : peserta dengan nama sijil, skor pasukan tinggi
-- ---------------------------------------------------------------------
DO $seed$
DECLARE
  u_ed   uuid := '11111111-0000-0000-0000-0000000000a1';
  u_ed2  uuid := '11111111-0000-0000-0000-0000000000a2';
  p1     uuid := '11111111-0000-0000-0000-0000000000b1';
  p2     uuid := '11111111-0000-0000-0000-0000000000b2';
  p3     uuid := '11111111-0000-0000-0000-0000000000b3';
  c1     uuid := '22222222-0000-0000-0000-0000000000c1';
  c2     uuid := '22222222-0000-0000-0000-0000000000c2';
  h1     uuid := '33333333-0000-0000-0000-0000000000h1';
  qz1    uuid := '33333333-0000-0000-0000-0000000000q1';
  s1     uuid := '44444444-0000-0000-0000-0000000000s1';
  tim_t  uuid := '55555555-0000-0000-0000-0000000000t1';
  ch1    uuid := '66666666-0000-0000-0000-0000000000g1';
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);

  INSERT INTO public.qm_profiles (id, role, plan, display_name, certificate_name, certificate_name_confirmed_at)
    VALUES (u_ed, 'educator', 'free', 'Encik Edukator', 'Encik Edukator', now());
  INSERT INTO public.qm_profiles (id, role, plan, display_name)
    VALUES (u_ed2, 'educator', 'free', 'Encik Dua');
  INSERT INTO public.qm_profiles (id, role, plan, display_name, certificate_name, certificate_name_confirmed_at)
    VALUES (p1, 'participant', 'free', 'Aisyah Binti Rahman', 'Aisyah Binti Rahman', now());
  INSERT INTO public.qm_profiles (id, role, plan, display_name)
    VALUES (p2, 'participant', 'free', 'Nama Tanpa Sijil');
  INSERT INTO public.qm_profiles (id, role, plan, display_name, certificate_name, certificate_name_confirmed_at)
    VALUES (p3, 'participant', 'free', 'Chong Wei Ming', 'Chong Wei Ming', now());

  INSERT INTO public.qm_classes (id, owner_id, name)
    VALUES (c1, u_ed, 'Kelas Sijil Satu'), (c2, u_ed2, 'Kelas Sijil Dua');

  INSERT INTO public.qm_class_members (class_id, user_id)
    VALUES (c1, p1), (c1, p2), (c1, p3), (c2, p1);

  -- Hunt dengan satu penghantaran approved oleh p1 sahaja.
  INSERT INTO public.qm_hunts (id, owner_id, title) VALUES (h1, u_ed, 'Hunt Sijil');
  INSERT INTO public.qm_challenges (id, hunt_id, title, points) VALUES (ch1, h1, 'Soalan ujian', 10);
  INSERT INTO public.qm_submissions (challenge_id, user_id, answer, status)
    VALUES (ch1, p1, 'jawapan', 'approved');

  -- Pasukan: p3 dalam pasukan bermarkah tinggi, p2 tiada pasukan.
  INSERT INTO public.qm_teams (id, class_id, hunt_id, name, score) VALUES (tim_t, c1, h1, 'Tim Sijil', 95);
  INSERT INTO public.qm_team_members (team_id, user_id) VALUES (tim_t, p3);

  -- Sesi kuiz langsung: hanya p1 hadir.
  INSERT INTO public.qm_live_quizzes (id, class_id, owner_id, title)
    VALUES (qz1, c1, u_ed, 'Kuiz Sijil');
  INSERT INTO public.qm_live_sessions (id, quiz_id, host_id, code, status)
    VALUES (s1, qz1, u_ed, 'ABC234', 'ended');
  INSERT INTO public.qm_live_players (session_id, nickname, user_id, player_token)
    VALUES (s1, 'Aisyah', p1, replace(gen_random_uuid()::text, '-', ''));

  -- Empat templat: kriteria berbeza-beza.
  INSERT INTO public.qm_certificate_templates (id, class_id, title, criteria)
    VALUES ('33333333-0000-0000-0000-000000000001', c1, 'Templat Semua', '{"type":"all_members"}'::jsonb);
  INSERT INTO public.qm_certificate_templates (id, class_id, title, criteria)
    VALUES ('33333333-0000-0000-0000-000000000002', c1, 'Templat Hunt', '{"type":"hunt_completed","hunt_id":"' || h1::text || '"}'::jsonb);
  INSERT INTO public.qm_certificate_templates (id, class_id, title, criteria)
    VALUES ('33333333-0000-0000-0000-000000000003', c1, 'Templat Skor', '{"type":"min_score","hunt_id":"' || h1::text || '","min_score":80}'::jsonb);
  INSERT INTO public.qm_certificate_templates (id, class_id, title, criteria)
    VALUES ('33333333-0000-0000-0000-000000000004', c1, 'Templat Kuiz', '{"type":"live_attended","quiz_id":"' || qz1::text || '"}'::jsonb);
  -- Templat kedua untuk ujian pengeluaran asas (blok 1).
  INSERT INTO public.qm_certificate_templates (id, class_id, title, criteria)
    VALUES ('33333333-0000-0000-0000-000000000005', c1, 'Templat Semua Kedua', '{"type":"all_members"}'::jsonb);

  PERFORM set_config('session_replication_role', 'origin', true);
END;
$seed$;

-- ---------------------------------------------------------------------
-- 1. Peserta lain tidak nampak sijil orang lain
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_id uuid;
  v_n  int;
BEGIN
  -- Keluarkan sijil untuk p1 dan p3 (templat semua, nama disahkan sahaja).
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000000a1');
  SELECT issued_ids INTO v_id FROM public.qm_issue_certificates(
            '33333333-0000-0000-0000-000000000005', NULL);

  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000000b2');
  SELECT count(*) INTO v_n FROM public.qm_certificates;
  PERFORM pg_temp.qm_verdict('a', v_n = 0,
    'p2 (tanpa sijil) nampak ' || v_n::text || ' sijil');

  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000000b1');
  SELECT count(*) INTO v_n FROM public.qm_certificates;
  PERFORM pg_temp.qm_verdict('a2', v_n = 1,
    'p1 nampak ' || v_n::text || ' sijil (sendiri sahaja)');
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- 2. Peserta tidak boleh INSERT / UPDATE sijil
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_baik boolean;
  v_n int;
BEGIN
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000000b1');
  -- Cuba UPDATE: RLS tiada polisi UPDATE untuk peserta, jadi tiada baris berubah.
  UPDATE public.qm_certificates SET name_snapshot = 'Ditukar' WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.qm_verdict('b', v_n = 0,
    'peserta UPDATE sijil: ' || v_n::text || ' baris berubah');
  -- Cuba INSERT: ditolak oleh RLS.
  BEGIN
    INSERT INTO public.qm_certificates (template_id, class_id, participant_id, name_snapshot, program_snapshot, code)
      VALUES ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-0000000000c1',
              '11111111-0000-0000-0000-0000000000b1', 'X', 'Y', 'PALSUKODE1');
    v_baik := false;
  EXCEPTION WHEN insufficient_privilege THEN v_baik := true;
  END;
  PERFORM pg_temp.qm_verdict('b2', v_baik, 'peserta tidak boleh INSERT sijil');
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- 3. Educator kelas lain tidak boleh mengeluarkan
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_id uuid;
BEGIN
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000000a2');
  BEGIN
    SELECT * INTO v_id FROM public.qm_issue_certificates('33333333-0000-0000-0000-000000000001', NULL);
    PERFORM pg_temp.qm_verdict('c', false, 'pendidik kelas lain berjaya mengeluarkan sijil');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.qm_verdict('c', SQLSTATE <> '00000' AND SQLERRM LIKE '%educator%',
      'pengeluaran oleh pendidik lain ditolak: ' || SQLERRM);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- 4. anon: tiada akses jadual; qm_verify_certificate sahaja dan tiada emel
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_n int;
  v_baris record;
BEGIN
  PERFORM pg_temp.qm_test_as_anon();
  BEGIN
    SELECT count(*) INTO v_n FROM public.qm_certificates;
    PERFORM pg_temp.qm_verdict('d', false, 'anon boleh SELECT qm_certificates');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.qm_verdict('d', true, 'anon tidak boleh SELECT qm_certificates');
  END;

  -- Fungsi pengesahan: hanya lajur selamat yang dipulangkan.
  SELECT * INTO v_baris FROM public.qm_verify_certificate('PALSU00000');
  PERFORM pg_temp.qm_verdict('d2', NOT found, 'kod tidak wujud pulangkan tiada baris');
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- 5. Kriteria bercampur: kelayakan dan pengeluaran
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  r record;
  v_p1 bool; v_p2 bool; v_p3 bool;
  v_terbit record;
  v_terbit_dua record;
BEGIN
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000000a1');

  -- hunt_completed: p1 ada penghantaran approved, p2 dan p3 tidak.
  SELECT eligible INTO v_p1 FROM public.qm_certificate_eligibility('33333333-0000-0000-0000-000000000002')
    WHERE participant_id = '11111111-0000-0000-0000-0000000000b1';
  SELECT eligible INTO v_p2 FROM public.qm_certificate_eligibility('33333333-0000-0000-0000-000000000002')
    WHERE participant_id = '11111111-0000-0000-0000-0000000000b2';
  PERFORM pg_temp.qm_verdict('e', v_p1 = true AND v_p2 = false,
    'hunt_completed: p1 layak, p2 tidak');

  -- min_score: hanya p3 (pasukan tinggi) atau p1 (skor individu penuh)
  SELECT eligible INTO v_p3 FROM public.qm_certificate_eligibility('33333333-0000-0000-0000-000000000003')
    WHERE participant_id = '11111111-0000-0000-0000-0000000000b3';
  SELECT eligible INTO v_p2 FROM public.qm_certificate_eligibility('33333333-0000-0000-0000-000000000003')
    WHERE participant_id = '11111111-0000-0000-0000-0000000000b2';
  PERFORM pg_temp.qm_verdict('e2', v_p3 = true AND v_p2 = false,
    'min_score: p3 layak (pasukan), p2 tidak');

  -- live_attended: p1 hadir, p3 tidak.
  SELECT eligible INTO v_p1 FROM public.qm_certificate_eligibility('33333333-0000-0000-0000-000000000004')
    WHERE participant_id = '11111111-0000-0000-0000-0000000000b1';
  SELECT eligible INTO v_p3 FROM public.qm_certificate_eligibility('33333333-0000-0000-0000-000000000004')
    WHERE participant_id = '11111111-0000-0000-0000-0000000000b3';
  PERFORM pg_temp.qm_verdict('e3', v_p1 = true AND v_p3 = false,
    'live_attended: p1 layak, p3 tidak');

  -- Pengeluaran: hanya yang layak DAN nama disahkan. p2 tiada nama, jadi
  -- bilangan yang dikeluarkan mesti 0 walaupun kriteria all_members.
  SELECT * INTO v_terbit FROM public.qm_issue_certificates('33333333-0000-0000-0000-000000000001', NULL);
  PERFORM pg_temp.qm_verdict('e4', v_terbit.issued_count = 2,
    'all_members: keluar ' || v_terbit.issued_count::text || ' (p2 dilangkau, nama tidak disahkan)');

  -- Panggilan kedua: semua sudah ada, tiada pendua.
  SELECT * INTO v_terbit_dua FROM public.qm_issue_certificates('33333333-0000-0000-0000-000000000001', NULL);
  PERFORM pg_temp.qm_verdict('e5', v_terbit_dua.issued_count = 0,
    'keluarkan semula: tiada pendua');

  -- Templat pelan free dengan latar: dipaksa NULL oleh penjaga pelan.
  INSERT INTO public.qm_certificate_templates (id, class_id, title, criteria, background_path, logo_path)
    VALUES ('33333333-0000-0000-0000-000000000009', '22222222-0000-0000-0000-0000000000c1',
            'Templat Free Latar', '{"type":"all_members"}'::jsonb, 'c1/latar.png', 'c1/logo.png');
  SELECT background_path INTO r FROM public.qm_certificate_templates
    WHERE id = '33333333-0000-0000-0000-000000000009';
  PERFORM pg_temp.qm_verdict('e6', r.background_path IS NULL AND r.logo_path IS NULL,
    'free: latar dan logo dipaksa NULL');

  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- 6. Pembatalan dan pengesahan
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_kod text;
  v_baris record;
BEGIN
  -- Cari kod sijil p1 (dikeluarkan dalam blok 5).
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000000a1');
  SELECT code INTO v_kod FROM public.qm_certificates
    WHERE participant_id = '11111111-0000-0000-0000-0000000000b1' LIMIT 1;

  -- anon sahkan sebelum batal: valid.
  PERFORM pg_temp.qm_test_as_anon();
  SELECT * INTO v_baris FROM public.qm_verify_certificate(v_kod);
  PERFORM pg_temp.qm_verdict('f', v_baris.status = 'valid' AND v_baris.name_snapshot = 'Aisyah Binti Rahman',
    'anon: sijil sah dikenali, status valid');
  PERFORM pg_temp.qm_test_reset();

  -- Educator batalkan.
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000000a1');
  PERFORM public.qm_revoke_certificate(
    (SELECT id FROM public.qm_certificates WHERE participant_id = '11111111-0000-0000-0000-0000000000b1' LIMIT 1),
    'Nama salah ejaan');
  PERFORM pg_temp.qm_test_reset();

  -- anon sahkan selepas batal: revoked.
  PERFORM pg_temp.qm_test_as_anon();
  SELECT * INTO v_baris FROM public.qm_verify_certificate(v_kod);
  PERFORM pg_temp.qm_verdict('f2', v_baris.status = 'revoked' AND v_baris.revoked_at IS NOT NULL,
    'anon: sijil dibatalkan pulangkan revoked');
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- 7. Penjanaan kod: 10 aksara, tiada 0/O/1/I/L, unik
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_kod text;
  v_baik boolean := true;
  v_satu text;
  v_kira int := 0;
BEGIN
  FOR i IN 1..200 LOOP
    v_satu := public.qm_certificate_code();
    IF length(v_satu) <> 10 THEN v_baik := false; END IF;
    IF v_satu ~ '[01OILO]' THEN v_baik := false; END IF;
    v_kira := v_kira + 1;
  END LOOP;
  PERFORM pg_temp.qm_verdict('g', v_baik AND v_kira = 200,
    '200 kod: panjang 10, tiada aksara terlarang');
END;
$chk$;

-- ---------------------------------------------------------------------
-- 8. Peserta tidak dikeluarkan tanpa nama disahkan (semakan terus)
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_r record;
BEGIN
  PERFORM pg_temp.qm_test_as('11111111-0000-0000-0000-0000000000a1');
  SELECT name_confirmed, certificate_name INTO v_r
    FROM public.qm_certificate_eligibility('33333333-0000-0000-0000-000000000001')
   WHERE participant_id = '11111111-0000-0000-0000-0000000000b2';
  PERFORM pg_temp.qm_verdict('h', v_r.name_confirmed = false AND v_r.certificate_name IS NULL,
    'p2: name_confirmed false, certificate_name NULL');
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
