-- 0028_score_integrity_guards.sql
-- Audit susulan kepada 0027. Corak yang sama muncul pada tiga jadual lain:
-- dasar RLS hanya menyemak siapa yang memiliki baris, sementara peranan
-- authenticated mempunyai kebenaran UPDATE pada setiap lajur. Akibatnya
-- pelajar boleh menulis markah dan status penilaian sendiri.
--
-- Tiga lubang yang ditutup di sini:
--   qm_submissions        dasar qm_submissions_self membenarkan ALL pada
--                         baris sendiri, termasuk status. Pelajar boleh
--                         menukar 'pending' kepada 'approved'.
--   qm_teams              dasar qm_teams_member_update membenarkan mana-mana
--                         ahli pasukan menulis lajur score.
--   qm_group_submissions  USING menyemak status lama, tetapi WITH CHECK ialah
--                         true, jadi status baharu dan skor tidak disemak.
--
-- Polanya sama seperti 0027: pencetus BEFORE, SECURITY INVOKER supaya
-- current_user ialah pemanggil sebenar, medan dikembalikan kepada nilai asal
-- dan bukan ditolak, supaya borang yang menghantar seluruh baris kekal
-- berfungsi.

BEGIN;

-- Ringkasan: benar apabila pemanggil ialah kerja sisi pelayan atau pentadbir.
CREATE OR REPLACE FUNCTION public.qm_caller_is_privileged()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
BEGIN
  IF current_user IN ('service_role', 'supabase_admin', 'postgres') THEN
    RETURN true;
  END IF;
  RETURN public.qm_is_admin();
END;
$fn$;

-- 1. qm_submissions -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_guard_submission_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_hunt uuid;
BEGIN
  IF public.qm_caller_is_privileged() THEN
    RETURN NEW;
  END IF;

  v_hunt := public.qm_challenge_hunt(NEW.challenge_id);
  IF v_hunt IS NOT NULL
     AND (public.qm_hunt_owner(v_hunt) = auth.uid()
          OR public.qm_is_hunt_class_educator(v_hunt)) THEN
    RETURN NEW;
  END IF;

  -- Pelajar menghantar jawapan. Keputusan penilaian bukan miliknya.
  IF TG_OP = 'INSERT' THEN
    NEW.status      := 'pending';
    NEW.reviewed_by := NULL;
    NEW.user_id     := COALESCE(auth.uid(), NEW.user_id);
  ELSE
    NEW.status       := OLD.status;
    NEW.reviewed_by  := OLD.reviewed_by;
    NEW.user_id      := OLD.user_id;
    NEW.challenge_id := OLD.challenge_id;
    NEW.created_at   := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS qm_submissions_guard_review ON public.qm_submissions;
CREATE TRIGGER qm_submissions_guard_review
  BEFORE INSERT OR UPDATE ON public.qm_submissions
  FOR EACH ROW EXECUTE FUNCTION public.qm_guard_submission_review();

-- 2. qm_teams -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_guard_team_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF public.qm_caller_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF OLD.hunt_id IS NOT NULL AND public.qm_hunt_owner(OLD.hunt_id) = auth.uid() THEN
    RETURN NEW;
  END IF;
  IF OLD.class_id IS NOT NULL AND public.qm_is_class_educator(OLD.class_id) THEN
    RETURN NEW;
  END IF;

  -- Ahli pasukan boleh menamakan semula pasukan. Selebihnya milik pendidik.
  NEW.id          := OLD.id;
  NEW.score       := OLD.score;
  NEW.join_code   := OLD.join_code;
  NEW.max_members := OLD.max_members;
  NEW.hunt_id     := OLD.hunt_id;
  NEW.class_id    := OLD.class_id;
  NEW.created_at  := OLD.created_at;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS qm_teams_guard_score ON public.qm_teams;
CREATE TRIGGER qm_teams_guard_score
  BEFORE UPDATE ON public.qm_teams
  FOR EACH ROW EXECUTE FUNCTION public.qm_guard_team_score();

-- 3. qm_group_submissions -------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_guard_group_submission_grade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF public.qm_caller_is_privileged() THEN
    RETURN NEW;
  END IF;
  IF public.qm_can_manage_board(NEW.board_id) THEN
    RETURN NEW;
  END IF;

  -- Pasukan menghantar dan menghantar semula. Gred milik pendidik.
  -- Menghantar semula memadam gred terdahulu, sama seperti niat kod
  -- aplikasi. Maklum balas pendidik dipadam bersama skor supaya komen lama
  -- tidak tergantung pada hantaran baharu.
  NEW.score     := NULL;
  NEW.feedback  := NULL;
  NEW.graded_by := NULL;
  NEW.graded_at := NULL;

  IF NEW.status IS DISTINCT FROM 'needs_revision' THEN
    NEW.status := 'in_review';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.board_id   := OLD.board_id;
    NEW.team_id    := OLD.team_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS qm_group_submissions_guard_grade ON public.qm_group_submissions;
CREATE TRIGGER qm_group_submissions_guard_grade
  BEFORE INSERT OR UPDATE ON public.qm_group_submissions
  FOR EACH ROW EXECUTE FUNCTION public.qm_guard_group_submission_grade();

COMMIT;
