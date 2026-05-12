BEGIN;

-- ============================================================
-- qm_submission_boards : one per (activity x class)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qm_submission_boards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id      uuid NOT NULL REFERENCES public.qm_hunts(id) ON DELETE CASCADE,
  class_id         uuid NOT NULL REFERENCES public.qm_classes(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  visibility       text NOT NULL DEFAULT 'class_scoped'
                   CHECK (visibility IN ('public','private','class_scoped')),
  is_open          boolean NOT NULL DEFAULT true,
  adilo_project_id text,
  created_by       uuid NOT NULL REFERENCES public.qm_profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, class_id)
);
CREATE INDEX IF NOT EXISTS submission_boards_class_idx    ON public.qm_submission_boards(class_id);
CREATE INDEX IF NOT EXISTS submission_boards_activity_idx ON public.qm_submission_boards(activity_id);

-- ============================================================
-- qm_submission_board_items : student submissions on a board
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qm_submission_board_items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id                uuid NOT NULL REFERENCES public.qm_submission_boards(id) ON DELETE CASCADE,
  submitted_by            uuid NOT NULL REFERENCES public.qm_profiles(id) ON DELETE CASCADE,
  item_type               text NOT NULL CHECK (item_type IN ('text','image','video','link','file')),
  title                   text,
  description             text,
  -- video (Adilo)
  adilo_file_id           text,
  adilo_project_id        text,
  video_thumbnail_url     text,
  video_duration_seconds  integer,
  -- link
  link_url                text,
  link_title              text,
  link_description        text,
  link_image_url          text,
  link_site_name          text,
  link_favicon_url        text,
  -- image
  image_url               text,
  image_path              text,
  -- file (FileLu)
  file_url                text,
  file_path               text,
  file_name               text,
  file_mime_type          text,
  file_size_bytes         bigint,
  file_extension          text,
  filelu_file_code        text,
  -- audit
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submission_board_items_board_idx ON public.qm_submission_board_items(board_id);
CREATE INDEX IF NOT EXISTS submission_board_items_user_idx  ON public.qm_submission_board_items(submitted_by);

-- updated_at triggers (reuse existing qm_set_updated_at fn)
DROP TRIGGER IF EXISTS qm_submission_boards_set_updated      ON public.qm_submission_boards;
DROP TRIGGER IF EXISTS qm_submission_board_items_set_updated ON public.qm_submission_board_items;
CREATE TRIGGER qm_submission_boards_set_updated
  BEFORE UPDATE ON public.qm_submission_boards
  FOR EACH ROW EXECUTE FUNCTION public.qm_set_updated_at();
CREATE TRIGGER qm_submission_board_items_set_updated
  BEFORE UPDATE ON public.qm_submission_board_items
  FOR EACH ROW EXECUTE FUNCTION public.qm_set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.qm_submission_boards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qm_submission_board_items ENABLE ROW LEVEL SECURITY;

-- BOARDS policies --------------------------------------------
DROP POLICY IF EXISTS sb_admin_all  ON public.qm_submission_boards;
DROP POLICY IF EXISTS sb_edu_all    ON public.qm_submission_boards;
DROP POLICY IF EXISTS sb_mem_read   ON public.qm_submission_boards;

CREATE POLICY sb_admin_all ON public.qm_submission_boards
  FOR ALL USING (qm_is_admin()) WITH CHECK (qm_is_admin());
CREATE POLICY sb_edu_all ON public.qm_submission_boards
  FOR ALL USING (qm_is_class_educator(class_id))
  WITH CHECK (qm_is_class_educator(class_id));
CREATE POLICY sb_mem_read ON public.qm_submission_boards
  FOR SELECT USING (qm_is_class_member(class_id));

-- ITEMS policies ---------------------------------------------
DROP POLICY IF EXISTS sbi_admin_all    ON public.qm_submission_board_items;
DROP POLICY IF EXISTS sbi_edu_all      ON public.qm_submission_board_items;
DROP POLICY IF EXISTS sbi_owner_rw     ON public.qm_submission_board_items;
DROP POLICY IF EXISTS sbi_class_read   ON public.qm_submission_board_items;

-- admins: full control
CREATE POLICY sbi_admin_all ON public.qm_submission_board_items
  FOR ALL USING (qm_is_admin()) WITH CHECK (qm_is_admin());

-- educators of the class containing this item's board: full control
CREATE POLICY sbi_edu_all ON public.qm_submission_board_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.qm_submission_boards b
            WHERE b.id = qm_submission_board_items.board_id
            AND qm_is_class_educator(b.class_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.qm_submission_boards b
            WHERE b.id = qm_submission_board_items.board_id
            AND qm_is_class_educator(b.class_id))
  );

-- owners (students) : INSERT/UPDATE/DELETE their own; SELECT their own always
CREATE POLICY sbi_owner_rw ON public.qm_submission_board_items
  FOR ALL USING (submitted_by = auth.uid())
  WITH CHECK (submitted_by = auth.uid());

-- class members read others' items only when visibility allows.
-- public/class_scoped: any class member can read all items on that board.
-- private: only own items (already covered by sbi_owner_rw).
CREATE POLICY sbi_class_read ON public.qm_submission_board_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.qm_submission_boards b
            WHERE b.id = qm_submission_board_items.board_id
            AND qm_is_class_member(b.class_id)
            AND b.visibility IN ('public','class_scoped'))
  );

COMMIT;
