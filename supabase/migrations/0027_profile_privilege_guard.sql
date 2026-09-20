-- 0027_profile_privilege_guard.sql
-- Dua pembetulan yang berkaitan rapat:
--   1. Pengguna biasa tidak lagi boleh mengubah medan kuasa pada profil
--      sendiri. Sebelum ini dasar qm_profiles_self_update membenarkan
--      kemas kini seluruh baris sendiri, termasuk lajur role, approved dan
--      suspended, jadi sesiapa yang mempunyai akaun boleh menjadikan diri
--      mereka superadmin dengan satu permintaan PostgREST.
--   2. Pendaftaran baharu menghormati peranan yang dipilih. Sebelum ini
--      pencetus sentiasa menulis 'participant' dengan approved = true, jadi
--      pintu kelulusan pendidik tidak pernah boleh menjadi benar.

BEGIN;

-- 1. Pengawal medan kuasa -------------------------------------------------
-- Nota penting: fungsi ini SECURITY INVOKER dengan sengaja. Di dalam fungsi
-- SECURITY DEFINER, current_user ialah pemilik fungsi dan bukan pemanggil,
-- jadi semakan peranan di bawah akan sentiasa benar dan pengawal ini tidak
-- akan mengawal apa-apa. Ia tidak memerlukan kuasa tambahan kerana ia hanya
-- mengubah nilai dalam NEW.
CREATE OR REPLACE FUNCTION public.qm_guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Kerja sisi pelayan (service_role) dan penyelenggaraan pangkalan data
  -- tidak disekat, begitu juga pentadbir platform.
  IF current_user IN ('service_role', 'supabase_admin', 'postgres') THEN
    RETURN NEW;
  END IF;
  IF public.qm_is_admin() THEN
    RETURN NEW;
  END IF;

  -- Selebihnya ialah pengguna mengemas kini profil sendiri. Medan kuasa
  -- dikembalikan kepada nilai asal, bukan ditolak, supaya borang profil
  -- yang menghantar seluruh baris tetap berfungsi seperti biasa.
  NEW.id                        := OLD.id;
  NEW.role                      := OLD.role;
  NEW.approved                  := OLD.approved;
  NEW.created_at                := OLD.created_at;
  NEW.max_classes_owned         := OLD.max_classes_owned;
  NEW.max_classes_as_coeducator := OLD.max_classes_as_coeducator;
  NEW.max_live_players          := OLD.max_live_players;
  NEW.can_upload_files          := OLD.can_upload_files;
  NEW.can_upload_videos         := OLD.can_upload_videos;

  -- suspended sehala sahaja: pengguna boleh menutup akaun sendiri
  -- (softDeleteMyAccount menetapkannya kepada true), tetapi akaun yang
  -- digantung tidak boleh membuka semula dirinya.
  IF OLD.suspended AND NOT NEW.suspended THEN
    NEW.suspended := OLD.suspended;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS qm_profiles_guard_privileges ON public.qm_profiles;
CREATE TRIGGER qm_profiles_guard_privileges
  BEFORE UPDATE ON public.qm_profiles
  FOR EACH ROW EXECUTE FUNCTION public.qm_guard_profile_privileges();

-- Pengguna yang belum log masuk tidak sepatutnya mengemas kini profil.
REVOKE UPDATE ON public.qm_profiles FROM anon;

-- 2. Pendaftaran menghormati peranan --------------------------------------
CREATE OR REPLACE FUNCTION public.qm_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_meta_role text;
  v_role      text;
  v_approved  boolean;
BEGIN
  v_meta_role := lower(nullif(btrim(NEW.raw_user_meta_data->>'role'), ''));

  -- Hanya 'educator' diterima daripada metadata pendaftaran. Peranan
  -- pentadbir tidak boleh datang daripada borang yang diisi pengguna.
  IF v_meta_role = 'educator' THEN
    v_role := 'educator';
    v_approved := false;
  ELSE
    v_role := 'participant';
    v_approved := true;
  END IF;

  INSERT INTO qm_profiles (id, role, display_name, approved, suspended, created_at)
  VALUES (NEW.id, v_role,
          COALESCE(NEW.raw_user_meta_data->>'display_name',
                   NEW.raw_user_meta_data->>'name',
                   split_part(NEW.email, '@', 1)),
          v_approved, false, NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'qm_handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

-- 3. Selaraskan pendidik sedia ada ----------------------------------------
-- Mereka sudah menggunakan platform sebagai pendidik melalui user_metadata.
-- Peranan profil diselaraskan dan kelulusan diberi, supaya tiada sesiapa
-- terkunci oleh perubahan ini. Pentadbir boleh menarik balik bila-bila masa
-- melalui skrin /admin/users.
UPDATE qm_profiles p
SET role = 'educator', approved = true
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.raw_user_meta_data->>'role') = 'educator'
  AND p.role = 'participant';

-- 4. Log audit tidak boleh mengunci akaun ---------------------------------
-- qm_audit_log.actor_id merujuk qm_profiles tanpa tindakan ON DELETE, jadi
-- sebaik sahaja seseorang melakukan tindakan yang direkod, akaunnya tidak
-- boleh dibuang lagi. Lajur itu memang boleh NULL, jadi SET NULL menyimpan
-- rekod tindakan sambil membenarkan akaun dibuang.
ALTER TABLE public.qm_audit_log
  DROP CONSTRAINT IF EXISTS qm_audit_log_actor_id_fkey;
ALTER TABLE public.qm_audit_log
  ADD CONSTRAINT qm_audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.qm_profiles(id) ON DELETE SET NULL;

COMMIT;
