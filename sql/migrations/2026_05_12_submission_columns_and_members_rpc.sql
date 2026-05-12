-- ============================================================
-- Migration: submission board columns + mood-board positioning
--            + qm_list_class_members RPC (fix intro board
--            visibility for students)
-- File:      db/migrations/20260512b_submission_columns_and_members_rpc.sql
-- Date:      2026-05-12
-- ============================================================
BEGIN;

-- ------------------------------------------------------------
-- 1) qm_submission_board_columns  (mirrors qm_learning_columns)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qm_submission_board_columns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    uuid NOT NULL REFERENCES public.qm_submission_boards(id) ON DELETE CASCADE,
  title       text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES public.qm_profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qm_sbc_board ON public.qm_submission_board_columns(board_id, position);

DROP TRIGGER IF EXISTS qm_sbc_set_updated ON public.qm_submission_board_columns;
CREATE TRIGGER qm_sbc_set_updated
  BEFORE UPDATE ON public.qm_submission_board_columns
  FOR EACH ROW EXECUTE FUNCTION public.qm_set_updated_at();

-- ------------------------------------------------------------
-- 2) Extend qm_submission_board_items with column + position +
--    mood-board fields (x, y, w, h, z)
-- ------------------------------------------------------------
ALTER TABLE public.qm_submission_board_items
  ADD COLUMN IF NOT EXISTS column_id  uuid REFERENCES public.qm_submission_board_columns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mood_x     integer,
  ADD COLUMN IF NOT EXISTS mood_y     integer,
  ADD COLUMN IF NOT EXISTS mood_w     integer,
  ADD COLUMN IF NOT EXISTS mood_h     integer,
  ADD COLUMN IF NOT EXISTS mood_z     integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_qm_sbi_column ON public.qm_submission_board_items(column_id, position);

-- ------------------------------------------------------------
-- 3) Extend qm_submission_boards with view_mode
-- ------------------------------------------------------------
ALTER TABLE public.qm_submission_boards
  ADD COLUMN IF NOT EXISTS view_mode text NOT NULL DEFAULT 'columns'
    CHECK (view_mode IN ('columns','mood'));

-- ------------------------------------------------------------
-- 4) Backfill: for every existing board without a column, create
--    a default "Submissions" column and assign every orphan item
--    to it (per user instruction: existing items go into a default).
-- ------------------------------------------------------------
DO $$
DECLARE b record; new_col_id uuid;
BEGIN
  FOR b IN SELECT id FROM public.qm_submission_boards LOOP
    IF NOT EXISTS (SELECT 1 FROM public.qm_submission_board_columns WHERE board_id = b.id) THEN
      INSERT INTO public.qm_submission_board_columns (board_id, title, position)
        VALUES (b.id, 'Submissions', 0)
        RETURNING id INTO new_col_id;
      UPDATE public.qm_submission_board_items
        SET column_id = new_col_id
        WHERE board_id = b.id AND column_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5) RLS on qm_submission_board_columns
--    - admin: full control
--    - educator of class: full control
--    - class members (incl. students): SELECT + INSERT + UPDATE (rename/reorder)
--    - DELETE: only educator OR (column is empty AND caller is class member who created it)
--      Simpler & per user agreement: anyone can create/rename/reorder;
--      delete only allowed if (a) caller is class educator OR (b) column is empty.
-- ------------------------------------------------------------
ALTER TABLE public.qm_submission_board_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sbc_admin_all   ON public.qm_submission_board_columns;
DROP POLICY IF EXISTS sbc_edu_all     ON public.qm_submission_board_columns;
DROP POLICY IF EXISTS sbc_mem_select  ON public.qm_submission_board_columns;
DROP POLICY IF EXISTS sbc_mem_insert  ON public.qm_submission_board_columns;
DROP POLICY IF EXISTS sbc_mem_update  ON public.qm_submission_board_columns;
DROP POLICY IF EXISTS sbc_mem_delete_empty ON public.qm_submission_board_columns;

-- admin
CREATE POLICY sbc_admin_all ON public.qm_submission_board_columns
  FOR ALL USING (qm_is_admin()) WITH CHECK (qm_is_admin());

-- educator of the class
CREATE POLICY sbc_edu_all ON public.qm_submission_board_columns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.qm_submission_boards b
            WHERE b.id = qm_submission_board_columns.board_id
              AND qm_is_class_educator(b.class_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.qm_submission_boards b
            WHERE b.id = qm_submission_board_columns.board_id
              AND qm_is_class_educator(b.class_id))
  );

-- class members: read
CREATE POLICY sbc_mem_select ON public.qm_submission_board_columns
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.qm_submission_boards b
            WHERE b.id = qm_submission_board_columns.board_id
              AND qm_is_class_member(b.class_id))
  );

-- class members: insert (any member can create columns)
CREATE POLICY sbc_mem_insert ON public.qm_submission_board_columns
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.qm_submission_boards b
            WHERE b.id = qm_submission_board_columns.board_id
              AND qm_is_class_member(b.class_id))
  );

-- class members: update (rename + reorder)
CREATE POLICY sbc_mem_update ON public.qm_submission_board_columns
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.qm_submission_boards b
            WHERE b.id = qm_submission_board_columns.board_id
              AND qm_is_class_member(b.class_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.qm_submission_boards b
            WHERE b.id = qm_submission_board_columns.board_id
              AND qm_is_class_member(b.class_id))
  );

-- class members: delete ONLY when column is empty (educator path already covered by sbc_edu_all)
CREATE POLICY sbc_mem_delete_empty ON public.qm_submission_board_columns
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.qm_submission_boards b
            WHERE b.id = qm_submission_board_columns.board_id
              AND qm_is_class_member(b.class_id))
    AND NOT EXISTS (SELECT 1 FROM public.qm_submission_board_items i
                    WHERE i.column_id = qm_submission_board_columns.id)
  );

-- ------------------------------------------------------------
-- 6) qm_list_class_members RPC (SECURITY DEFINER)
--    Fix: students currently can't read other members of their
--         class from qm_class_members because of RLS. The intro
--         board (and any future class roster view) needs to see
--         every member. We expose only user_id (no PII) -- the
--         caller then joins to qm_profiles (which is readable).
--    Caller is only allowed to enumerate if they are themselves
--    a class member (or class educator, or admin).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.qm_list_class_members(uuid);
CREATE OR REPLACE FUNCTION public.qm_list_class_members(p_class uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.qm_is_admin()
    OR public.qm_is_class_educator(p_class)
    OR public.qm_is_class_member(p_class)
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT cm.user_id
    FROM public.qm_class_members cm
    WHERE cm.class_id = p_class;
END;
$$;

GRANT EXECUTE ON FUNCTION public.qm_list_class_members(uuid) TO authenticated, anon;

COMMIT;

-- ============================================================
-- POST-MIGRATION VERIFICATION QUERIES (run separately to confirm)
-- ============================================================
-- \dt public.qm_submission_board_columns
-- \d  public.qm_submission_board_items
-- \d  public.qm_submission_boards
-- SELECT COUNT(*) FROM public.qm_submission_board_columns;
-- SELECT COUNT(*) FROM public.qm_submission_board_items WHERE column_id IS NULL;  -- should be 0
-- SELECT * FROM public.qm_list_class_members('<some-class-uuid>');
