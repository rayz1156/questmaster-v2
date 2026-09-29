-- 0048_padam_pengguna_selamat.sql (CTO, V2-011, temuan kzsec V2-011b P1)
-- qm_admin_delete_user lama hanya menyemak qm_current_role() = 'admin':
-- admin boleh memadam dirinya sendiri atau superadmin melalui RPC terus,
-- admin yang digantung masih boleh memadam, dan tiada rekod audit dibuat
-- di pelayan. Versi ini menyelaraskannya dengan fungsi 0047:
--   * pemanggil mesti qm_admin_aktif() (admin atau superadmin, tidak digantung);
--   * tidak boleh memadam diri sendiri;
--   * superadmin tidak boleh dipadam melalui RPC ini;
--   * sasaran admin hanya boleh dipadam oleh superadmin;
--   * rekod audit 'delete_user' ditulis SEBELUM pemadaman dengan salinan
--     ringkas profil (nama, peranan) supaya jejak kekal selepas profil hilang.
-- Tandatangan (target uuid) dikekalkan supaya klien sedia ada terus berfungsi.

BEGIN;

CREATE OR REPLACE FUNCTION public.qm_admin_delete_user(target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_role    text;
  v_nama    text;
  v_panggil text;
BEGIN
  IF NOT public.qm_admin_aktif() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF target IS NULL OR target = auth.uid() THEN
    RAISE EXCEPTION 'cannot_target_self' USING ERRCODE = '42501';
  END IF;

  SELECT p.role, p.display_name INTO v_role, v_nama
    FROM public.qm_profiles p WHERE p.id = target;

  IF v_role = 'superadmin' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'admin' THEN
    SELECT p.role INTO v_panggil FROM public.qm_profiles p WHERE p.id = auth.uid();
    IF v_panggil IS DISTINCT FROM 'superadmin' THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.qm_audit_log (actor_id, action, target_type, target_id, meta)
  VALUES (
    auth.uid(), 'delete_user', 'profile', target::text,
    jsonb_build_object('before', jsonb_build_object('display_name', v_nama, 'role', v_role))
  );

  DELETE FROM public.qm_profiles WHERE id = target;
  DELETE FROM auth.users WHERE id = target;
END;
$fn$;

REVOKE ALL ON FUNCTION public.qm_admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_admin_delete_user(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
