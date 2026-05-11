-- =============================================================
-- Tier 4 demo seed for Group A (A252 DEI 3033 AI)
-- Class:   4d99ba62-244c-44dd-b164-c2e795040efa
-- Creates: LO2; 36 challenges across the 12 Week hunts;
--          challenge<->outcome tags; submissions producing a
--          mastered / developing / struggling / not_attempted mix.
-- Sentinels:
--   qm_learning_outcomes.code = 'LO2'
--   qm_challenges.title LIKE '[SEED]%'
--   qm_submissions.answer LIKE 'SEED::%'
-- Teardown: sql/seeds/2026_05_12_tier4_demo_teardown.sql
-- =============================================================
BEGIN;

-- 0) Vars
DO $$
DECLARE
  v_class uuid := '4d99ba62-244c-44dd-b164-c2e795040efa';
  v_owner uuid := 'ee586ede-5cdd-4af5-85e9-bc011b2f6366';
  v_lo1   uuid;
  v_lo2   uuid;
  v_hunt  record;
  v_chal  uuid;
  v_qidx  int;
  v_chal_lo1 uuid[] := ARRAY[]::uuid[];
  v_chal_lo2 uuid[] := ARRAY[]::uuid[];
  v_chal_count int := 0;
  v_student record;
  v_sidx int := 0;
  v_bucket text;
  v_target_lo uuid;
  v_chal_pool uuid[];
  v_pick uuid;
  i int;
  approvals int;
BEGIN
  -- Reuse LO1 if present
  SELECT id INTO v_lo1
    FROM qm_learning_outcomes
    WHERE class_id = v_class AND code = 'LO1';
  IF v_lo1 IS NULL THEN
    INSERT INTO qm_learning_outcomes (class_id, code, label, description, created_by)
    VALUES (v_class, 'LO1', 'Understand neural network fundamentals',
            'Activation functions, perceptrons, and forward propagation', v_owner)
    RETURNING id INTO v_lo1;
  END IF;

  -- Insert LO2 (only if missing, keyed by code within class)
  SELECT id INTO v_lo2
    FROM qm_learning_outcomes
    WHERE class_id = v_class AND code = 'LO2';
  IF v_lo2 IS NULL THEN
    INSERT INTO qm_learning_outcomes (class_id, code, label, description, created_by)
    VALUES (v_class, 'LO2', 'Apply training & optimization techniques',
            'Loss functions, backpropagation, gradient descent', v_owner)
    RETURNING id INTO v_lo2;
  END IF;

  -- 1) Challenges: 3 per hunt across the 12 Week hunts
  FOR v_hunt IN
    SELECT id, title FROM qm_hunts
    WHERE class_id = v_class ORDER BY created_at
  LOOP
    FOR v_qidx IN 1..3 LOOP
      INSERT INTO qm_challenges (hunt_id, title, prompt, answer, points, order_idx)
      VALUES (
        v_hunt.id,
        '[SEED] ' || v_hunt.title || ' Q' || v_qidx,
        'Practice question ' || v_qidx || ' for ' || v_hunt.title || '.',
        'seed-answer-' || v_qidx,
        10,
        v_qidx - 1
      )
      RETURNING id INTO v_chal;
      v_chal_count := v_chal_count + 1;
      -- Alternate LO assignment: odd-indexed total -> LO1, even -> LO2
      IF (v_chal_count % 2) = 1 THEN
        INSERT INTO qm_challenge_outcomes (challenge_id, outcome_id, weight)
        VALUES (v_chal, v_lo1, 1.00);
        v_chal_lo1 := array_append(v_chal_lo1, v_chal);
      ELSE
        INSERT INTO qm_challenge_outcomes (challenge_id, outcome_id, weight)
        VALUES (v_chal, v_lo2, 1.00);
        v_chal_lo2 := array_append(v_chal_lo2, v_chal);
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Seeded % challenges (% on LO1, % on LO2)',
    v_chal_count, array_length(v_chal_lo1,1), array_length(v_chal_lo2,1);

  -- 2) Submissions per student per LO
  -- Distribution per outcome (34 students):
  --   sidx mod 10 = 0,1,2     -> mastered    (4/4 approved)
  --   sidx mod 10 = 3,4,5,6   -> developing  (2/4 approved)
  --   sidx mod 10 = 7,8       -> struggling  (1/4 approved)
  --   sidx mod 10 = 9         -> not_attempted (0 submissions)
  FOR v_student IN
    SELECT user_id FROM qm_class_members
    WHERE class_id = v_class ORDER BY joined_at
  LOOP
    FOR v_target_lo IN SELECT unnest(ARRAY[v_lo1, v_lo2]) LOOP
      IF v_target_lo = v_lo1 THEN
        v_chal_pool := v_chal_lo1;
      ELSE
        v_chal_pool := v_chal_lo2;
      END IF;

      -- Choose bucket
      CASE (v_sidx + CASE WHEN v_target_lo = v_lo2 THEN 3 ELSE 0 END) % 10
        WHEN 0,1,2 THEN v_bucket := 'mastered';    approvals := 4;
        WHEN 3,4,5,6 THEN v_bucket := 'developing'; approvals := 2;
        WHEN 7,8 THEN v_bucket := 'struggling';     approvals := 1;
        ELSE v_bucket := 'not_attempted';            approvals := -1;
      END CASE;

      IF v_bucket <> 'not_attempted' THEN
        -- Insert 4 graded submissions on 4 distinct challenges from the pool,
        -- with the first `approvals` approved and the rest rejected.
        FOR i IN 1..4 LOOP
          v_pick := v_chal_pool[ 1 + ((v_sidx * 7 + i * 3) % array_length(v_chal_pool,1)) ];
          INSERT INTO qm_submissions (challenge_id, team_id, user_id, answer, status, reviewed_by, created_at)
          VALUES (
            v_pick, NULL, v_student.user_id,
            'SEED::' || gen_random_uuid()::text,
            CASE WHEN i <= approvals THEN 'approved' ELSE 'rejected' END,
            v_owner,
            now() - (i || ' hours')::interval
          );
        END LOOP;
      END IF;
    END LOOP;
    v_sidx := v_sidx + 1;
  END LOOP;

  RAISE NOTICE 'Seeded submissions for % students', v_sidx;
END $$;

COMMIT;
