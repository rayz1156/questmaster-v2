-- Tier 6: Gamification analytics (leaderboard volatility, badges, streaks)
-- Read-only RPC; no schema changes. Virtual badges are derived on the fly.

CREATE OR REPLACE FUNCTION public.qm_gamification_summary(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_is_coed boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT EXISTS(SELECT 1 FROM qm_classes WHERE id = p_class_id AND owner_id = v_uid)
    INTO v_is_owner;
  SELECT EXISTS(SELECT 1 FROM qm_class_educators WHERE class_id = p_class_id AND educator_id = v_uid)
    INTO v_is_coed;
  IF NOT (v_is_owner OR v_is_coed) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  WITH class_hunts AS (
    SELECT id, title FROM qm_hunts WHERE class_id = p_class_id
  ),
  team_rows AS (
    SELECT
      t.id AS team_id,
      t.name,
      t.hunt_id,
      t.score,
      (SELECT COUNT(*) FROM qm_team_quest_completions c WHERE c.team_id = t.id) AS completions,
      (SELECT MAX(c.created_at) FROM qm_team_quest_completions c WHERE c.team_id = t.id) AS last_completion_at,
      (SELECT COUNT(*) FROM qm_team_members m WHERE m.team_id = t.id) AS member_count
    FROM qm_teams t
    WHERE t.hunt_id IN (SELECT id FROM class_hunts)
  ),
  team_ranked AS (
    SELECT *,
      RANK() OVER (PARTITION BY hunt_id ORDER BY score DESC, last_completion_at NULLS LAST) AS rank_in_hunt
    FROM team_rows
  ),
  team_rankings AS (
    SELECT jsonb_agg(jsonb_build_object(
      'team_id', team_id,
      'name', name,
      'hunt_id', hunt_id,
      'score', score,
      'completions', completions,
      'member_count', member_count,
      'last_completion_at', last_completion_at,
      'rank', rank_in_hunt
    ) ORDER BY score DESC NULLS LAST) AS rows
    FROM team_ranked
  ),
  -- Leaderboard volatility: count distinct (hunt_id, top_team_id) transitions in last 14 days
  -- We reconstruct top team at each completion event timestamp.
  hunt_events AS (
    SELECT c.hunt_id, c.team_id, c.awarded_points, c.created_at
    FROM qm_team_quest_completions c
    JOIN class_hunts ch ON ch.id = c.hunt_id
    WHERE c.created_at > now() - interval '14 days'
  ),
  -- Running sum per team within each hunt, leader at each event
  running AS (
    SELECT
      hunt_id,
      team_id,
      created_at,
      SUM(awarded_points) OVER (PARTITION BY hunt_id, team_id ORDER BY created_at) AS team_running
    FROM hunt_events
  ),
  leader_per_event AS (
    SELECT DISTINCT ON (r.hunt_id, r.created_at)
      r.hunt_id, r.created_at,
      FIRST_VALUE(r.team_id) OVER (
        PARTITION BY r.hunt_id, r.created_at
        ORDER BY r.team_running DESC, r.team_id
      ) AS leader_team_id
    FROM running r
  ),
  leader_changes AS (
    SELECT hunt_id, COUNT(*) AS changes
    FROM (
      SELECT hunt_id, leader_team_id,
        LAG(leader_team_id) OVER (PARTITION BY hunt_id ORDER BY created_at) AS prev_leader
      FROM leader_per_event
    ) z
    WHERE prev_leader IS NOT NULL AND leader_team_id <> prev_leader
    GROUP BY hunt_id
  ),
  volatility AS (
    SELECT
      COALESCE(SUM(changes), 0)::int AS total_leader_changes,
      LEAST(100, COALESCE(SUM(changes), 0) * 10)::int AS volatility_score
    FROM leader_changes
  ),
  -- Per-student daily activity for streaks (last 60 days)
  member_set AS (
    SELECT DISTINCT cm.user_id
    FROM qm_class_members cm
    WHERE cm.class_id = p_class_id
  ),
  active_days AS (
    SELECT e.user_id, (e.created_at AT TIME ZONE 'UTC')::date AS d
    FROM qm_analytics_events e
    JOIN member_set ms ON ms.user_id = e.user_id
    WHERE e.created_at > now() - interval '60 days'
    GROUP BY e.user_id, (e.created_at AT TIME ZONE 'UTC')::date
  ),
  numbered AS (
    SELECT user_id, d,
      d - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY d))::int AS grp
    FROM active_days
  ),
  streaks AS (
    SELECT user_id, MIN(d) AS start_d, MAX(d) AS end_d, COUNT(*)::int AS length
    FROM numbered
    GROUP BY user_id, grp
  ),
  current_streaks AS (
    SELECT s.user_id, s.length AS current_streak
    FROM streaks s
    WHERE s.end_d >= (CURRENT_DATE - 1)
  ),
  best_streaks AS (
    SELECT user_id, MAX(length) AS best_streak FROM streaks GROUP BY user_id
  ),
  per_user_subs AS (
    SELECT
      sub.user_id,
      COUNT(*) FILTER (WHERE sub.status = 'approved') AS approved,
      COUNT(*) FILTER (WHERE sub.status = 'rejected') AS rejected,
      COUNT(*) AS total
    FROM qm_submissions sub
    JOIN qm_challenges ch ON ch.id = sub.challenge_id
    JOIN class_hunts h ON h.id = ch.hunt_id
    WHERE sub.user_id IN (SELECT user_id FROM member_set)
    GROUP BY sub.user_id
  ),
  per_user_top_rank AS (
    SELECT m.user_id, MIN(tr.rank_in_hunt)::int AS best_rank
    FROM qm_team_members m
    JOIN team_ranked tr ON tr.team_id = m.team_id
    WHERE m.user_id IN (SELECT user_id FROM member_set)
    GROUP BY m.user_id
  ),
  per_user_consecutive_approved AS (
    SELECT user_id, MAX(run_len)::int AS max_streak
    FROM (
      SELECT user_id, status,
        COUNT(*) AS run_len
      FROM (
        SELECT user_id, status,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) -
          ROW_NUMBER() OVER (PARTITION BY user_id, status ORDER BY created_at) AS grp
        FROM qm_submissions
        WHERE user_id IN (SELECT user_id FROM member_set)
          AND status IN ('approved','rejected')
      ) z
      WHERE status = 'approved'
      GROUP BY user_id, status, grp
    ) zz
    GROUP BY user_id
  ),
  per_user AS (
    SELECT
      ms.user_id,
      p.display_name,
      p.username,
      COALESCE(cs.current_streak, 0) AS current_streak,
      COALESCE(bs.best_streak, 0) AS best_streak,
      COALESCE(pus.approved, 0) AS approved_subs,
      COALESCE(pus.rejected, 0) AS rejected_subs,
      COALESCE(pus.total, 0) AS total_subs,
      putr.best_rank,
      COALESCE(puca.max_streak, 0) AS max_approved_streak
    FROM member_set ms
    LEFT JOIN qm_profiles p ON p.id = ms.user_id
    LEFT JOIN current_streaks cs ON cs.user_id = ms.user_id
    LEFT JOIN best_streaks bs ON bs.user_id = ms.user_id
    LEFT JOIN per_user_subs pus ON pus.user_id = ms.user_id
    LEFT JOIN per_user_top_rank putr ON putr.user_id = ms.user_id
    LEFT JOIN per_user_consecutive_approved puca ON puca.user_id = ms.user_id
  ),
  per_user_with_badges AS (
    SELECT pu.*,
      (
        (CASE WHEN pu.approved_subs >= 1 THEN jsonb_build_array(jsonb_build_object('key','first_submission','label','First Submission','tier','bronze')) ELSE '[]'::jsonb END)
        || (CASE WHEN pu.approved_subs >= 5 THEN jsonb_build_array(jsonb_build_object('key','five_approved','label','5 Approved','tier','silver')) ELSE '[]'::jsonb END)
        || (CASE WHEN pu.approved_subs >= 10 THEN jsonb_build_array(jsonb_build_object('key','ten_approved','label','10 Approved','tier','gold')) ELSE '[]'::jsonb END)
        || (CASE WHEN pu.max_approved_streak >= 5 THEN jsonb_build_array(jsonb_build_object('key','flawless_5','label','5 Approved in a Row','tier','silver')) ELSE '[]'::jsonb END)
        || (CASE WHEN pu.current_streak >= 3 THEN jsonb_build_array(jsonb_build_object('key','streak_3','label','3-Day Streak','tier','bronze')) ELSE '[]'::jsonb END)
        || (CASE WHEN pu.current_streak >= 7 THEN jsonb_build_array(jsonb_build_object('key','streak_7','label','7-Day Streak','tier','silver')) ELSE '[]'::jsonb END)
        || (CASE WHEN pu.best_streak >= 14 THEN jsonb_build_array(jsonb_build_object('key','streak_14','label','14-Day Streak','tier','gold')) ELSE '[]'::jsonb END)
        || (CASE WHEN pu.best_rank = 1 THEN jsonb_build_array(jsonb_build_object('key','rank_1','label','Top of the Class','tier','gold')) ELSE '[]'::jsonb END)
        || (CASE WHEN pu.best_rank BETWEEN 2 AND 3 THEN jsonb_build_array(jsonb_build_object('key','rank_top3','label','Podium Finisher','tier','silver')) ELSE '[]'::jsonb END)
      ) AS badges
    FROM per_user pu
  ),
  top_streaks_arr AS (
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'name', COALESCE(display_name, username, 'Student'),
      'current_streak', current_streak, 'best_streak', best_streak
    ) ORDER BY current_streak DESC, best_streak DESC) AS rows
    FROM (
      SELECT * FROM per_user_with_badges
      WHERE current_streak > 0 OR best_streak > 0
      ORDER BY current_streak DESC, best_streak DESC
      LIMIT 10
    ) z
  ),
  per_user_arr AS (
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', user_id,
      'name', COALESCE(display_name, username, 'Student'),
      'current_streak', current_streak,
      'best_streak', best_streak,
      'approved_subs', approved_subs,
      'rejected_subs', rejected_subs,
      'total_subs', total_subs,
      'best_rank', best_rank,
      'max_approved_streak', max_approved_streak,
      'badges', badges,
      'badge_count', jsonb_array_length(badges)
    ) ORDER BY jsonb_array_length(badges) DESC, current_streak DESC) AS rows
    FROM per_user_with_badges
  ),
  badge_totals AS (
    SELECT SUM(jsonb_array_length(badges))::int AS total_badges_awarded
    FROM per_user_with_badges
  )
  SELECT jsonb_build_object(
    'team_rankings', COALESCE((SELECT rows FROM team_rankings), '[]'::jsonb),
    'leaderboard_volatility', jsonb_build_object(
      'window_days', 14,
      'total_leader_changes', (SELECT total_leader_changes FROM volatility),
      'volatility_score', (SELECT volatility_score FROM volatility)
    ),
    'top_streaks', COALESCE((SELECT rows FROM top_streaks_arr), '[]'::jsonb),
    'students', COALESCE((SELECT rows FROM per_user_arr), '[]'::jsonb),
    'totals', jsonb_build_object(
      'students', (SELECT COUNT(*) FROM member_set),
      'teams', (SELECT COUNT(*) FROM team_rows),
      'badges_awarded', COALESCE((SELECT total_badges_awarded FROM badge_totals), 0)
    ),
    'generated_at', now()
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.qm_gamification_summary(uuid) TO authenticated;
