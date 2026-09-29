-- 0047_ruang_kerja_admin.sql
-- Asas pelayan ruang kerja admin (V2-011a):
--   1. qm_audit_log menjadi tambah sahaja (append-only): polisi ALL lama
--      dibuang, diganti dengan SELECT dan INSERT sahaja. Tiada polisi
--      UPDATE atau DELETE dan kebenaran UPDATE/DELETE/TRUNCATE ditarik.
--      Pencetus penyekat UPDATE sengaja tidak ditambah kerana FK
--      qm_audit_log_actor_id_fkey ON DELETE SET NULL (0027) perlu
--      membuat UPDATE ke atas lajur actor_id apabila profil dibuang.
--      service_role memintas RLS dan itu dijangka (laluan
--      /api/admin/users/verify menulis melaluinya).
--   2. qm_admin_aktif(): pentadbir yang BENAR-BENAR boleh bertindak,
--      iaitu admin atau superadmin yang tidak digantung. qm_is_admin()
--      sedia ada TIDAK diubah kerana ia dipakai oleh banyak polisi lain.
--   3. Tiga tindakan admin beralasan sebagai fungsi SECURITY DEFINER,
--      semua menulis rekod audit dengan sebab serta before/after:
--        qm_admin_set_suspended, qm_admin_set_challenge_points,
--        qm_admin_override_submission.
--      Setiap fungsi menolak pentadbir yang digantung, mewajibkan alasan
--      5 hingga 500 aksara, dan tidak pernah membenarkan sasaran diri
--      sendiri atau superadmin. Sasaran admin hanya oleh superadmin.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Audit tambah sahaja -----------------------------------------------
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS qm_audit_log_admin_all ON public.qm_audit_log;

CREATE POLICY qm_audit_log_admin_select
  ON public.qm_audit_log
  FOR SELECT
  TO authenticated
  USING (public.qm_admin_aktif());

CREATE POLICY qm_audit_log_admin_insert
  ON public.qm_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.qm_admin_aktif() AND actor_id = auth.uid());

-- Baca sahaja. UPDATE dan DELETE disekat pada dua peringkat: kebenaran
-- jadual dan ketiadaan polisi. TRUNCATE juga ditarik supaya log tidak
-- boleh dikosongkan.
REVOKE UPDATE, DELETE, TRUNCATE ON public.qm_audit_log FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Pentadbir aktif ----------------------------------------------------
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.qm_admin_aktif()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.qm_profiles
    WHERE qm_profiles.id = auth.uid()
      AND qm_profiles.role IN ('admin', 'superadmin')
      AND coalesce(qm_profiles.suspended, false) = false
  );
$fn$;

REVOKE ALL ON FUNCTION public.qm_admin_aktif() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_admin_aktif() TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Gantung dan buka gantungan akaun ----------------------------------
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.qm_admin_set_suspended(p_user uuid, p_suspended boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_role  text;
  v_lama  boolean;
  v_baru  boolean;
  v_panggil text;
BEGIN
  IF NOT public.qm_admin_aktif() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  IF p_user = auth.uid() THEN
    RAISE EXCEPTION 'cannot_target_self' USING ERRCODE = '42501';
  END IF;

  SELECT qm_profiles.role, qm_profiles.suspended
    INTO v_role, v_lama
    FROM public.qm_profiles
   WHERE qm_profiles.id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Superadmin tidak boleh digantung oleh sesiapa.
  IF v_role = 'superadmin' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Sasaran admin: hanya superadmin dibenarkan.
  IF v_role = 'admin' THEN
    SELECT qm_profiles.role INTO v_panggil
      FROM public.qm_profiles
     WHERE qm_profiles.id = auth.uid();
    IF v_panggil IS DISTINCT FROM 'superadmin' THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_baru := coalesce(p_suspended, false);

  -- Keadaan sudah sama: pulang tanpa menulis apa-apa ke audit.
  IF coalesce(v_lama, false) = v_baru THEN
    RETURN;
  END IF;

  UPDATE public.qm_profiles
     SET suspended = v_baru
   WHERE qm_profiles.id = p_user;

  INSERT INTO public.qm_audit_log (actor_id, action, target_type, target_id, meta)
  VALUES (
    auth.uid(),
    CASE WHEN v_baru THEN 'user_suspend' ELSE 'user_unsuspend' END,
    'profile',
    p_user::text,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'before', jsonb_build_object('suspended', v_lama),
      'after',  jsonb_build_object('suspended', v_baru)
    )
  );
END;
$fn$;

-- ---------------------------------------------------------------------
-- 4. Ubah mata soalan ---------------------------------------------------
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.qm_admin_set_challenge_points(p_challenge uuid, p_points integer, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_hunt  uuid;
  v_title text;
  v_lama  integer;
BEGIN
  IF NOT public.qm_admin_aktif() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  IF p_points IS NULL OR p_points < 0 OR p_points > 100000 THEN
    RAISE EXCEPTION 'invalid_points' USING ERRCODE = '22023';
  END IF;

  SELECT qm_challenges.hunt_id, qm_challenges.title, qm_challenges.points
    INTO v_hunt, v_title, v_lama
    FROM public.qm_challenges
   WHERE qm_challenges.id = p_challenge;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Keadaan sudah sama: pulang tanpa menulis apa-apa ke audit.
  IF v_lama = p_points THEN
    RETURN;
  END IF;

  -- qm_guard_plan_challenges ialah BEFORE INSERT sahaja (0030), jadi
  -- UPDATE ini tidak terjejas oleh pengawal pelan.
  UPDATE public.qm_challenges
     SET points = p_points
   WHERE qm_challenges.id = p_challenge;

  INSERT INTO public.qm_audit_log (actor_id, action, target_type, target_id, meta)
  VALUES (
    auth.uid(),
    'challenge_points',
    'challenge',
    p_challenge::text,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'hunt_id', v_hunt,
      'title', v_title,
      'before', jsonb_build_object('points', v_lama),
      'after',  jsonb_build_object('points', p_points)
    )
  );
END;
$fn$;

-- ---------------------------------------------------------------------
-- 5. Pintasan keputusan moderasi ----------------------------------------
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.qm_admin_override_submission(p_submission uuid, p_status text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_challenge_id uuid;
  v_user_id      uuid;
  v_team_id      uuid;
  v_status_lama  text;
  v_review_lama  uuid;
  v_review_baru  uuid;
BEGIN
  IF NOT public.qm_admin_aktif() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT qm_submissions.challenge_id, qm_submissions.user_id, qm_submissions.team_id,
         qm_submissions.status, qm_submissions.reviewed_by
    INTO v_challenge_id, v_user_id, v_team_id, v_status_lama, v_review_lama
    FROM public.qm_submissions
   WHERE qm_submissions.id = p_submission;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Keadaan sudah sama: pulang tanpa menulis apa-apa ke audit.
  IF v_status_lama = p_status THEN
    RETURN;
  END IF;

  v_review_baru := CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END;

  -- qm_guard_submission_review membenarkan pemanggil privileged; fungsi
  -- ini SECURITY DEFINER (owner postgres) jadi pengawal meluluskannya.
  UPDATE public.qm_submissions
     SET status = p_status,
         reviewed_by = v_review_baru
   WHERE qm_submissions.id = p_submission;

  INSERT INTO public.qm_audit_log (actor_id, action, target_type, target_id, meta)
  VALUES (
    auth.uid(),
    'moderation_override',
    'submission',
    p_submission::text,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'challenge_id', v_challenge_id,
      'user_id', v_user_id,
      'team_id', v_team_id,
      'before', jsonb_build_object('status', v_status_lama, 'reviewed_by', v_review_lama),
      'after',  jsonb_build_object('status', p_status,      'reviewed_by', v_review_baru)
    )
  );
END;
$fn$;

-- ---------------------------------------------------------------------
-- 6. Kebenaran pelaksanaan ----------------------------------------------
-- ---------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.qm_admin_set_suspended(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_admin_set_suspended(uuid, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.qm_admin_set_challenge_points(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_admin_set_challenge_points(uuid, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.qm_admin_override_submission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_admin_override_submission(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;