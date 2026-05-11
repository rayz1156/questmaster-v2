-- =============================================================
-- Teardown for 2026_05_12_tier4_demo.sql
-- Removes all seeded challenges (cascades to challenge_outcomes
-- and submissions) and LO2 for Group A. LO1 is preserved.
-- =============================================================
BEGIN;

DELETE FROM qm_challenges
WHERE title LIKE '[SEED]%'
  AND hunt_id IN (
    SELECT id FROM qm_hunts
    WHERE class_id = '4d99ba62-244c-44dd-b164-c2e795040efa'
  );

DELETE FROM qm_learning_outcomes
WHERE class_id = '4d99ba62-244c-44dd-b164-c2e795040efa'
  AND code = 'LO2';

COMMIT;
