-- ============================================================================
-- 2026-05-12  Make educators visible to students (intro & learning boards)
-- ----------------------------------------------------------------------------
-- Two follow-on fixes after 2026_05_12_fix_profiles_peer_rls.sql:
--
-- 1. qm_users_share_class previously checked only member<->member, but
--    educators are stored in qm_class_educators, not qm_class_members.
--    Students therefore could not SELECT the educator's qm_profiles row
--    via the peer policy. Extended to also accept educator<->member and
--    educator<->educator pairs (accepted_at must be non-null).
--
-- 2. qm_list_class_educators previously returned 0 rows for non-educator
--    callers (gated by qm_is_class_educator OR is_admin). Students need
--    to read the educator roster too -- relaxed to include qm_is_class_member.
--    NOTE: function is owned by supabase_admin in self-hosted Supabase, so
--    apply this script as that user (psql -U supabase_admin).
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.qm_users_share_class(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.qm_class_members ma
    JOIN public.qm_class_members mb ON mb.class_id = ma.class_id
    WHERE ma.user_id = p_a AND mb.user_id = p_b
  ) OR EXISTS (
    SELECT 1
    FROM public.qm_class_educators ea
    JOIN public.qm_class_members mb ON mb.class_id = ea.class_id
    WHERE ea.educator_id = p_a AND ea.accepted_at IS NOT NULL
      AND mb.user_id = p_b
  ) OR EXISTS (
    SELECT 1
    FROM public.qm_class_members ma
    JOIN public.qm_class_educators eb ON eb.class_id = ma.class_id
    WHERE ma.user_id = p_a
      AND eb.educator_id = p_b AND eb.accepted_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.qm_class_educators ea
    JOIN public.qm_class_educators eb ON eb.class_id = ea.class_id
    WHERE ea.educator_id = p_a AND ea.accepted_at IS NOT NULL
      AND eb.educator_id = p_b AND eb.accepted_at IS NOT NULL
  );
$$;
GRANT EXECUTE ON FUNCTION public.qm_users_share_class(uuid, uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.qm_list_class_educators(p_class uuid)
RETURNS TABLE(
  educator_id uuid,
  role text,
  invited_by uuid,
  invited_at timestamp with time zone,
  accepted_at timestamp with time zone,
  email text,
  display_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT ce.educator_id, ce.role, ce.invited_by, ce.invited_at, ce.accepted_at,
         u.email::text, p.display_name
  FROM public.qm_class_educators ce
  LEFT JOIN public.qm_profiles p ON p.id = ce.educator_id
  LEFT JOIN auth.users u ON u.id = ce.educator_id
  WHERE ce.class_id = p_class
    AND ce.accepted_at IS NOT NULL
    AND (
      public.qm_is_admin()
      OR public.qm_is_class_educator(p_class)
      OR public.qm_is_class_member(p_class)
    );
$$;
GRANT EXECUTE ON FUNCTION public.qm_list_class_educators(uuid) TO authenticated, anon;

COMMIT;
