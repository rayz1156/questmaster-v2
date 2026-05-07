-- 0015: Allow educators/co-educators to submit on behalf of any class team,
-- and allow students to delete their own team's submission.
-- Builds on helpers from 0014: qm_can_manage_board, qm_my_team_for_board.

-- INSERT: self-submission for own team OR manager (educator/co-educator/admin) for any team in the class
DROP POLICY IF EXISTS p_subs_insert ON public.qm_group_submissions;
CREATE POLICY p_subs_insert ON public.qm_group_submissions
  FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND (
      -- Student: must be inserting for their own team
      team_id = qm_my_team_for_board(board_id)
      OR
      -- Educator/co-educator/admin: may submit for any team belonging to the same class as the board's hunt
      (
        qm_can_manage_board(board_id)
        AND EXISTS (
          SELECT 1
          FROM qm_boards b
          JOIN qm_hunts h ON h.id = b.hunt_id
          JOIN qm_teams t ON t.id = qm_group_submissions.team_id
          WHERE b.id = qm_group_submissions.board_id
            AND (t.hunt_id = h.id OR (h.class_id IS NOT NULL AND t.class_id = h.class_id))
        )
      )
    )
  );

-- DELETE: admin/educator/co-educator (already there) OR the team's own member
DROP POLICY IF EXISTS p_subs_delete ON public.qm_group_submissions;
CREATE POLICY p_subs_delete ON public.qm_group_submissions
  FOR DELETE
  USING (
    is_admin()
    OR qm_can_manage_board(board_id)
    OR team_id = qm_my_team_for_board(board_id)
  );
