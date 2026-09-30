-- 0050_markah_peserta_educator.sql (V2-013)
--
-- Markah terkumpul peserta untuk educator: halaman People dan eksport CSV.
-- Dua perkara:
--   1. Fungsi public.qm_boleh_lihat_markah_kelas(p_class): penapis kebenaran
--      satu tempat. Benar untuk ahli kelas (qm_class_members), educator kelas
--      yang sudah menerima jemputan (qm_class_educators dengan accepted_at
--      tidak null), pemilik kelas (qm_classes.owner_id) dan pentadbir aktif
--      (public.qm_admin_aktif()). service_role juga benar supaya klien
--      perkhidmatan (laluan scores dan sijil) terus berfungsi.
--   2. CREATE OR REPLACE VIEW qm_class_individual_scores: definisi 0049
--      disalin bulat-bulat (lapan lajur, kedudukan sama, sesi 'lobby' tetap
--      dikecualikan) dan ditambah WHERE qm_boleh_lihat_markah_kelas. Sebelum
--      ini view berjalan sebagai pemilik tanpa penapis, jadi mana-mana
--      pengguna log masuk boleh membaca nama dan markah semua kelas dengan
--      menukar class_id (temuan kzsec V2-012 P4). CREATE OR REPLACE tidak
--      menyentuh geran, pemilikan atau tingkah laku akses sedia ada.
--
-- Ahli kelas sengaja dibenarkan kerana kedudukan peserta
-- (src/app/participant/leaderboard) membaca view ini dengan sesi sendiri.
--
-- Idempoten: CREATE OR REPLACE dan REVOKE/GRANT boleh diulang.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Fungsi kebenaran: satu tempat, dipanggil oleh view
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_boleh_lihat_markah_kelas(p_class uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    -- service_role: klien perkhidmatan (laluan scores, fungsi sijil 0042)
    -- membaca view tanpa JWT pengguna. auth.role() membaca tuntutan role
    -- daripada request.jwt.claims; ia TIDAK terjejas oleh SECURITY DEFINER,
    -- berbeza dengan current_user yang sentiasa pemilik fungsi di sini.
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.qm_class_members cm
      WHERE cm.class_id = p_class AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.qm_class_educators ce
      WHERE ce.class_id = p_class
        AND ce.educator_id = auth.uid()
        AND ce.accepted_at IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.qm_classes c
      WHERE c.id = p_class AND c.owner_id = auth.uid()
    )
    OR public.qm_admin_aktif();
$fn$;

-- Fungsi membaca jadual keahlian sebagai pemilik definisi (SECURITY
-- DEFINER) supaya penapis berfungsi walaupun RLS menolak pemanggil.
-- Ia hanya memulangkan boolean; tiada data pelajar bocor melaluinya.
-- Boleh dilaksana oleh authenticated (view memanggilnya bagi setiap baris
-- atas identiti pemanggil) dan service_role; anon dan PUBLIC ditolak.
REVOKE ALL ON FUNCTION public.qm_boleh_lihat_markah_kelas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_boleh_lihat_markah_kelas(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. View: definisi 0049 + penapis kebenaran
-- ---------------------------------------------------------------------
-- Lajur asal kekal pada kedudukan asal (class_id, user_id, display_name,
-- total_score) supaya pengguna sedia ada (termasuk fungsi sijil 0042 yang
-- membaca total_score) tidak berubah tingkah laku. total_score kekal
-- task_score + live_score + adjustment_score. Sesi 'lobby' tidak dikira
-- dalam live_score mahupun live_sessions. Satu-satunya perubahan: WHERE.
CREATE OR REPLACE VIEW public.qm_class_individual_scores AS
SELECT cm.class_id,
       cm.user_id,
       p.display_name,
       COALESCE((SELECT SUM(ch.points)
                   FROM public.qm_submissions s
                   JOIN public.qm_challenges ch ON ch.id = s.challenge_id
                   JOIN public.qm_hunts h ON h.id = ch.hunt_id
                  WHERE s.user_id = cm.user_id
                    AND s.status = 'approved'
                    AND h.class_id = cm.class_id), 0::bigint)
     + COALESCE((SELECT SUM(lp.score)
                   FROM public.qm_live_players lp
                   JOIN public.qm_live_sessions ls ON ls.id = lp.session_id
                   JOIN public.qm_live_quizzes lq ON lq.id = ls.quiz_id
                  WHERE lp.user_id = cm.user_id
                    AND lq.class_id = cm.class_id
                    AND ls.status <> 'lobby'), 0::bigint)
     + COALESCE((SELECT SUM(a.delta)
                   FROM public.qm_student_score_adjustments a
                  WHERE a.user_id = cm.user_id
                    AND a.class_id = cm.class_id), 0::bigint) AS total_score,
       COALESCE((SELECT SUM(ch.points)
                   FROM public.qm_submissions s
                   JOIN public.qm_challenges ch ON ch.id = s.challenge_id
                   JOIN public.qm_hunts h ON h.id = ch.hunt_id
                  WHERE s.user_id = cm.user_id
                    AND s.status = 'approved'
                    AND h.class_id = cm.class_id), 0::bigint) AS task_score,
       COALESCE((SELECT SUM(lp.score)
                   FROM public.qm_live_players lp
                   JOIN public.qm_live_sessions ls ON ls.id = lp.session_id
                   JOIN public.qm_live_quizzes lq ON lq.id = ls.quiz_id
                  WHERE lp.user_id = cm.user_id
                    AND lq.class_id = cm.class_id
                    AND ls.status <> 'lobby'), 0::bigint) AS live_score,
       COALESCE((SELECT SUM(a.delta)
                   FROM public.qm_student_score_adjustments a
                  WHERE a.user_id = cm.user_id
                    AND a.class_id = cm.class_id), 0::bigint) AS adjustment_score,
       (SELECT COUNT(DISTINCT lp.session_id)
          FROM public.qm_live_players lp
          JOIN public.qm_live_sessions ls ON ls.id = lp.session_id
          JOIN public.qm_live_quizzes lq ON lq.id = ls.quiz_id
         WHERE lp.user_id = cm.user_id
           AND lq.class_id = cm.class_id
           AND ls.status <> 'lobby') AS live_sessions
  FROM public.qm_class_members cm
  JOIN public.qm_profiles p ON p.id = cm.user_id
 WHERE public.qm_boleh_lihat_markah_kelas(cm.class_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
