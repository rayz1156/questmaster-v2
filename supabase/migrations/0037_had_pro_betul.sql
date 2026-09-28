-- 0037_had_pro_betul.sql
--
-- Membetulkan had akaun Pro yang tertinggal.
--
-- Punca: migrasi 0030 (langkah 2) menaikkan pendidik sedia ada ke plan
-- 'pro' dengan UPDATE plan sahaja, tanpa menaikkan had mereka. Akibatnya
-- akaun Pro kekal dengan had pemain sesi langsung lama (50). Memilih "pro"
-- semula di halaman Admin tidak membetulkannya kerana UI tidak memanggil
-- qm_set_plan apabila pelan sudah sama.
--
-- Migrasi ini:
--  1. Menyelaraskan semua akaun Pro dengan had yang qm_set_plan('pro')
--     sepatutnya berikan (had sedia ada yang lebih tinggi dikekalkan).
--  2. Menaikkan had sesi langsung yang BELUM tamat milik pemilik Pro,
--     supaya sesi dalam lobi tidak lagi berhenti pada 50.
--  3. Mengemas kini qm_set_plan supaya selari dengan 0035: had kuiz
--     dimansuhkan (NULL) untuk kedua dua pelan. Sebelum ini menukar
--     pengguna ke 'free' akan menetapkan semula had 10 kuiz.
--
-- Guard profil (qm_guard_profile_privileges) memin lajur had pada UPDATE,
-- jadi kemas kini data dijalankan dengan session_replication_role = replica
-- untuk langkah itu sahaja.

BEGIN;

SET LOCAL session_replication_role = replica;

UPDATE public.qm_profiles
   SET max_classes_owned         = GREATEST(COALESCE(max_classes_owned, 0), 20),
       max_classes_as_coeducator = GREATEST(COALESCE(max_classes_as_coeducator, 0), 20),
       max_quizzes_owned         = NULL,
       max_live_players          = GREATEST(COALESCE(max_live_players, 0), 200),
       can_upload_files          = true,
       can_upload_videos         = true
 WHERE plan = 'pro'
   AND (   COALESCE(max_live_players, 0) < 200
        OR COALESCE(max_classes_owned, 0) < 20
        OR COALESCE(max_classes_as_coeducator, 0) < 20
        OR max_quizzes_owned IS NOT NULL
        OR can_upload_files IS DISTINCT FROM true
        OR can_upload_videos IS DISTINCT FROM true);

UPDATE public.qm_live_sessions s
   SET max_players = p.max_live_players
  FROM public.qm_live_quizzes q
  JOIN public.qm_profiles p ON p.id = q.owner_id
 WHERE s.quiz_id = q.id
   AND s.status <> 'ended'
   AND p.plan = 'pro'
   AND s.max_players < p.max_live_players;

SET LOCAL session_replication_role = origin;

CREATE OR REPLACE FUNCTION public.qm_set_plan(p_user uuid, p_plan text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.qm_is_admin() THEN
    RAISE EXCEPTION 'QM_FORBIDDEN: hanya pentadbir boleh menukar pelan' USING ERRCODE = 'P0001';
  END IF;
  IF p_plan NOT IN ('free','pro') THEN
    RAISE EXCEPTION 'QM_BAD_PLAN: pelan mesti free atau pro' USING ERRCODE = 'P0001';
  END IF;

  IF p_plan = 'free' THEN
    UPDATE public.qm_profiles
       SET plan = 'free',
           max_classes_owned = 3,
           max_classes_as_coeducator = 3,
           max_quizzes_owned = NULL,
           max_live_players = 40,
           can_upload_files = false,
           can_upload_videos = false
     WHERE id = p_user;
  ELSE
    UPDATE public.qm_profiles
       SET plan = 'pro',
           max_classes_owned = GREATEST(COALESCE(max_classes_owned, 0), 20),
           max_classes_as_coeducator = GREATEST(COALESCE(max_classes_as_coeducator, 0), 20),
           max_quizzes_owned = NULL,
           max_live_players = GREATEST(COALESCE(max_live_players, 0), 200),
           can_upload_files = true,
           can_upload_videos = true
     WHERE id = p_user;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.qm_set_plan(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_set_plan(uuid, text) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
