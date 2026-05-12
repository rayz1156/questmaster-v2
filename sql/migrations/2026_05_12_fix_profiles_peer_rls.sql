-- ============================================================================
-- 2026-05-12  qm_profiles peer-SELECT RLS fix
-- ----------------------------------------------------------------------------
-- The pre-existing policy qm_profiles_class_peer_select used a subquery on
-- qm_class_members. Because RLS on qm_class_members itself restricts
-- non-educators to their own row (p_cm_self), the subquery returned only the
-- caller's row, so students could SELECT only their own qm_profiles row
-- (=> intro board showed blank cards for every classmate).
--
-- Fix: wrap the membership check in a SECURITY DEFINER helper so the inner
-- SELECT bypasses qm_class_members RLS, and rewrite the policy to call it.
-- Educator/admin policies on qm_profiles are unchanged.
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
    FROM public.qm_class_members a
    JOIN public.qm_class_members b ON b.class_id = a.class_id
    WHERE a.user_id = p_a
      AND b.user_id = p_b
  );
$$;
GRANT EXECUTE ON FUNCTION public.qm_users_share_class(uuid, uuid) TO authenticated, anon;

DROP POLICY IF EXISTS qm_profiles_class_peer_select ON public.qm_profiles;
CREATE POLICY qm_profiles_class_peer_select
  ON public.qm_profiles
  FOR SELECT
  TO authenticated
  USING ( public.qm_users_share_class(auth.uid(), qm_profiles.id) );

COMMIT;
