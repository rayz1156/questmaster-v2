-- 0064_kz019_pagar_papan_markah.sql (KZ-019, diluluskan Boss Hariz 17 Okt 2026)
--
-- Masalah (disahkan pada DB produksi 16 Okt 2026):
--   1. View qm_class_team_scores tidak ditapis langsung dan diberi GRANT
--      kepada anon serta authenticated. Sesiapa sahaja, termasuk tanpa log
--      masuk, boleh membaca nama pasukan dan markah semua kelas.
--   2. View qm_class_individual_scores ditapis ikut keahlian kelas
--      (qm_boleh_lihat_markah_kelas), tetapi tidak menghormati
--      qm_classes.leaderboard_visible. Rakan sekelas boleh membaca markah
--      individu melalui REST walaupun pendidik menyembunyikan leaderboard.
--
-- Pembaikan:
--   - Fungsi baharu qm_boleh_lihat_papan_kelas(class): papan penuh kelas
--     boleh dilihat oleh service_role, pendidik diterima, pemilik, admin
--     aktif, atau ahli kelas JIKA leaderboard_visible tidak false.
--   - qm_class_individual_scores: baris sendiri sentiasa nampak kepada ahli;
--     baris orang lain hanya jika papan kelas boleh dilihat.
--   - qm_class_team_scores: kini berpagar. Papan penuh ikut fungsi di atas;
--     ahli kelas sentiasa nampak pasukan sendiri.
--   - REVOKE semua daripada anon; authenticated hanya SELECT.
--
-- Lajur kedua-dua view TIDAK berubah (CREATE OR REPLACE dengan lajur sama),
-- jadi kod aplikasi tidak perlu diubah. Fungsi qm_insights_kelas dan
-- qm_certificate_participant_eligible hanya dipanggil oleh pendidik, jadi
-- hasilnya tidak berubah.

BEGIN;

CREATE OR REPLACE FUNCTION public.qm_boleh_lihat_papan_kelas(p_class uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    auth.role() = 'service_role'
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
    OR public.qm_admin_aktif()
    OR EXISTS (
      SELECT 1
      FROM public.qm_class_members cm
      JOIN public.qm_classes c ON c.id = cm.class_id
      WHERE cm.class_id = p_class
        AND cm.user_id = auth.uid()
        AND coalesce(c.leaderboard_visible, true)
    );
$function$;

REVOKE ALL ON FUNCTION public.qm_boleh_lihat_papan_kelas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_boleh_lihat_papan_kelas(uuid) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.qm_class_individual_scores AS
 SELECT cm.class_id,
    cm.user_id,
    p.display_name,
    COALESCE(( SELECT sum(ch.points) AS sum
           FROM qm_submissions s
             JOIN qm_challenges ch ON ch.id = s.challenge_id
             JOIN qm_hunts h ON h.id = ch.hunt_id
          WHERE s.user_id = cm.user_id AND s.status = 'approved'::text AND h.class_id = cm.class_id), 0::bigint) + COALESCE(( SELECT sum(lp.score) AS sum
           FROM qm_live_players lp
             JOIN qm_live_sessions ls ON ls.id = lp.session_id
             JOIN qm_live_quizzes lq ON lq.id = ls.quiz_id
          WHERE lp.user_id = cm.user_id AND lq.class_id = cm.class_id AND ls.status <> 'lobby'::text), 0::bigint) + COALESCE(( SELECT sum(a.delta) AS sum
           FROM qm_student_score_adjustments a
          WHERE a.user_id = cm.user_id AND a.class_id = cm.class_id), 0::bigint) AS total_score,
    COALESCE(( SELECT sum(ch.points) AS sum
           FROM qm_submissions s
             JOIN qm_challenges ch ON ch.id = s.challenge_id
             JOIN qm_hunts h ON h.id = ch.hunt_id
          WHERE s.user_id = cm.user_id AND s.status = 'approved'::text AND h.class_id = cm.class_id), 0::bigint) AS task_score,
    COALESCE(( SELECT sum(lp.score) AS sum
           FROM qm_live_players lp
             JOIN qm_live_sessions ls ON ls.id = lp.session_id
             JOIN qm_live_quizzes lq ON lq.id = ls.quiz_id
          WHERE lp.user_id = cm.user_id AND lq.class_id = cm.class_id AND ls.status <> 'lobby'::text), 0::bigint) AS live_score,
    COALESCE(( SELECT sum(a.delta) AS sum
           FROM qm_student_score_adjustments a
          WHERE a.user_id = cm.user_id AND a.class_id = cm.class_id), 0::bigint) AS adjustment_score,
    ( SELECT count(DISTINCT lp.session_id) AS count
           FROM qm_live_players lp
             JOIN qm_live_sessions ls ON ls.id = lp.session_id
             JOIN qm_live_quizzes lq ON lq.id = ls.quiz_id
          WHERE lp.user_id = cm.user_id AND lq.class_id = cm.class_id AND ls.status <> 'lobby'::text) AS live_sessions
   FROM qm_class_members cm
     JOIN qm_profiles p ON p.id = cm.user_id
  WHERE qm_boleh_lihat_markah_kelas(cm.class_id)
    AND (cm.user_id = auth.uid() OR qm_boleh_lihat_papan_kelas(cm.class_id));

CREATE OR REPLACE VIEW public.qm_class_team_scores AS
 SELECT t.id AS team_id,
    t.class_id,
    t.name AS team_name,
    t.score AS base_score,
    COALESCE(( SELECT sum(c.points) AS sum
           FROM qm_submissions s
             JOIN qm_challenges c ON c.id = s.challenge_id
          WHERE s.team_id = t.id AND s.status = 'approved'::text), 0::bigint) + COALESCE(( SELECT sum(qc.awarded_points) AS sum
           FROM qm_team_quest_completions qc
          WHERE qc.team_id = t.id), 0::bigint) AS task_score,
    COALESCE(( SELECT sum(a.delta) AS sum
           FROM qm_score_adjustments a
          WHERE a.team_id = t.id AND NOT (EXISTS ( SELECT 1
                   FROM qm_team_quest_completions qc2
                  WHERE qc2.adjustment_id = a.id))), 0::bigint) AS adjustment_score,
    t.score + COALESCE(( SELECT sum(c.points) AS sum
           FROM qm_submissions s
             JOIN qm_challenges c ON c.id = s.challenge_id
          WHERE s.team_id = t.id AND s.status = 'approved'::text), 0::bigint) + COALESCE(( SELECT sum(qc.awarded_points) AS sum
           FROM qm_team_quest_completions qc
          WHERE qc.team_id = t.id), 0::bigint) + COALESCE(( SELECT sum(a.delta) AS sum
           FROM qm_score_adjustments a
          WHERE a.team_id = t.id AND NOT (EXISTS ( SELECT 1
                   FROM qm_team_quest_completions qc2
                  WHERE qc2.adjustment_id = a.id))), 0::bigint) AS total_score
   FROM qm_teams t
  WHERE t.class_id IS NOT NULL
    AND (
      qm_boleh_lihat_papan_kelas(t.class_id)
      OR (
        qm_boleh_lihat_markah_kelas(t.class_id)
        AND EXISTS (
          SELECT 1 FROM qm_team_members tm
          WHERE tm.team_id = t.id AND tm.user_id = auth.uid()
        )
      )
    );

REVOKE ALL ON public.qm_class_individual_scores FROM anon, authenticated;
REVOKE ALL ON public.qm_class_team_scores FROM anon, authenticated;
GRANT SELECT ON public.qm_class_individual_scores TO authenticated;
GRANT SELECT ON public.qm_class_team_scores TO authenticated;
GRANT SELECT ON public.qm_class_individual_scores TO service_role;
GRANT SELECT ON public.qm_class_team_scores TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
