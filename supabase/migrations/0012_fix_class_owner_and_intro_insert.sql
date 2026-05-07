-- Fix: legacy classes use qm_classes.owner_id directly without qm_class_educators row.
-- Update qm_is_class_owner to also recognize qm_classes.owner_id.
CREATE OR REPLACE FUNCTION public.qm_is_class_owner(p_class uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select exists(
    select 1 from public.qm_class_educators ce
    where ce.class_id = p_class
      and ce.educator_id = auth.uid()
      and ce.role = 'owner'
      and ce.accepted_at is not null
  ) or exists(
    select 1 from public.qm_classes c
    where c.id = p_class
      and c.owner_id = auth.uid()
  );
$$;

-- Backfill missing owner rows in qm_class_educators
insert into public.qm_class_educators (class_id, educator_id, role, invited_by, invited_at, accepted_at)
select c.id, c.owner_id, 'owner', c.owner_id, now(), now()
from public.qm_classes c
where c.owner_id is not null
  and not exists (
    select 1 from public.qm_class_educators ce
    where ce.class_id = c.id and ce.educator_id = c.owner_id
  );

-- Allow educators / board managers to also create their own intro post
DROP POLICY IF EXISTS p_intro_insert ON public.qm_intro_posts;
CREATE POLICY p_intro_insert ON public.qm_intro_posts
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      qm_is_class_member_for_board(board_id)
      OR qm_can_manage_board(board_id)
      OR is_admin()
    )
  );
