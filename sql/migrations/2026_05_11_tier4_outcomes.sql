-- Tier 4: Learning outcomes & mastery
-- 1) Outcomes scoped to a class
-- 2) Many-to-many tag between challenges and outcomes
-- 3) RPC qm_mastery_summary(p_class_id) for per-student per-outcome mastery

-- =========================
-- Tables
-- =========================
CREATE TABLE IF NOT EXISTS public.qm_learning_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.qm_classes(id) ON DELETE CASCADE,
  code text,
  label text NOT NULL,
  description text,
  created_by uuid REFERENCES public.qm_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qm_lo_class_idx ON public.qm_learning_outcomes(class_id);

CREATE TABLE IF NOT EXISTS public.qm_challenge_outcomes (
  challenge_id uuid NOT NULL REFERENCES public.qm_challenges(id) ON DELETE CASCADE,
  outcome_id  uuid NOT NULL REFERENCES public.qm_learning_outcomes(id) ON DELETE CASCADE,
  weight numeric(4,2) NOT NULL DEFAULT 1.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, outcome_id)
);
CREATE INDEX IF NOT EXISTS qm_co_outcome_idx ON public.qm_challenge_outcomes(outcome_id);

-- =========================
-- RLS
-- =========================
ALTER TABLE public.qm_learning_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qm_challenge_outcomes ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a class owner or co-educator?
CREATE OR REPLACE FUNCTION public.qm_is_class_editor(p_class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM qm_classes c WHERE c.id = p_class_id AND c.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM qm_class_educators ce WHERE ce.class_id = p_class_id AND ce.educator_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.qm_is_class_editor(uuid) TO authenticated;

DROP POLICY IF EXISTS p_lo_read ON public.qm_learning_outcomes;
DROP POLICY IF EXISTS p_lo_write ON public.qm_learning_outcomes;
CREATE POLICY p_lo_read ON public.qm_learning_outcomes
  FOR SELECT TO authenticated USING (qm_is_class_editor(class_id));
CREATE POLICY p_lo_write ON public.qm_learning_outcomes
  FOR ALL TO authenticated
  USING (qm_is_class_editor(class_id))
  WITH CHECK (qm_is_class_editor(class_id));

DROP POLICY IF EXISTS p_co_read ON public.qm_challenge_outcomes;
DROP POLICY IF EXISTS p_co_write ON public.qm_challenge_outcomes;
CREATE POLICY p_co_read ON public.qm_challenge_outcomes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM qm_learning_outcomes lo
      WHERE lo.id = qm_challenge_outcomes.outcome_id
        AND qm_is_class_editor(lo.class_id)
    )
  );
CREATE POLICY p_co_write ON public.qm_challenge_outcomes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM qm_learning_outcomes lo
      WHERE lo.id = qm_challenge_outcomes.outcome_id
        AND qm_is_class_editor(lo.class_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM qm_learning_outcomes lo
      WHERE lo.id = qm_challenge_outcomes.outcome_id
        AND qm_is_class_editor(lo.class_id)
    )
  );

-- =========================
-- Mastery summary RPC
-- =========================
CREATE OR REPLACE FUNCTION public.qm_mastery_summary(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_authorised boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM qm_classes c
    WHERE c.id = p_class_id
      AND (c.owner_id = v_uid
           OR EXISTS (SELECT 1 FROM qm_class_educators ce WHERE ce.class_id = c.id AND ce.educator_id = v_uid))
  ) INTO v_authorised;
  IF NOT v_authorised THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH class_hunts AS (
    SELECT id FROM qm_hunts WHERE class_id = p_class_id
  ),
  class_challenges AS (
    SELECT id FROM qm_challenges WHERE hunt_id IN (SELECT id FROM class_hunts)
  ),
  outcomes AS (
    SELECT lo.id, lo.code, lo.label, lo.description
    FROM qm_learning_outcomes lo
    WHERE lo.class_id = p_class_id
  ),
  -- Tagged challenges per outcome
  oc AS (
    SELECT co.outcome_id, co.challenge_id, co.weight
    FROM qm_challenge_outcomes co
    JOIN outcomes o ON o.id = co.outcome_id
    WHERE co.challenge_id IN (SELECT id FROM class_challenges)
  ),
  outcome_counts AS (
    SELECT o.id AS outcome_id, COUNT(oc.challenge_id)::int AS tagged_challenges
    FROM outcomes o LEFT JOIN oc ON oc.outcome_id = o.id
    GROUP BY o.id
  ),
  members AS (
    SELECT cm.user_id, p.display_name, p.username
    FROM qm_class_members cm
    LEFT JOIN qm_profiles p ON p.id = cm.user_id
    WHERE cm.class_id = p_class_id
  ),
  -- Per (user, outcome) approved/rejected counts across the tagged challenges
  per_user_outcome AS (
    SELECT
      m.user_id,
      oc.outcome_id,
      COUNT(*) FILTER (WHERE s.status = 'approved') AS approved,
      COUNT(*) FILTER (WHERE s.status = 'rejected') AS rejected,
      COUNT(*) FILTER (WHERE s.status IN ('approved','rejected')) AS scored,
      COUNT(*) AS total
    FROM members m
    CROSS JOIN oc
    LEFT JOIN qm_submissions s
      ON s.user_id = m.user_id
     AND s.challenge_id = oc.challenge_id
    GROUP BY m.user_id, oc.outcome_id
  ),
  per_user_outcome_scored AS (
    SELECT
      puo.user_id,
      puo.outcome_id,
      puo.approved,
      puo.rejected,
      puo.scored,
      puo.total,
      CASE
        WHEN puo.scored = 0 THEN NULL
        ELSE ROUND((puo.approved::numeric / puo.scored) * 100)::int
      END AS mastery_pct,
      CASE
        WHEN puo.scored = 0 THEN 'not_attempted'
        WHEN puo.approved::numeric / puo.scored >= 0.8 AND puo.scored >= 2 THEN 'mastered'
        WHEN puo.approved::numeric / puo.scored < 0.4 AND puo.scored >= 2 THEN 'struggling'
        ELSE 'developing'
      END AS bucket
    FROM per_user_outcome puo
  ),
  outcomes_arr AS (
    SELECT jsonb_agg(jsonb_build_object(
      'outcome_id', o.id,
      'code', o.code,
      'label', o.label,
      'description', o.description,
      'tagged_challenges', COALESCE(oct.tagged_challenges, 0),
      'mastered_students', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.outcome_id = o.id AND x.bucket = 'mastered'
      ),
      'struggling_students', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.outcome_id = o.id AND x.bucket = 'struggling'
      ),
      'developing_students', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.outcome_id = o.id AND x.bucket = 'developing'
      ),
      'not_attempted_students', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.outcome_id = o.id AND x.bucket = 'not_attempted'
      ),
      'avg_mastery_pct', (
        SELECT ROUND(AVG(x.mastery_pct))::int FROM per_user_outcome_scored x
        WHERE x.outcome_id = o.id AND x.mastery_pct IS NOT NULL
      )
    ) ORDER BY o.code NULLS LAST, o.label) AS rows
    FROM outcomes o LEFT JOIN outcome_counts oct ON oct.outcome_id = o.id
  ),
  students_arr AS (
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', m.user_id,
      'name', COALESCE(m.display_name, m.username, 'Student'),
      'outcomes', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'outcome_id', x.outcome_id,
          'approved', x.approved,
          'rejected', x.rejected,
          'scored', x.scored,
          'total', x.total,
          'mastery_pct', x.mastery_pct,
          'bucket', x.bucket
        )), '[]'::jsonb)
        FROM per_user_outcome_scored x WHERE x.user_id = m.user_id
      ),
      'mastered_count', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.user_id = m.user_id AND x.bucket = 'mastered'
      ),
      'struggling_count', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.user_id = m.user_id AND x.bucket = 'struggling'
      )
    ) ORDER BY COALESCE(m.display_name, m.username, '')) AS rows
    FROM members m
  )
  SELECT jsonb_build_object(
    'class_id', p_class_id,
    'totals', jsonb_build_object(
      'outcomes', (SELECT COUNT(*) FROM outcomes),
      'tagged_challenges', (SELECT COUNT(DISTINCT challenge_id) FROM oc),
      'students', (SELECT COUNT(*) FROM members)
    ),
    'outcomes', COALESCE((SELECT rows FROM outcomes_arr), '[]'::jsonb),
    'students', COALESCE((SELECT rows FROM students_arr), '[]'::jsonb),
    'generated_at', now()
  )
  INTO v_result;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.qm_mastery_summary(uuid) TO authenticated;

-- =========================
-- Trigger to keep updated_at fresh
-- =========================
CREATE OR REPLACE FUNCTION public.qm_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS qm_lo_set_updated_at ON public.qm_learning_outcomes;
CREATE TRIGGER qm_lo_set_updated_at
  BEFORE UPDATE ON public.qm_learning_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.qm_set_updated_at();
