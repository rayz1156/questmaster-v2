-- 0040_pelan_v2.sql
--
-- Pelan Kuizen v2 (diluluskan Boss Hariz, 29 Sep 2026):
--   - plan bernilai free | pro | institution
--   - tarikh tamat pelan (plan_expires_at)
--   - quest, papan dan pasukan dibuka kepada pelan percuma dengan kuota
--   - penilaian rakan kekal Pro
--   - had angka datang daripada SATU sumber: qm_plan_limits(text)
--
-- Jalankan dengan: psql -1 -v ON_ERROR_STOP=1 -f 0040_pelan_v2.sql
-- Tiada BEGIN/COMMIT dalam fail ini; psql -1 membalut satu transaksi.
--
-- Keputusan reka bentuk:
--   1. Pencetus penjaga quest pada 5 jadual (0030) KEKAL; qm_quest_features_allowed
--      ditulis semula untuk pulangkan true untuk semua pelan. Lebih ringkas
--      daripada menggugurkan pencetus, dan titik penjaga kekal jika ciri
--      perlu disekat semula kelak.
--   2. Papan yang dicipta secara automatik oleh pencetus (papan pengenalan
--      kelas dan papan penghantaran quest) TIDAK disekat dan TIDAK dikira.
--      Pembeza: lajur auto_created. Pencetus kuota papan menanda
--      NEW.auto_created := true apabila pg_trigger_depth() > 1, dan kiraan
--      hanya mengira baris auto_created = false. Ini boleh diuji terus dan
--      selamat walaupun pencetus automatik memasukkan ke jadual lain.
--   3. Kuota aktiviti dan papan mengecualikan qm_caller_is_privileged()
--      (corak had kelas 0030) kerana laluan pendua kelas memasukkan baris
--      dengan service-role. Had pemain sesi KEKAL tanpa pengecualian
--      (pelajaran 0031: had kapasiti tidak boleh dipintas).

-- ---------------------------------------------------------------------
-- 1. CHECK plan: free, pro, institution
-- ---------------------------------------------------------------------
ALTER TABLE public.qm_profiles DROP CONSTRAINT IF EXISTS qm_profiles_plan_chk;

DO $$
BEGIN
  ALTER TABLE public.qm_profiles
    ADD CONSTRAINT qm_profiles_plan_chk CHECK (plan IN ('free','pro','institution'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------
-- 2. Jadual institusi dan lajur tamat tempoh
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qm_institutions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  seats       int not null default 10,
  owner_id    uuid references public.qm_profiles(id),
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

ALTER TABLE public.qm_institutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_inst_admin_read ON public.qm_institutions;
CREATE POLICY p_inst_admin_read ON public.qm_institutions
  FOR SELECT TO authenticated
  USING (public.qm_is_admin());

DROP POLICY IF EXISTS p_inst_admin_write ON public.qm_institutions;
CREATE POLICY p_inst_admin_write ON public.qm_institutions
  FOR ALL TO authenticated
  USING (public.qm_is_admin())
  WITH CHECK (public.qm_is_admin());

REVOKE ALL ON public.qm_institutions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qm_institutions TO authenticated;

ALTER TABLE public.qm_profiles
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

ALTER TABLE public.qm_profiles
  ADD COLUMN IF NOT EXISTS institution_id uuid
    REFERENCES public.qm_institutions(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 3. SATU sumber angka had. IMMUTABLE, tiada akses jadual.
--    null bermaksud tanpa had. Nilai pelan lain (termasuk NULL) pulangkan
--    had free supaya tiada apa-apa terbuka secara tidak sengaja.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_plan_limits(p_plan text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE p_plan
    WHEN 'pro' THEN '{"classes":30,"coeducator_classes":30,"members_per_class":null,"live_players":300,"activities":null,"boards":null,"file_mb":20,"storage_mb":1024,"peer_review":true,"teams":true}'::jsonb
    WHEN 'institution' THEN '{"classes":30,"coeducator_classes":30,"members_per_class":null,"live_players":300,"activities":null,"boards":null,"file_mb":20,"storage_mb":10240,"peer_review":true,"teams":true}'::jsonb
    ELSE '{"classes":3,"coeducator_classes":3,"members_per_class":150,"live_players":60,"activities":30,"boards":5,"file_mb":10,"storage_mb":100,"peer_review":false,"teams":true}'::jsonb
  END;
$fn$;

-- ---------------------------------------------------------------------
-- 4. Pelan berkesan: tamat tempoh turun ke free; pentadbir sentiasa pro.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_effective_plan(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT CASE
    WHEN p.role IN ('admin','superadmin') THEN 'pro'
    WHEN p.plan_expires_at IS NOT NULL AND p.plan_expires_at <= now() THEN 'free'
    ELSE p.plan
  END
    FROM public.qm_profiles p
   WHERE p.id = p_user;
$fn$;

-- ---------------------------------------------------------------------
-- 5. Ciri quest kini terbuka untuk semua pelan. Fungsi dikekalkan supaya
--    pencetus sedia ada terus lulus tanpa perubahan DDL pada 5 jadual.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_quest_features_allowed(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT true;
$fn$;

-- Penilaian rakan kekal Pro.
CREATE OR REPLACE FUNCTION public.qm_peer_review_allowed(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    (public.qm_plan_limits(public.qm_effective_plan(p_user)) ->> 'peer_review')::boolean,
    false);
$fn$;

-- Penjaga baru untuk qm_peer_rounds, mesej QM_PLAN_PRO.
CREATE OR REPLACE FUNCTION public.qm_guard_peer_feature()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF public.qm_caller_is_privileged() THEN RETURN NEW; END IF;

  IF public.qm_peer_review_allowed(public.qm_plan_owner_of(to_jsonb(NEW))) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'QM_PLAN_PRO: Penilaian rakan hanya tersedia dalam pelan Pro.'
    USING ERRCODE = 'P0001';
END;
$fn$;

DROP TRIGGER IF EXISTS qm_guard_plan_peer_rounds ON public.qm_peer_rounds;
CREATE TRIGGER qm_guard_plan_peer_rounds
  BEFORE INSERT ON public.qm_peer_rounds
  FOR EACH ROW EXECUTE FUNCTION public.qm_guard_peer_feature();

-- ---------------------------------------------------------------------
-- 6. Baki kuota kelas: max_classes_owned mentadbir selagi pelan tidak
--    tamat tempoh; apabila tamat, LEAST dengan had pelan berkesan
--    (pengguna Pro yang tamat kembali ke 3). max_classes_owned NULL
--    bermaksud guna had pelan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_class_quota_left(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT LEAST(
           COALESCE(p.max_classes_owned,
                    (public.qm_plan_limits(public.qm_effective_plan(p_user)) ->> 'classes')::int),
           CASE
             WHEN public.qm_effective_plan(p_user) IS DISTINCT FROM p.plan THEN
               (public.qm_plan_limits(public.qm_effective_plan(p_user)) ->> 'classes')::int
             ELSE 2147483647
           END
         )
       - (SELECT count(*)::int FROM public.qm_classes c WHERE c.owner_id = p_user)
    FROM public.qm_profiles p
   WHERE p.id = p_user;
$fn$;

-- ---------------------------------------------------------------------
-- 7. Bendera papan automatik: mesti wujud sebelum fungsi kiraan di bawah
--    (fungsi LANGUAGE sql disemak pada masa dicipta)
-- ---------------------------------------------------------------------
ALTER TABLE public.qm_learning_boards
  ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false;

ALTER TABLE public.qm_submission_boards
  ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------
-- 8. Pembantu kiraan (SECURITY DEFINER, bacaan merentas RLS sahaja)
-- ---------------------------------------------------------------------

-- Aktiviti gabungan: hunt + kuiz dalam kelas milik p_owner, serta baris
-- tanpa kelas dengan owner_id = p_owner.
CREATE OR REPLACE FUNCTION public.qm_activity_count(p_owner uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    (SELECT count(*)::int
       FROM public.qm_hunts h
       LEFT JOIN public.qm_classes c ON c.id = h.class_id
      WHERE c.owner_id = p_owner
         OR (h.class_id IS NULL AND h.owner_id = p_owner))
  + (SELECT count(*)::int
       FROM public.qm_live_quizzes q
       LEFT JOIN public.qm_classes c ON c.id = q.class_id
      WHERE c.owner_id = p_owner
         OR (q.class_id IS NULL AND q.owner_id = p_owner));
$fn$;

-- Papan gabungan: papan pembelajaran + papan penghantaran dalam semua
-- kelas milik pemilik. Papan automatik (auto_created) tidak dikira.
CREATE OR REPLACE FUNCTION public.qm_board_count(p_owner uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    (SELECT count(*)::int
       FROM public.qm_learning_boards b
       JOIN public.qm_classes c ON c.id = b.class_id
      WHERE c.owner_id = p_owner
        AND b.auto_created = false)
  + (SELECT count(*)::int
       FROM public.qm_submission_boards sb
       JOIN public.qm_classes c ON c.id = sb.class_id
      WHERE c.owner_id = p_owner
        AND sb.auto_created = false);
$fn$;

-- Bilangan ahli dalam satu kelas.
CREATE OR REPLACE FUNCTION public.qm_member_count(p_class uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT count(*)::int FROM public.qm_class_members m WHERE m.class_id = p_class;
$fn$;

-- ---------------------------------------------------------------------
-- 9. Kuota aktiviti gabungan (hunt + kuiz). SECURITY INVOKER supaya
--    qm_caller_is_privileged() menilai pemanggil sebenar.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_enforce_activity_quota()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_owner uuid;
  v_count integer;
  v_limit integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF public.qm_caller_is_privileged() THEN RETURN NEW; END IF;

  v_owner := public.qm_plan_owner_of(to_jsonb(NEW));
  v_count := public.qm_activity_count(v_owner);
  v_limit := COALESCE(
    (public.qm_plan_limits(public.qm_effective_plan(v_owner)) ->> 'activities')::int,
    2147483647);

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'QM_LIMIT_ACTIVITIES: Had bilangan aktiviti (quest dan kuiz) sudah dicapai. Padam yang lama atau naik taraf pelan.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS qm_activity_quota_hunts ON public.qm_hunts;
CREATE TRIGGER qm_activity_quota_hunts
  BEFORE INSERT ON public.qm_hunts
  FOR EACH ROW EXECUTE FUNCTION public.qm_enforce_activity_quota();

-- Pencetus had kuiz lama digugurkan (0035 sudah menjadikannya tidak bermakna).
DROP TRIGGER IF EXISTS qm_quiz_owner_limit_trg ON public.qm_live_quizzes;
DROP TRIGGER IF EXISTS qm_activity_quota_live_quizzes ON public.qm_live_quizzes;
CREATE TRIGGER qm_activity_quota_live_quizzes
  BEFORE INSERT ON public.qm_live_quizzes
  FOR EACH ROW EXECUTE FUNCTION public.qm_enforce_activity_quota();

-- ---------------------------------------------------------------------
-- 10. Kuota papan gabungan. Papan pada kedalaman pencetus > 1 (dicipta
--     oleh pencetus lain) ditanda automatik: dibenarkan dan tidak dikira.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_enforce_board_quota()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_owner uuid;
  v_count integer;
  v_limit integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    NEW.auto_created := true;
    RETURN NEW;
  END IF;
  IF public.qm_caller_is_privileged() THEN RETURN NEW; END IF;

  v_owner := public.qm_plan_owner_of(to_jsonb(NEW));
  v_count := public.qm_board_count(v_owner);
  v_limit := COALESCE(
    (public.qm_plan_limits(public.qm_effective_plan(v_owner)) ->> 'boards')::int,
    2147483647);

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'QM_LIMIT_BOARDS: Had bilangan papan sudah dicapai. Padam papan lama atau naik taraf pelan.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS qm_board_quota_learning ON public.qm_learning_boards;
CREATE TRIGGER qm_board_quota_learning
  BEFORE INSERT ON public.qm_learning_boards
  FOR EACH ROW EXECUTE FUNCTION public.qm_enforce_board_quota();

DROP TRIGGER IF EXISTS qm_board_quota_submission ON public.qm_submission_boards;
CREATE TRIGGER qm_board_quota_submission
  BEFORE INSERT ON public.qm_submission_boards
  FOR EACH ROW EXECUTE FUNCTION public.qm_enforce_board_quota();

-- ---------------------------------------------------------------------
-- 11. Had peserta setiap kelas. Pentadbir dan pemanggil istimewa
--     dikecualikan (corak 0030); kiraan melalui pembantu DEFINER.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_enforce_member_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_owner uuid;
  v_limit integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF public.qm_caller_is_privileged() THEN RETURN NEW; END IF;

  v_owner := public.qm_plan_owner_of(to_jsonb(NEW));
  v_limit := COALESCE(
    (public.qm_plan_limits(public.qm_effective_plan(v_owner)) ->> 'members_per_class')::int,
    2147483647);

  IF public.qm_member_count(NEW.class_id) >= v_limit THEN
    RAISE EXCEPTION 'QM_LIMIT_MEMBERS: Had peserta kelas sudah dicapai.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS qm_member_limit_trg ON public.qm_class_members;
CREATE TRIGGER qm_member_limit_trg
  BEFORE INSERT ON public.qm_class_members
  FOR EACH ROW EXECUTE FUNCTION public.qm_enforce_member_limit();

-- ---------------------------------------------------------------------
-- 12. Had pemain sesi langsung: LEAST antara max_players sesi dengan had
--     pelan berkesan pemilik kuiz. TIADA pengecualian peranan istimewa
--     (pelajaran 0031). Pencetus sedia ada (0031) tidak diubah; ia sudah
--     memanggil qm_live_slot_left tanpa pintasan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_live_slot_left(p_session uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT LEAST(
           COALESCE(s.max_players, 40),
           COALESCE(
             (public.qm_plan_limits(public.qm_effective_plan(q.owner_id)) ->> 'live_players')::int,
             2147483647)
         )
       - (SELECT count(*)::int FROM public.qm_live_players pl WHERE pl.session_id = s.id)
    FROM public.qm_live_sessions s
    JOIN public.qm_live_quizzes q ON q.id = s.quiz_id
   WHERE s.id = p_session;
$fn$;

-- Selaraskan max_players sesi yang belum tamat dengan had pelan berkesan
-- pemilik (naik taraf memberi tempat lebih, tamat tempoh mengecilkan).
UPDATE public.qm_live_sessions s
   SET max_players = COALESCE(
         (public.qm_plan_limits(public.qm_effective_plan(q.owner_id)) ->> 'live_players')::int,
         s.max_players)
  FROM public.qm_live_quizzes q
 WHERE s.quiz_id = q.id
   AND s.status <> 'ended'
   AND s.max_players IS DISTINCT FROM
       COALESCE(
         (public.qm_plan_limits(public.qm_effective_plan(q.owner_id)) ->> 'live_players')::int,
         s.max_players);

-- ---------------------------------------------------------------------
-- 13. Guard profil: pin plan, had, plan_expires_at dan institution_id
--     (kemas kini 0030).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF current_user IN ('service_role','supabase_admin','postgres') THEN RETURN NEW; END IF;
  IF public.qm_is_admin() THEN RETURN NEW; END IF;

  NEW.id                        := OLD.id;
  NEW.role                      := OLD.role;
  NEW.approved                  := OLD.approved;
  NEW.created_at                := OLD.created_at;
  NEW.plan                      := OLD.plan;
  NEW.plan_expires_at           := OLD.plan_expires_at;
  NEW.institution_id            := OLD.institution_id;
  NEW.max_classes_owned         := OLD.max_classes_owned;
  NEW.max_classes_as_coeducator := OLD.max_classes_as_coeducator;
  NEW.max_quizzes_owned         := OLD.max_quizzes_owned;
  NEW.max_live_players          := OLD.max_live_players;
  NEW.can_upload_files          := OLD.can_upload_files;
  NEW.can_upload_videos         := OLD.can_upload_videos;

  IF OLD.suspended AND NOT NEW.suspended THEN NEW.suspended := OLD.suspended; END IF;
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------
-- 14. qm_set_plan: free | pro | institution, dengan pilihan tarikh tamat.
--     Tandatangan lama (uuid, text) kekal berfungsi melalui DEFAULT.
--     Had diambil daripada qm_plan_limits tanpa GREATEST supaya
--     penurunan taraf benar-benar menurunkan had; langkah data satu kali
--     di bawah menggunakan GREATEST untuk mengekalkan had lebih tinggi.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.qm_set_plan(uuid, text);

CREATE OR REPLACE FUNCTION public.qm_set_plan(p_user uuid, p_plan text, p_expires timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_limits jsonb;
BEGIN
  IF NOT public.qm_is_admin() THEN
    RAISE EXCEPTION 'QM_FORBIDDEN: hanya pentadbir boleh menukar pelan' USING ERRCODE = 'P0001';
  END IF;
  IF p_plan NOT IN ('free','pro','institution') THEN
    RAISE EXCEPTION 'QM_BAD_PLAN: pelan mesti free, pro atau institution' USING ERRCODE = 'P0001';
  END IF;

  v_limits := public.qm_plan_limits(p_plan);

  UPDATE public.qm_profiles
     SET plan                     = p_plan,
         plan_expires_at          = p_expires,
         max_classes_owned        = (v_limits ->> 'classes')::int,
         max_classes_as_coeducator = (v_limits ->> 'coeducator_classes')::int,
         max_quizzes_owned        = NULL,
         max_live_players         = (v_limits ->> 'live_players')::int,
         can_upload_files         = true,
         can_upload_videos        = false
   WHERE id = p_user;
END;
$fn$;

REVOKE ALL ON FUNCTION public.qm_set_plan(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_set_plan(uuid, text, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 15. Ringkasan pelan untuk UI (V2-002b). auth.uid() sahaja.
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
      'classes',    (SELECT count(*)::int FROM public.qm_classes c WHERE c.owner_id = v_uid),
      'activities', public.qm_activity_count(v_uid),
      'boards',     public.qm_board_count(v_uid)
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.qm_my_plan_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_my_plan_usage() TO authenticated;

-- ---------------------------------------------------------------------
-- 16. Geran untuk pembantu yang dipanggil pencetus SECURITY INVOKER
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.qm_plan_limits(text)            TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.qm_effective_plan(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qm_peer_review_allowed(uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qm_activity_count(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qm_board_count(uuid)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qm_member_count(uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qm_quest_features_allowed(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.qm_live_slot_left(uuid)         TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- 17. Langkah data satu kali: 16 akaun bukan peserta naik ke Pro.
--     GREATEST mengekalkan had sedia ada yang lebih tinggi (contoh 52
--     kelas). Educator tamat 2027-09-30; admin dan superadmin tiada tamat.
--     Peserta tidak disentuh. can_upload_videos = false untuk semua
--     (video dilarang dalam v2, berbeza daripada 0037).
-- ---------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

UPDATE public.qm_profiles
   SET plan                      = 'pro',
       plan_expires_at           = CASE
                                     WHEN role = 'educator' THEN '2027-09-30 23:59:59+08'::timestamptz
                                     ELSE NULL
                                   END,
       max_classes_owned         = GREATEST(COALESCE(max_classes_owned, 0),
                                            (public.qm_plan_limits('pro') ->> 'classes')::int),
       max_classes_as_coeducator = GREATEST(COALESCE(max_classes_as_coeducator, 0),
                                            (public.qm_plan_limits('pro') ->> 'coeducator_classes')::int),
       max_quizzes_owned         = NULL,
       max_live_players          = GREATEST(COALESCE(max_live_players, 0),
                                            (public.qm_plan_limits('pro') ->> 'live_players')::int),
       can_upload_files          = true,
       can_upload_videos         = false
 WHERE role IN ('educator','admin','superadmin');

SET LOCAL session_replication_role = origin;

NOTIFY pgrst, 'reload schema';