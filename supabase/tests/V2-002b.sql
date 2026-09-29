-- V2-002b.sql
--
-- Ujian SQL untuk migrasi 0041_kuota_storan.sql. Jalankan di VPS selepas migrasi:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/V2-002b.sql
-- Semua data dalam SATU transaksi dan dibatalkan dengan ROLLBACK, jadi tiada
-- data kekal. Corak sama seperti supabase/tests/V2-002a.sql.
--
-- Senario tiket (baris 36):
--   a  fail 11MB ditolak pada free
--   b  fail 11MB diterima pada pro
--   c  fail 21MB ditolak pada pro
--   d1 video/mp4 ditolak pada free; d2 pada pro
--   d3 video/mp4 500MB DITERIMA pada unlimited (V2-002b-baiki)
--   d4 video/mp4 500MB ditolak pada pro (video yang sama seperti d3)
--   e  jumlah melebihi 100MB ditolak pada free
--   f  peserta yang bukan ahli kelas ditolak
--   g  fail penghantaran peserta dikira dalam kuota pemilik kelas
--      (pemilik kelas BERBEZA daripada e supaya tiada pertindihan kuota)
--   h  authenticated tidak boleh INSERT terus ke qm_file_usage
--   i  pengguna A tidak nampak rekod B

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
-- S. Data bercampur. u_free (storage_mb 100) dan u_pro (storage_mb 1024).
--    ID tetap supaya setiap blok boleh merujuknya.
-- ---------------------------------------------------------------------
DO $seed$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  u_pro  uuid := '11111111-1111-1111-1111-111111111201';
  u_asal uuid := '11111111-1111-1111-1111-111111111301';
  u_ahli uuid := '11111111-1111-1111-1111-111111111401';
  u_own  uuid := '11111111-1111-1111-1111-111111111501';
  u_ahli2 uuid := '11111111-1111-1111-1111-111111111601';
  u_unl  uuid := '11111111-1111-1111-1111-111111111701';
  c_f    uuid := '22222222-2222-2222-2222-222222222101';
  c_p    uuid := '22222222-2222-2222-2222-222222222201';
  c_g    uuid := '22222222-2222-2222-2222-222222222301';
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);

  INSERT INTO public.qm_profiles (id, role, plan) VALUES
    (u_free, 'educator', 'free'),
    (u_pro,  'educator', 'pro'),
    (u_asal, 'educator', 'pro'),
    (u_ahli, 'participant', 'free'),
    (u_own,  'educator', 'pro'),
    (u_ahli2, 'participant', 'free'),
    (u_unl,  'educator', 'unlimited');

  INSERT INTO public.qm_classes (id, owner_id, name) VALUES
    (c_f, u_free, 'Kelas Free'),
    (c_p, u_pro,  'Kelas Pro'),
    -- Kelas terpisah untuk senario g supaya rekod penghantaran peserta
    -- tidak bertindih dengan kuota u_free yang dipenuhi dalam senario e.
    (c_g, u_own,  'Kelas Hantaran');

  -- Ahli kelas c_f: u_ahli (untuk semakan kebenaran ahli, tanpa rekod kuota).
  INSERT INTO public.qm_class_members (class_id, user_id) VALUES (c_f, u_ahli);
  -- Ahli kelas c_g: u_ahli2 (senario g; pemilik kelas ialah u_own).
  INSERT INTO public.qm_class_members (class_id, user_id) VALUES (c_g, u_ahli2);

  PERFORM set_config('session_replication_role', 'origin', true);
END;
$seed$;

-- ---------------------------------------------------------------------
-- a. Fail 11MB ditolak pada free (file_mb 10)
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  c_f    uuid := '22222222-2222-2222-2222-222222222101';
BEGIN
  PERFORM pg_temp.qm_test_as(u_free);
  BEGIN
    PERFORM public.qm_reserve_upload(c_f, 11 * 1024 * 1024, 'application/pdf');
    PERFORM pg_temp.qm_verdict('a', false, 'fail 11MB free TIDAK ditolak');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_FILE_SIZE:%' THEN
        PERFORM pg_temp.qm_verdict('a', true, 'fail 11MB ditolak pada free (QM_LIMIT_FILE_SIZE)');
      ELSE
        PERFORM pg_temp.qm_verdict('a', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- b. Fail 11MB diterima pada pro (file_mb 20) dan direkod
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_pro uuid := '11111111-1111-1111-1111-111111111201';
  c_p   uuid := '22222222-2222-2222-2222-222222222201';
  v_res jsonb;
BEGIN
  PERFORM pg_temp.qm_test_as(u_pro);
  BEGIN
    v_res := public.qm_reserve_upload(c_p, 11 * 1024 * 1024, 'application/pdf');
    PERFORM public.qm_record_upload(c_p, 's5__ujian11mb', 11 * 1024 * 1024, 'application/pdf', 'learning_board');
    IF (v_res ->> 'file_mb')::bigint = 20 THEN
      PERFORM pg_temp.qm_verdict('b', true, 'fail 11MB diterima pada pro dan direkod');
    ELSE
      PERFORM pg_temp.qm_verdict('b', false, 'file_mb salah: ' || COALESCE(v_res ->> 'file_mb', 'null'));
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('b', false, 'pro ditolak secara salah: ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- c. Fail 21MB ditolak pada pro (file_mb 20)
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_pro uuid := '11111111-1111-1111-1111-111111111201';
  c_p   uuid := '22222222-2222-2222-2222-222222222201';
BEGIN
  PERFORM pg_temp.qm_test_as(u_pro);
  BEGIN
    PERFORM public.qm_reserve_upload(c_p, 21 * 1024 * 1024, 'application/pdf');
    PERFORM pg_temp.qm_verdict('c', false, 'fail 21MB pro TIDAK ditolak');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_FILE_SIZE:%' THEN
        PERFORM pg_temp.qm_verdict('c', true, 'fail 21MB ditolak pada pro (QM_LIMIT_FILE_SIZE)');
      ELSE
        PERFORM pg_temp.qm_verdict('c', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- d. video/mp4 ditolak untuk free dan pro
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  c_f    uuid := '22222222-2222-2222-2222-222222222101';
BEGIN
  PERFORM pg_temp.qm_test_as(u_free);
  BEGIN
    PERFORM public.qm_reserve_upload(c_f, 1 * 1024 * 1024, 'video/mp4');
    PERFORM pg_temp.qm_verdict('d1', false, 'video free TIDAK ditolak');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_VIDEO_BLOCKED:%' THEN
        PERFORM pg_temp.qm_verdict('d1', true, 'video/mp4 ditolak pada free (QM_VIDEO_BLOCKED)');
      ELSE
        PERFORM pg_temp.qm_verdict('d1', false, 'ralat lain: ' || sqlerrm);
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
    PERFORM public.qm_reserve_upload(c_p, 1 * 1024 * 1024, 'video/mp4');
    PERFORM pg_temp.qm_verdict('d2', false, 'video pro TIDAK ditolak');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_VIDEO_BLOCKED:%' THEN
        PERFORM pg_temp.qm_verdict('d2', true, 'video/mp4 ditolak pada pro (QM_VIDEO_BLOCKED)');
      ELSE
        PERFORM pg_temp.qm_verdict('d2', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- d3. video/mp4 500MB DITERIMA pada unlimited (V2-002b-baiki): pelan
--     dengan kunci video = true lulus tanpa had saiz fail atau storan.
--     Muat naik profil (p_class NULL), jadi pemilik kuota ialah pemanggil.
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_unl uuid := '11111111-1111-1111-1111-111111111701';
BEGIN
  PERFORM pg_temp.qm_test_as(u_unl);
  BEGIN
    PERFORM public.qm_reserve_upload(NULL, 500 * 1024 * 1024, 'video/mp4');
    PERFORM pg_temp.qm_verdict('d3', true, 'unlimited diterima untuk video/mp4 500MB (kunci video = true)');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('d3', false, 'unlimited ditolak secara salah: ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- d4. Video yang sama (500MB, video/mp4) ditolak pada pro: pelan pro
--     mempunyai kunci video = false, jadi QM_VIDEO_BLOCKED diutamakan.
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_pro uuid := '11111111-1111-1111-1111-111111111201';
BEGIN
  PERFORM pg_temp.qm_test_as(u_pro);
  BEGIN
    PERFORM public.qm_reserve_upload(NULL, 500 * 1024 * 1024, 'video/mp4');
    PERFORM pg_temp.qm_verdict('d4', false, 'video 500MB pro TIDAK ditolak');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_VIDEO_BLOCKED:%' THEN
        PERFORM pg_temp.qm_verdict('d4', true, 'video/mp4 500MB ditolak pada pro (QM_VIDEO_BLOCKED)');
      ELSE
        PERFORM pg_temp.qm_verdict('d4', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- e. Jumlah melebihi 100MB ditolak pada free (storage_mb 100).
--    Setiap fail 10MB (tepat pada had fail free, tidak melepasinya).
--    Sepuluh rekod = 100MB; kesebelas melepasi jumlah dan ditolak.
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  c_f    uuid := '22222222-2222-2222-2222-222222222101';
  v_i    int;
BEGIN
  PERFORM pg_temp.qm_test_as(u_free);
  -- Sepuluh rekod 10MB = 100MB, tepat pada kuota. Setiap satu mesti berjaya.
  BEGIN
    FOR v_i IN 1..10 LOOP
      PERFORM public.qm_record_upload(c_f, 's5__timbunan' || v_i, 10 * 1024 * 1024, 'application/zip', 'learning_board');
    END LOOP;
    PERFORM pg_temp.qm_verdict('e1', true, 'sepuluh fail 10MB diterima (100MB tepat pada kuota)');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('e1', false, 'timbunan gagal lebih awal: ' || sqlerrm);
  END;
  -- Kesebelas menolak: 100 + 10 = 110MB > 100MB.
  BEGIN
    PERFORM public.qm_record_upload(c_f, 's5__timbunan11', 10 * 1024 * 1024, 'application/zip', 'learning_board');
    PERFORM pg_temp.qm_verdict('e2', false, 'fail kesebelas free TIDAK ditolak');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_LIMIT_STORAGE:%' THEN
        PERFORM pg_temp.qm_verdict('e2', true, 'jumlah melebihi 100MB ditolak pada free (QM_LIMIT_STORAGE)');
      ELSE
        PERFORM pg_temp.qm_verdict('e2', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- f. Peserta yang bukan ahli kelas ditolak (bukan pemilik, bukan educator,
--    bukan ahli)
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_asal uuid := '11111111-1111-1111-1111-111111111301';
  c_f    uuid := '22222222-2222-2222-2222-222222222101';
BEGIN
  PERFORM pg_temp.qm_test_as(u_asal);
  BEGIN
    PERFORM public.qm_reserve_upload(c_f, 1 * 1024 * 1024, 'application/pdf');
    PERFORM pg_temp.qm_verdict('f', false, 'bukan ahli TIDAK ditolak');
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm LIKE 'QM_FORBIDDEN:%' THEN
        PERFORM pg_temp.qm_verdict('f', true, 'peserta bukan ahli kelas ditolak (QM_FORBIDDEN)');
      ELSE
        PERFORM pg_temp.qm_verdict('f', false, 'ralat lain: ' || sqlerrm);
      END IF;
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- g. Fail penghantaran peserta dikira dalam kuota PEMILIK KELAS:
--    u_ahli2 (free) memuat naik ke kelas c_g milik u_own (pro). Pemilik
--    kelas BERBEZA daripada senario e supaya tiada pertindihan kuota.
--    Selepas itu qm_storage_used(u_own) meningkat, bukan u_ahli2.
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_own   uuid := '11111111-1111-1111-1111-111111111501';
  u_ahli2 uuid := '11111111-1111-1111-1111-111111111601';
  c_g     uuid := '22222222-2222-2222-2222-222222222301';
  v_before bigint;
  v_after  bigint;
  v_row  record;
BEGIN
  v_before := public.qm_storage_used(u_own);
  PERFORM pg_temp.qm_test_as(u_ahli2);
  BEGIN
    PERFORM public.qm_record_upload(c_g, 's5__hantaransesi', 5 * 1024 * 1024, 'image/png', 'submission_board');
    PERFORM pg_temp.qm_verdict('g1', true, 'ahli kelas dibenarkan memuat naik ke kelas');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('g1', false, 'ahli ditolak secara salah: ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();

  SELECT owner_id, bytes INTO v_row FROM public.qm_file_usage
   WHERE file_code = 's5__hantaransesi';
  v_after := public.qm_storage_used(u_own);
  IF v_row.owner_id = u_own AND v_after = v_before + 5 * 1024 * 1024 THEN
    PERFORM pg_temp.qm_verdict('g2', true, 'fail penghantaran dikira dalam kuota pemilik kelas');
  ELSE
    PERFORM pg_temp.qm_verdict('g2', false,
      format('owner=%s bytes=%s used %s -> %s', v_row.owner_id, v_row.bytes, v_before, v_after));
  END IF;
END;
$chk$;

-- ---------------------------------------------------------------------
-- h. authenticated tidak boleh INSERT terus ke qm_file_usage
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  c_f    uuid := '22222222-2222-2222-2222-222222222101';
BEGIN
  PERFORM pg_temp.qm_test_as(u_free);
  BEGIN
    INSERT INTO public.qm_file_usage (file_code, bytes, mime, class_id, owner_id, source)
      VALUES ('s5__pintasan', 1024, 'application/pdf', c_f, u_free, 'pintasan');
    PERFORM pg_temp.qm_verdict('h', false, 'authenticated boleh INSERT terus (pintasan wujud!)');
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM pg_temp.qm_verdict('h', true, 'authenticated tidak boleh INSERT terus ke qm_file_usage');
    WHEN OTHERS THEN
      PERFORM pg_temp.qm_verdict('h', true, 'INSERT terus ditolak: ' || sqlerrm);
  END;
  PERFORM pg_temp.qm_test_reset();
END;
$chk$;

-- ---------------------------------------------------------------------
-- i. Pengguna A tidak nampak rekod B (RLS SELECT)
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  u_free uuid := '11111111-1111-1111-1111-111111111101';
  u_pro  uuid := '11111111-1111-1111-1111-111111111201';
  c_p    uuid := '22222222-2222-2222-2222-222222222201';
  v_n    int;
BEGIN
  PERFORM pg_temp.qm_test_as(u_pro);
  SELECT count(*) INTO v_n FROM public.qm_file_usage WHERE file_code LIKE 's5__%';
  PERFORM pg_temp.qm_verdict('i1', v_n >= 1, format('pemilik nampak rekod sendiri (%s baris)', v_n));
  PERFORM pg_temp.qm_test_reset();

  PERFORM pg_temp.qm_test_as(u_free);
  SELECT count(*) INTO v_n FROM public.qm_file_usage WHERE file_code = 's5__ujian11mb';
  PERFORM pg_temp.qm_verdict('i2', v_n = 0, format('A tidak nampak rekod B (%s baris)', v_n));
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
