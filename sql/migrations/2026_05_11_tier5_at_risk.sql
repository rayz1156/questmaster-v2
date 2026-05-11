-- Migration: Tier-5 At-Risk Student Prediction
-- Adds qm_at_risk_summary(p_class_id) RPC.
-- Aggregates engagement + submission signals per student in a class and returns a risk score (0..100), bucket, and reasons.
-- SECURITY DEFINER + class-ownership/co-educator check, mirroring qm_engagement_summary.
-- Safe to re-run: uses CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.qm_at_risk_summary(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_authorised boolean := false;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_class_id IS NULL THEN
    RAISE EXCEPTION 'class_id required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.qm_classes c
    WHERE c.id = p_class_id
      AND (c.owner_id = v_uid
           OR EXISTS (SELECT 1 FROM public.qm_class_educators ce
                      WHERE ce.class_id = c.id AND ce.educator_id = v_uid))
  ) INTO v_is_authorised;
  IF NOT v_is_authorised THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH members AS (
    SELECT cm.user_id, p.display_name, p.username
    FROM public.qm_class_members cm
    LEFT JOIN public.qm_profiles p ON p.id = cm.user_id
    WHERE cm.class_id = p_class_id
  ),
  class_hunts AS (
    SELECT id FROM public.qm_hunts WHERE class_id = p_class_id
  ),
  class_challenges AS (
    SELECT ch.id FROM public.qm_challenges ch
    JOIN class_hunts h ON h.id = ch.hunt_id
  ),
  ev AS (
    SELECT user_id, event_type, created_at
    FROM public.qm_analytics_events
    WHERE class_id = p_class_id
      AND created_at > now() - interval '60 days'
  ),
  ev_agg AS (
    SELECT
      m.user_id,
      MAX(ev.created_at) AS last_event_at,
      COUNT(*) FILTER (WHERE ev.created_at > now() - interval '7 days')  AS events_7d,
      COUNT(*) FILTER (WHERE ev.created_at > now() - interval '30 days') AS events_30d,
      COUNT(*) FILTER (WHERE ev.event_type='quest_open'   AND ev.created_at > now() - interval '30 days') AS quest_opens_30d,
      COUNT(*) FILTER (WHERE ev.event_type='quest_submit' AND ev.created_at > now() - interval '30 days') AS quest_submits_30d
    FROM members m
    LEFT JOIN ev ON ev.user_id = m.user_id
    GROUP BY m.user_id
  ),
  sub AS (
    SELECT s.user_id, s.status, s.created_at
    FROM public.qm_submissions s
    JOIN class_challenges cc ON cc.id = s.challenge_id
  ),
  sub_agg AS (
    SELECT
      m.user_id,
      COUNT(sub.user_id)                                                       AS total_subs,
      COUNT(*) FILTER (WHERE sub.status='approved')                           AS approved_subs,
      COUNT(*) FILTER (WHERE sub.status='rejected')                           AS rejected_subs,
      COUNT(*) FILTER (WHERE sub.created_at > now() - interval '7 days')      AS subs_7d,
      COUNT(*) FILTER (WHERE sub.created_at > now() - interval '30 days')     AS subs_30d,
      MAX(sub.created_at)                                                     AS last_sub_at
    FROM members m
    LEFT JOIN sub ON sub.user_id = m.user_id
    GROUP BY m.user_id
  ),
  scored AS (
    SELECT
      m.user_id,
      m.display_name,
      m.username,
      e.last_event_at,
      COALESCE(e.events_7d,0)        AS events_7d,
      COALESCE(e.events_30d,0)       AS events_30d,
      COALESCE(e.quest_opens_30d,0)  AS quest_opens_30d,
      COALESCE(e.quest_submits_30d,0) AS quest_submits_30d,
      COALESCE(s.total_subs,0)       AS total_subs,
      COALESCE(s.approved_subs,0)    AS approved_subs,
      COALESCE(s.rejected_subs,0)    AS rejected_subs,
      COALESCE(s.subs_7d,0)          AS subs_7d,
      COALESCE(s.subs_30d,0)         AS subs_30d,
      s.last_sub_at,
      CASE WHEN e.last_event_at IS NULL THEN 999
           ELSE EXTRACT(DAY FROM (now() - e.last_event_at))::int END          AS days_since_event
    FROM members m
    LEFT JOIN ev_agg e ON e.user_id = m.user_id
    LEFT JOIN sub_agg s ON s.user_id = m.user_id
  ),
  risk AS (
    SELECT *,
      -- weighted risk components (0..100 each)
      LEAST(100, GREATEST(0, (days_since_event * 7)))                                      AS r_inactivity,
      CASE WHEN events_7d = 0 THEN 60 WHEN events_7d < 3 THEN 30 ELSE 0 END                AS r_low_recent,
      CASE WHEN quest_opens_30d > 0 AND quest_submits_30d = 0 THEN 70
           WHEN quest_opens_30d > 0 AND quest_submits_30d::numeric/quest_opens_30d < 0.2 THEN 40
           ELSE 0 END                                                                       AS r_open_no_submit,
      CASE WHEN subs_30d = 0 THEN 50 WHEN subs_7d = 0 AND subs_30d < 3 THEN 25 ELSE 0 END  AS r_sub_drought,
      CASE WHEN (approved_subs + rejected_subs) >= 3
             AND rejected_subs::numeric / GREATEST(approved_subs + rejected_subs,1) > 0.5 THEN 30
           ELSE 0 END                                                                       AS r_reject_rate
    FROM scored
  ),
  final AS (
    SELECT *,
      LEAST(100, ROUND(
        (r_inactivity      * 0.30) +
        (r_low_recent      * 0.20) +
        (r_open_no_submit  * 0.20) +
        (r_sub_drought     * 0.20) +
        (r_reject_rate     * 0.10)
      ))::int AS risk_score
    FROM risk
  )
  SELECT jsonb_build_object(
    'class_id', p_class_id,
    'generated_at', now(),
    'students',
    COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'user_id', f.user_id,
           'display_name', f.display_name,
           'username', f.username,
           'risk_score', f.risk_score,
           'risk_bucket', CASE WHEN f.risk_score >= 70 THEN 'high'
                                WHEN f.risk_score >= 40 THEN 'medium'
                                ELSE 'low' END,
           'days_since_event', f.days_since_event,
           'last_event_at', f.last_event_at,
           'events_7d', f.events_7d,
           'events_30d', f.events_30d,
           'quest_opens_30d', f.quest_opens_30d,
           'quest_submits_30d', f.quest_submits_30d,
           'total_subs', f.total_subs,
           'approved_subs', f.approved_subs,
           'rejected_subs', f.rejected_subs,
           'subs_7d', f.subs_7d,
           'subs_30d', f.subs_30d,
           'last_sub_at', f.last_sub_at,
           'reasons', (
             SELECT to_jsonb(ARRAY_REMOVE(ARRAY[
               CASE WHEN f.days_since_event >= 14 THEN 'Inactive for '||f.days_since_event||' days' WHEN f.days_since_event >= 7 THEN 'No activity in 7+ days' END,
               CASE WHEN f.events_7d = 0 THEN 'No events in the last 7 days' END,
               CASE WHEN f.quest_opens_30d > 0 AND f.quest_submits_30d = 0 THEN 'Opens quests but never submits' END,
               CASE WHEN f.subs_30d = 0 AND f.total_subs > 0 THEN 'No submissions in 30 days (was previously active)' END,
               CASE WHEN f.subs_30d = 0 AND f.total_subs = 0 THEN 'Never submitted anything' END,
               CASE WHEN (f.approved_subs + f.rejected_subs) >= 3 AND f.rejected_subs::numeric / GREATEST(f.approved_subs + f.rejected_subs,1) > 0.5 THEN 'High rejection rate (>50%)' END
             ], NULL))
           )
         )
         ORDER BY f.risk_score DESC, f.days_since_event DESC
       )
       FROM final f),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.qm_at_risk_summary(uuid) TO authenticated;
