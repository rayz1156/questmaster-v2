-- Migration: Help/Feedback & Tier-1 Analytics
-- Run this in Supabase Studio (SQL editor) AFTER reviewing.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE.

-- ========== 1. Feedback table ==========
CREATE TABLE IF NOT EXISTS public.qm_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email   text,
  type         text NOT NULL CHECK (type IN ('bug','idea','question','other')),
  subject      text NOT NULL,
  message      text NOT NULL,
  page_url     text,
  user_agent   text,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','wontfix')),
  admin_notes  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qm_feedback_user_id_idx ON public.qm_feedback (user_id);
CREATE INDEX IF NOT EXISTS qm_feedback_status_idx ON public.qm_feedback (status, created_at DESC);

ALTER TABLE public.qm_feedback ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated (or anon for guests) can INSERT their own feedback.
DROP POLICY IF EXISTS qm_feedback_insert ON public.qm_feedback;
CREATE POLICY qm_feedback_insert ON public.qm_feedback
  FOR INSERT TO public
  WITH CHECK (true);

-- Users can read their own feedback. (Admin role read-all handled separately.)
DROP POLICY IF EXISTS qm_feedback_select_own ON public.qm_feedback;
CREATE POLICY qm_feedback_select_own ON public.qm_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ========== 2. Analytics events table ==========
CREATE TABLE IF NOT EXISTS public.qm_analytics_events (
  id           bigserial PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type   text NOT NULL,
  path         text,
  class_id     uuid,
  activity_id  uuid,
  session_id   text,
  metadata     jsonb,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qm_analytics_user_idx ON public.qm_analytics_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qm_analytics_class_idx ON public.qm_analytics_events (class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qm_analytics_event_idx ON public.qm_analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS qm_analytics_created_idx ON public.qm_analytics_events (created_at DESC);

ALTER TABLE public.qm_analytics_events ENABLE ROW LEVEL SECURITY;

-- Authenticated and anon users can INSERT their own events.
DROP POLICY IF EXISTS qm_analytics_insert ON public.qm_analytics_events;
CREATE POLICY qm_analytics_insert ON public.qm_analytics_events
  FOR INSERT TO public
  WITH CHECK (true);

-- Users can only see their own raw events; aggregates come via SECURITY DEFINER fn below.
DROP POLICY IF EXISTS qm_analytics_select_own ON public.qm_analytics_events;
CREATE POLICY qm_analytics_select_own ON public.qm_analytics_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ========== 3. Engagement aggregate RPC ==========
-- Returns engagement KPIs for a class. Caller must be the owner or a co-educator
-- of that class. Uses SECURITY DEFINER to bypass RLS on the events table for aggregates,
-- but enforces access manually via qm_classes.owner_id and qm_class_educators.

CREATE OR REPLACE FUNCTION public.qm_engagement_summary(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_authorised boolean := false;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_class_id IS NOT NULL THEN
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
  END IF;

  WITH events AS (
    SELECT * FROM public.qm_analytics_events
    WHERE (p_class_id IS NULL OR class_id = p_class_id)
      AND created_at > now() - interval '90 days'
  ),
  daily AS (
    SELECT date_trunc('day', created_at)::date AS day,
           COUNT(DISTINCT user_id) AS dau,
           COUNT(*) AS events
    FROM events
    GROUP BY 1
    ORDER BY 1
  ),
  by_hour AS (
    SELECT EXTRACT(hour FROM created_at)::int AS hour,
           COUNT(*) AS events
    FROM events
    GROUP BY 1
    ORDER BY 1
  ),
  last_active AS (
    SELECT user_id, MAX(created_at) AS last_seen
    FROM events
    WHERE user_id IS NOT NULL
    GROUP BY user_id
  ),
  inactivity AS (
    SELECT
      COUNT(*) FILTER (WHERE last_seen > now() - interval '1 day')   AS active_1d,
      COUNT(*) FILTER (WHERE last_seen > now() - interval '7 days')  AS active_7d,
      COUNT(*) FILTER (WHERE last_seen > now() - interval '30 days') AS active_30d,
      COUNT(*) FILTER (WHERE last_seen < now() - interval '7 days')  AS at_risk_inactive_7d
    FROM last_active
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*) FROM events) AS total_events,
      (SELECT COUNT(DISTINCT user_id) FROM events WHERE user_id IS NOT NULL) AS unique_users,
      (SELECT COUNT(*) FROM events WHERE event_type='page_view') AS page_views,
      (SELECT COUNT(*) FROM events WHERE event_type='login') AS logins,
      (SELECT COUNT(*) FROM events WHERE event_type='quest_open') AS quest_opens,
      (SELECT COUNT(*) FROM events WHERE event_type='quest_submit') AS quest_submits
  )
  SELECT jsonb_build_object(
    'class_id', p_class_id,
    'totals',  (SELECT row_to_json(totals) FROM totals),
    'inactivity', (SELECT row_to_json(inactivity) FROM inactivity),
    'daily',  COALESCE((SELECT jsonb_agg(row_to_json(daily)) FROM daily), '[]'::jsonb),
    'hourly', COALESCE((SELECT jsonb_agg(row_to_json(by_hour)) FROM by_hour), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.qm_engagement_summary(uuid) TO authenticated;

-- ========== Done ==========
