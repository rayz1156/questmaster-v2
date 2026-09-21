-- 0030_pelan_percuma_had.sql
--
-- Pelan percuma: fungsi kuiz sahaja, dengan had kelas, had kuiz dan had
-- peserta sesi langsung. Ciri quest (hunt, cabaran, papan pembelajaran,
-- papan penghantaran, pasukan) dikhaskan untuk pelan berbayar.
--
-- Semua kuatkuasa berada di pangkalan data. Sekatan di pelayar sahaja
-- boleh dipintas dengan satu panggilan PostgREST terus.
--
-- NOTA PENTING TENTANG SECURITY DEFINER:
-- Di dalam fungsi SECURITY DEFINER, current_user ialah pemilik fungsi,
-- bukan pemanggil. Oleh itu setiap PENCETUS penjaga di bawah ditulis
-- sebagai SECURITY INVOKER supaya qm_caller_is_privileged() menilai
-- peranan pemanggil yang sebenar. Bacaan merentas RLS dialihkan ke
-- fungsi pembantu SECURITY DEFINER yang berasingan.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Lajur pelan dan had kuiz
-- ---------------------------------------------------------------------
ALTER TABLE public.qm_profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';

ALTER TABLE public.qm_profiles
  ADD COLUMN IF NOT EXISTS max_quizzes_owned integer NOT NULL DEFAULT 10;

DO $$
BEGIN
  ALTER TABLE public.qm_profiles
    ADD CONSTRAINT qm_profiles_plan_chk CHECK (plan IN ('free','pro'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Had lalai untuk pendaftaran baharu. Baris sedia ada tidak disentuh.
ALTER TABLE public.qm_profiles ALTER COLUMN max_classes_owned         SET DEFAULT 3;
ALTER TABLE public.qm_profiles ALTER COLUMN max_classes_as_coeducator SET DEFAULT 3;
ALTER TABLE public.qm_profiles ALTER COLUMN max_live_players          SET DEFAULT 40;

-- ---------------------------------------------------------------------
-- 2. Pendidik sedia ada dikekalkan pada pelan penuh
--    Mereka sudah membina kandungan quest sebelum pelan wujud. Menukar
--    mereka kepada percuma akan merampas kerja yang sudah ada.
-- ---------------------------------------------------------------------
UPDATE public.qm_profiles
   SET plan = 'pro'
 WHERE role IN ('educator','admin','superadmin')
   AND plan <> 'pro';

-- ---------------------------------------------------------------------
-- 3. Guard profil: pengguna tidak boleh menukar pelan atau had sendiri
--    (mengemas kini fungsi daripada 0027, menambah plan dan
--     max_quizzes_owned pada senarai lajur yang dipin)
--    Sengaja BUKAN SECURITY DEFINER.
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
-- 4. Pembantu SECURITY DEFINER (bacaan merentas RLS sahaja)
-- ---------------------------------------------------------------------

-- Siapa pemilik pelan bagi satu baris yang hendak dimasukkan.
-- Kami sengaja TIDAK mempercayai owner_id atau created_by pada baris itu
-- kerana kedua duanya datang daripada pelanggan. Pemilik kelas ialah
-- rujukan yang betul, dan auth.uid() ialah sandaran terakhir.
CREATE OR REPLACE FUNCTION public.qm_plan_owner_of(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_owner uuid;
  v_class uuid;
  v_hunt  uuid;
BEGIN
  v_class := nullif(p_row->>'class_id','')::uuid;
  v_hunt  := nullif(p_row->>'hunt_id','')::uuid;

  IF v_class IS NOT NULL THEN
    SELECT c.owner_id INTO v_owner FROM public.qm_classes c WHERE c.id = v_class;
  END IF;

  IF v_owner IS NULL AND v_hunt IS NOT NULL THEN
    SELECT COALESCE(c.owner_id, h.owner_id) INTO v_owner
      FROM public.qm_hunts h
      LEFT JOIN public.qm_classes c ON c.id = h.class_id
     WHERE h.id = v_hunt;
  END IF;

  RETURN COALESCE(v_owner, auth.uid());
END;
$fn$;

-- Adakah pemilik ini dibenarkan menggunakan ciri quest.
CREATE OR REPLACE FUNCTION public.qm_quest_features_allowed(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    (SELECT p.plan <> 'free' OR p.role IN ('admin','superadmin')
       FROM public.qm_profiles p
      WHERE p.id = p_user),
    false);
$fn$;

-- Baki kuota kelas bagi seorang pemilik.
CREATE OR REPLACE FUNCTION public.qm_class_quota_left(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(p.max_classes_owned, 2147483647)
         - (SELECT count(*)::int FROM public.qm_classes c WHERE c.owner_id = p_user)
    FROM public.qm_profiles p
   WHERE p.id = p_user;
$fn$;

-- Baki kuota kuiz bagi seorang pemilik.
CREATE OR REPLACE FUNCTION public.qm_quiz_quota_left(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(p.max_quizzes_owned, 2147483647)
         - (SELECT count(*)::int FROM public.qm_live_quizzes q WHERE q.owner_id = p_user)
    FROM public.qm_profiles p
   WHERE p.id = p_user;
$fn$;

-- Baki tempat dalam satu sesi langsung.
CREATE OR REPLACE FUNCTION public.qm_live_slot_left(p_session uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(s.max_players, 40)
         - (SELECT count(*)::int FROM public.qm_live_players pl WHERE pl.session_id = s.id)
    FROM public.qm_live_sessions s
   WHERE s.id = p_session;
$fn$;

GRANT EXECUTE ON FUNCTION public.qm_plan_owner_of(jsonb)        TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.qm_quest_features_allowed(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.qm_class_quota_left(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qm_quiz_quota_left(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qm_live_slot_left(uuid)         TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- 5. Penjaga ciri quest (SECURITY INVOKER)
--    pg_trigger_depth() > 1 bermakna baris ini dicipta oleh pencetus
--    lain, contohnya papan pengenalan yang dijana automatik semasa kelas
--    dicipta. Baris begitu tidak disekat.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_guard_quest_feature()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF public.qm_caller_is_privileged() THEN RETURN NEW; END IF;

  IF public.qm_quest_features_allowed(public.qm_plan_owner_of(to_jsonb(NEW))) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'QM_PLAN_FREE: Ciri ini tidak termasuk dalam pelan percuma. Pelan percuma meliputi fungsi kuiz sahaja.'
    USING ERRCODE = 'P0001';
END;
$fn$;

DROP TRIGGER IF EXISTS qm_guard_plan_hunts             ON public.qm_hunts;
DROP TRIGGER IF EXISTS qm_guard_plan_challenges        ON public.qm_challenges;
DROP TRIGGER IF EXISTS qm_guard_plan_learning_boards   ON public.qm_learning_boards;
DROP TRIGGER IF EXISTS qm_guard_plan_submission_boards ON public.qm_submission_boards;
DROP TRIGGER IF EXISTS qm_guard_plan_teams             ON public.qm_teams;

CREATE TRIGGER qm_guard_plan_hunts
  BEFORE INSERT ON public.qm_hunts
  FOR EACH ROW EXECUTE FUNCTION public.qm_guard_quest_feature();

CREATE TRIGGER qm_guard_plan_challenges
  BEFORE INSERT ON public.qm_challenges
  FOR EACH ROW EXECUTE FUNCTION public.qm_guard_quest_feature();

CREATE TRIGGER qm_guard_plan_learning_boards
  BEFORE INSERT ON public.qm_learning_boards
  FOR EACH ROW EXECUTE FUNCTION public.qm_guard_quest_feature();

CREATE TRIGGER qm_guard_plan_submission_boards
  BEFORE INSERT ON public.qm_submission_boards
  FOR EACH ROW EXECUTE FUNCTION public.qm_guard_quest_feature();

CREATE TRIGGER qm_guard_plan_teams
  BEFORE INSERT ON public.qm_teams
  FOR EACH ROW EXECUTE FUNCTION public.qm_guard_quest_feature();

-- ---------------------------------------------------------------------
-- 6. Had kelas (menulis semula 0026, kini SECURITY INVOKER dengan
--    laluan pentadbir dan mesej Bahasa Melayu berkod)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_enforce_class_owner_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_left integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF public.qm_caller_is_privileged() THEN RETURN NEW; END IF;

  v_left := public.qm_class_quota_left(NEW.owner_id);
  IF v_left IS NULL THEN RETURN NEW; END IF;

  IF v_left <= 0 THEN
    RAISE EXCEPTION 'QM_LIMIT_CLASSES: Had bilangan kelas sudah dicapai. Naik taraf pelan untuk menambah kelas.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------
-- 7. Had bilangan kuiz
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_enforce_quiz_owner_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_left integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF public.qm_caller_is_privileged() THEN RETURN NEW; END IF;

  v_left := public.qm_quiz_quota_left(COALESCE(NEW.owner_id, auth.uid()));
  IF v_left IS NULL THEN RETURN NEW; END IF;

  IF v_left <= 0 THEN
    RAISE EXCEPTION 'QM_LIMIT_QUIZZES: Had bilangan kuiz sudah dicapai. Padam kuiz lama atau naik taraf pelan.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS qm_quiz_owner_limit_trg ON public.qm_live_quizzes;
CREATE TRIGGER qm_quiz_owner_limit_trg
  BEFORE INSERT ON public.qm_live_quizzes
  FOR EACH ROW EXECUTE FUNCTION public.qm_enforce_quiz_owner_limit();

-- ---------------------------------------------------------------------
-- 8. Had peserta sesi langsung
--    Sebelum ini had ini hanya ditetapkan oleh laluan API. Panggilan
--    PostgREST terus boleh memasukkan pemain melebihi had.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_enforce_live_player_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_left integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF public.qm_caller_is_privileged() THEN RETURN NEW; END IF;

  v_left := public.qm_live_slot_left(NEW.session_id);
  IF v_left IS NULL THEN RETURN NEW; END IF;

  IF v_left <= 0 THEN
    RAISE EXCEPTION 'QM_LIMIT_PLAYERS: Sesi ini sudah penuh.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS qm_live_player_limit_trg ON public.qm_live_players;
CREATE TRIGGER qm_live_player_limit_trg
  BEFORE INSERT ON public.qm_live_players
  FOR EACH ROW EXECUTE FUNCTION public.qm_enforce_live_player_limit();

-- ---------------------------------------------------------------------
-- 9. Kemudahan pentadbir: tukar pelan seseorang dalam satu panggilan
-- ---------------------------------------------------------------------
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
           max_quizzes_owned = 10,
           max_live_players = 40,
           can_upload_files = false,
           can_upload_videos = false
     WHERE id = p_user;
  ELSE
    UPDATE public.qm_profiles
       SET plan = 'pro',
           max_classes_owned = GREATEST(max_classes_owned, 20),
           max_classes_as_coeducator = GREATEST(max_classes_as_coeducator, 20),
           max_quizzes_owned = 2147483647,
           max_live_players = GREATEST(max_live_players, 200),
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
