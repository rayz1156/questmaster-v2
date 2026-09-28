-- 0041_kuota_storan.sql
--
-- Kuota storan fail (tiket V2-002b). Fail papan dimuat naik ke FileLu tanpa
-- rekod saiz, jadi kuota tidak boleh dikuatkuasakan. Tiga bahagian:
--   1. Jadual qm_file_usage: SATU rekod bagi setiap fail yang sampai ke storan.
--   2. qm_reserve_upload / qm_record_upload: semakan kuota sebelum dan sesudah
--      bait dihantar. Laluan API memanggil reserve SEBELUM, record SELEPAS.
--   3. qm_my_plan_usage (0040) pulangkan usage.storage_bytes untuk meter UI.
--
-- Nota SECURITY DEFINER: current_user di dalam fungsi DEFINER ialah pemilik
-- fungsi, jadi semakan pemanggil dibuat melalui auth.uid() dan bacaan profil
-- secara langsung (corak 0033 baris 251 hingga 264), bukan
-- qm_caller_is_privileged yang sentiasa benar di sini. auth.uid() masih
-- berfungsi kerana ia membaca GUC request.jwt.claims, bukan current_user.
--
-- Isi semula TIDAK dilakukan: fail sedia ada sebelum migrasi ini tiada rekod
-- saiz dan tidak dikira dalam kuota (keputusan tiket, baris 18).
--
-- Tiada BEGIN/COMMIT dalam fail ini (peraturan migrasi). Jalankan dengan
-- psql -1 supaya satu transaksi.

-- ---------------------------------------------------------------------
-- 1. Jadual qm_file_usage
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qm_file_usage (
  id         uuid primary key default gen_random_uuid(),
  file_code  text not null,
  bytes      bigint not null check (bytes > 0),
  mime       text,
  class_id   uuid references public.qm_classes(id) on delete set null,
  owner_id   uuid not null references public.qm_profiles(id) on delete cascade,
  uploaded_by uuid references public.qm_profiles(id) on delete set null,
  source     text not null,
  created_at timestamptz not null default now()
);

-- Kiraan kuota sentiasa menapis owner_id.
CREATE INDEX IF NOT EXISTS qm_file_usage_owner_idx ON public.qm_file_usage(owner_id);
-- Kiraan kuota institusi menyertai qm_profiles.institution_id.
CREATE INDEX IF NOT EXISTS qm_file_usage_created_idx ON public.qm_file_usage(created_at);

ALTER TABLE public.qm_file_usage ENABLE ROW LEVEL SECURITY;

-- Bacaan: pemilik kuota sahaja, atau pentadbir. Pentadbir dinilai dengan
-- qm_is_admin() yang dipakai oleh 0040 (baris 58).
DROP POLICY IF EXISTS p_fu_owner_read ON public.qm_file_usage;
CREATE POLICY p_fu_owner_read ON public.qm_file_usage
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.qm_is_admin());

-- Tiada INSERT/UPDATE/DELETE untuk authenticated: tulisan hanya melalui
-- qm_reserve_upload / qm_record_upload. REVOKE dilakukan dua kali sengaja:
-- default privileges supabase boleh memberi authenticated akses penuh.
REVOKE ALL ON public.qm_file_usage FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.qm_file_usage FROM authenticated;
GRANT SELECT ON public.qm_file_usage TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Pembantu kongsi kedua-dua fungsi
-- ---------------------------------------------------------------------
-- Jumlah bait yang sudah digunakan oleh pemilik kuota. Untuk institution,
-- jumlah dikongsi merentas semua ahli institution_id yang sama.
CREATE OR REPLACE FUNCTION public.qm_storage_used(p_owner uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH inst AS (
    SELECT p.institution_id FROM public.qm_profiles p WHERE p.id = p_owner
  )
  SELECT CASE
    WHEN (SELECT institution_id FROM inst) IS NOT NULL THEN
      (SELECT COALESCE(sum(f.bytes), 0)::bigint
         FROM public.qm_file_usage f
         JOIN public.qm_profiles pp ON pp.id = f.owner_id
        WHERE pp.institution_id = (SELECT institution_id FROM inst))
    ELSE
      (SELECT COALESCE(sum(f.bytes), 0)::bigint
         FROM public.qm_file_usage f
        WHERE f.owner_id = p_owner)
  END;
$fn$;

-- ---------------------------------------------------------------------
-- 3. qm_reserve_upload: semakan SEBELUM bait dihantar ke FileLu.
--    p_class NULL bermakna muat naik profil (owner = pemanggil sendiri).
--    Pulangkan {owner_id, file_mb, storage_mb, used_bytes}.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_reserve_upload(
  p_class uuid,
  p_bytes bigint,
  p_mime  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_owner  uuid;
  v_role   text;
  v_plan   text;
  v_file_mb  bigint;
  v_store_mb bigint;
  v_used     bigint;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'QM_FORBIDDEN: anda mesti log masuk untuk memuat naik fail'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_bytes IS NULL OR p_bytes <= 0 THEN
    RAISE EXCEPTION 'QM_LIMIT_FILE_SIZE: Saiz fail mesti lebih daripada sifar.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Video disekat untuk semua pelan (v2). Semakan mime di pelayan kerana
  -- klien boleh diubah suai.
  IF COALESCE(p_mime, '') LIKE 'video/%' THEN
    RAISE EXCEPTION 'QM_VIDEO_BLOCKED: Video files are not supported. Paste a YouTube or Google Drive link instead.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Tentukan pemilik kuota dan sahkan pemanggil berhak.
  IF p_class IS NOT NULL THEN
    SELECT c.owner_id INTO v_owner FROM public.qm_classes c WHERE c.id = p_class;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'QM_NOT_FOUND: Kelas tidak dijumpai.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_caller <> v_owner
       AND NOT EXISTS (
         SELECT 1 FROM public.qm_class_educators ce
          WHERE ce.class_id = p_class
            AND ce.educator_id = v_caller
            AND ce.accepted_at IS NOT NULL)
       AND NOT EXISTS (
         SELECT 1 FROM public.qm_class_members m
          WHERE m.class_id = p_class
            AND m.user_id = v_caller) THEN
      RAISE EXCEPTION 'QM_FORBIDDEN: Anda bukan ahli kelas ini.'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- Muat naik profil: kuota diri sendiri, tiada kelas.
    v_owner := v_caller;
  END IF;

  -- Had daripada SATU sumber: pelan berkesan pemilik kuota.
  v_plan := public.qm_effective_plan(v_owner);
  v_file_mb  := (public.qm_plan_limits(v_plan) ->> 'file_mb')::bigint;
  v_store_mb := (public.qm_plan_limits(v_plan) ->> 'storage_mb')::bigint;

  IF p_bytes > v_file_mb * 1024 * 1024 THEN
    RAISE EXCEPTION 'QM_LIMIT_FILE_SIZE: File exceeds the % MB per-file limit of your plan.',
      v_file_mb
      USING ERRCODE = 'P0001';
  END IF;

  v_used := public.qm_storage_used(v_owner);
  IF v_used + p_bytes > v_store_mb * 1024 * 1024 THEN
    RAISE EXCEPTION 'QM_LIMIT_STORAGE: Storage quota is full (% MB used of % MB). Delete old files or upgrade.',
      v_used / (1024 * 1024), v_store_mb
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'owner_id',   v_owner,
    'file_mb',    v_file_mb,
    'storage_mb', v_store_mb,
    'used_bytes', v_used);
END;
$fn$;

REVOKE ALL ON FUNCTION public.qm_reserve_upload(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_reserve_upload(uuid, bigint, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. qm_record_upload: ulang SEMUA semakan (jangan percaya klien) dan
--    masukkan rekod. Dipanggil SELEPAS fail berjaya sampai ke storan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_record_upload(
  p_class     uuid,
  p_file_code text,
  p_bytes     bigint,
  p_mime      text,
  p_source    text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_owner  uuid;
  v_plan   text;
  v_file_mb  bigint;
  v_store_mb bigint;
  v_used     bigint;
  v_id       uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'QM_FORBIDDEN: anda mesti log masuk untuk memuat naik fail'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_file_code IS NULL OR btrim(p_file_code) = '' THEN
    RAISE EXCEPTION 'QM_LIMIT_FILE_SIZE: file_code mesti diisi.'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_bytes IS NULL OR p_bytes <= 0 THEN
    RAISE EXCEPTION 'QM_LIMIT_FILE_SIZE: Saiz fail mesti lebih daripada sifar.'
      USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(p_mime, '') LIKE 'video/%' THEN
    RAISE EXCEPTION 'QM_VIDEO_BLOCKED: Video files are not supported. Paste a YouTube or Google Drive link instead.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Ulang semakan keahlian yang sama seperti qm_reserve_upload. Rekod
  -- palsu tidak boleh menambah kuota orang lain: pemanggil mesti ahli
  -- kelas itu, atau pemiliknya, atau pemilik kuota untuk fail profil.
  IF p_class IS NOT NULL THEN
    SELECT c.owner_id INTO v_owner FROM public.qm_classes c WHERE c.id = p_class;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'QM_NOT_FOUND: Kelas tidak dijumpai.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_caller <> v_owner
       AND NOT EXISTS (
         SELECT 1 FROM public.qm_class_educators ce
          WHERE ce.class_id = p_class
            AND ce.educator_id = v_caller
            AND ce.accepted_at IS NOT NULL)
       AND NOT EXISTS (
         SELECT 1 FROM public.qm_class_members m
          WHERE m.class_id = p_class
            AND m.user_id = v_caller) THEN
      RAISE EXCEPTION 'QM_FORBIDDEN: Anda bukan ahli kelas ini.'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_owner := v_caller;
  END IF;

  v_plan := public.qm_effective_plan(v_owner);
  v_file_mb  := (public.qm_plan_limits(v_plan) ->> 'file_mb')::bigint;
  v_store_mb := (public.qm_plan_limits(v_plan) ->> 'storage_mb')::bigint;

  IF p_bytes > v_file_mb * 1024 * 1024 THEN
    RAISE EXCEPTION 'QM_LIMIT_FILE_SIZE: File exceeds the % MB per-file limit of your plan.',
      v_file_mb
      USING ERRCODE = 'P0001';
  END IF;

  v_used := public.qm_storage_used(v_owner);
  IF v_used + p_bytes > v_store_mb * 1024 * 1024 THEN
    RAISE EXCEPTION 'QM_LIMIT_STORAGE: Storage quota is full (% MB used of % MB). Delete old files or upgrade.',
      v_used / (1024 * 1024), v_store_mb
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.qm_file_usage
    (file_code, bytes, mime, class_id, owner_id, uploaded_by, source)
  VALUES
    (p_file_code, p_bytes, p_mime, p_class, v_owner, v_caller,
     COALESCE(nullif(btrim(COALESCE(p_source, '')), ''), 'unknown'))
  RETURNING public.qm_file_usage.id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.qm_record_upload(uuid, text, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_record_upload(uuid, text, bigint, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. qm_my_plan_usage (0040) pulangkan usage.storage_bytes untuk meter UI.
--    Storan pengguna = kuota pemilik kuotanya sendiri (institusi jika
--    dia ahli institusi, jika tidak dirinya). Fail yang dimuat naik ke
--    kelas orang lain dikira dalam kuota pemilik kelas, bukan di sini.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_my_plan_usage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_plan text;
  v_exp  timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'QM_UNAUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.plan, p.plan_expires_at INTO v_plan, v_exp
    FROM public.qm_profiles p WHERE p.id = v_uid;

  RETURN jsonb_build_object(
    'plan',           v_plan,
    'effective_plan', public.qm_effective_plan(v_uid),
    'expires_at',     v_exp,
    'limits',         public.qm_plan_limits(public.qm_effective_plan(v_uid)),
    'usage', jsonb_build_object(
      'classes',       (SELECT count(*)::int FROM public.qm_classes c WHERE c.owner_id = v_uid),
      'activities',    public.qm_activity_count(v_uid),
      'boards',        public.qm_board_count(v_uid),
      'storage_bytes', public.qm_storage_used(v_uid)
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.qm_my_plan_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_my_plan_usage() TO authenticated;

GRANT EXECUTE ON FUNCTION public.qm_storage_used(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
