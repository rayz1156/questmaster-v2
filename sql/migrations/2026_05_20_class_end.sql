-- Migration: Add "End class" lifecycle
-- Date: 2026-05-20
-- Author: agent (under Dr Hariz direction)
--
-- Concept:
--   * Classes gain a nullable ended_at TIMESTAMPTZ column.
--   * ended_at IS NULL  => Active class (default).
--   * ended_at IS NOT NULL => Ended class:
--       - educators can still edit (so they can fix typos, reopen).
--       - students keep READ access (Learning Board, Activities, Rankings).
--       - join code stops accepting new members.
--       - students cannot create new submissions (enforced by trigger).
--   * Reopening = set ended_at back to NULL.
--
-- All changes are non-destructive and reversible.

BEGIN;

-- 1. Add column + index
ALTER TABLE public.qm_classes
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS qm_classes_ended_at_idx
    ON public.qm_classes(ended_at);

COMMENT ON COLUMN public.qm_classes.ended_at IS
    'When the class was ended by the educator. NULL = active. Students retain read access when ended.';

-- 2. Update join-by-code RPC: refuse ended classes with a clear message
CREATE OR REPLACE FUNCTION public.qm_join_class_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_class uuid;
  v_ended timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select id, ended_at
    into v_class, v_ended
    from public.qm_classes
   where join_code = upper(p_code)
     and is_archived = false;

  if v_class is null then
    raise exception 'Invalid class code';
  end if;

  if v_ended is not null then
    raise exception 'This class has ended and is no longer accepting new members';
  end if;

  insert into public.qm_class_members(class_id, user_id)
    values (v_class, auth.uid())
    on conflict do nothing;

  return v_class;
end
$function$;

-- 3. Helper function: is a given class ended?
CREATE OR REPLACE FUNCTION public.qm_is_class_ended(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.qm_classes
     WHERE id = p_class_id AND ended_at IS NOT NULL
  );
$function$;

-- 4. Trigger: block new submissions on ended classes (students only).
--    Educators bypass (they may need to grade/adjust scores after end).
CREATE OR REPLACE FUNCTION public.qm_block_submissions_when_ended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_class_id uuid;
  v_ended boolean;
  v_is_edu boolean;
begin
  -- find the class via challenge -> hunt -> class
  select c.class_id
    into v_class_id
    from public.qm_challenges ch
    join public.qm_hunts h on h.id = ch.hunt_id
    join public.qm_classes c on c.id = h.class_id
   where ch.id = NEW.challenge_id;

  if v_class_id is null then
    -- hunt not tied to a class (legacy/standalone) -> allow
    return NEW;
  end if;

  select (ended_at is not null) into v_ended
    from public.qm_classes where id = v_class_id;

  if not v_ended then
    return NEW;
  end if;

  -- class ended: allow only educators of that class
  select public.qm_is_class_educator(v_class_id) into v_is_edu;
  if v_is_edu then
    return NEW;
  end if;

  raise exception 'This class has ended. Submissions are closed.'
        using errcode = 'P0001';
end
$function$;

DROP TRIGGER IF EXISTS trg_qm_block_submissions_when_ended ON public.qm_submissions;
CREATE TRIGGER trg_qm_block_submissions_when_ended
    BEFORE INSERT ON public.qm_submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.qm_block_submissions_when_ended();

COMMIT;

-- ============================================================
-- POST-NOTE: function qm_list_my_educator_classes() is OWNED by
-- supabase_admin, not postgres. The migration above was applied
-- in two psql sessions: most as postgres, this DROP+CREATE as
-- supabase_admin via:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f ...
-- Below is what was applied as supabase_admin:
-- ============================================================

-- BEGIN;
-- DROP FUNCTION IF EXISTS public.qm_list_my_educator_classes();
-- CREATE FUNCTION public.qm_list_my_educator_classes()
-- RETURNS TABLE(id uuid, name text, description text, color text, join_code text,
--               is_archived boolean, ended_at timestamptz, created_at timestamptz, role text)
-- LANGUAGE sql STABLE SECURITY DEFINER
-- SET search_path TO 'public', 'pg_temp'
-- AS $f$
--   select c.id, c.name, c.description, c.color, c.join_code,
--          c.is_archived, c.ended_at, c.created_at, ce.role
--     from public.qm_class_educators ce
--     join public.qm_classes c on c.id = ce.class_id
--    where ce.educator_id = auth.uid()
--      and ce.accepted_at is not null
--    order by (c.ended_at is not null),
--             case ce.role when 'owner' then 0 else 1 end,
--             c.created_at desc;
-- $f$;
-- GRANT EXECUTE ON FUNCTION public.qm_list_my_educator_classes() TO authenticated, anon, service_role;
-- COMMIT;
