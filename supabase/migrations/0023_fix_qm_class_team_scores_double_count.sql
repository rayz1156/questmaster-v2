-- Migration 0023: Fix qm_class_team_scores double-count
BEGIN;

CREATE OR REPLACE VIEW public.qm_class_team_scores AS
SELECT t.id AS team_id,
       t.class_id,
       t.name AS team_name,
       t.score AS base_score,
       COALESCE((SELECT sum(c.points) FROM qm_submissions s JOIN qm_challenges c ON c.id = s.challenge_id WHERE s.team_id = t.id AND s.status = 'approved'::text), 0::bigint)
       + COALESCE((SELECT sum(qc.awarded_points) FROM qm_team_quest_completions qc WHERE qc.team_id = t.id), 0::bigint) AS task_score,
       COALESCE((SELECT sum(a.delta) FROM qm_score_adjustments a WHERE a.team_id = t.id AND NOT EXISTS (SELECT 1 FROM qm_team_quest_completions qc2 WHERE qc2.adjustment_id = a.id)), 0::bigint) AS adjustment_score,
       t.score
       + COALESCE((SELECT sum(c.points) FROM qm_submissions s JOIN qm_challenges c ON c.id = s.challenge_id WHERE s.team_id = t.id AND s.status = 'approved'::text), 0::bigint)
       + COALESCE((SELECT sum(qc.awarded_points) FROM qm_team_quest_completions qc WHERE qc.team_id = t.id), 0::bigint)
       + COALESCE((SELECT sum(a.delta) FROM qm_score_adjustments a WHERE a.team_id = t.id AND NOT EXISTS (SELECT 1 FROM qm_team_quest_completions qc2 WHERE qc2.adjustment_id = a.id)), 0::bigint) AS total_score
  FROM qm_teams t
 WHERE t.class_id IS NOT NULL;

COMMIT;
