-- Helper function with SECURITY DEFINER to bypass RLS recursion
CREATE OR REPLACE FUNCTION public.qm_current_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.qm_profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.qm_current_role() TO anon, authenticated, service_role;

-- Drop existing policies on qm_profiles and recreate without recursion
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='qm_profiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.qm_profiles', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.qm_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY qm_profiles_self_select ON public.qm_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY qm_profiles_admin_select ON public.qm_profiles
  FOR SELECT USING (public.qm_current_role() = 'admin');

CREATE POLICY qm_profiles_self_update ON public.qm_profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY qm_profiles_admin_update ON public.qm_profiles
  FOR UPDATE USING (public.qm_current_role() = 'admin');

CREATE POLICY qm_profiles_admin_insert ON public.qm_profiles
  FOR INSERT WITH CHECK (public.qm_current_role() = 'admin');

CREATE POLICY qm_profiles_self_insert ON public.qm_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Fix recursion on other qm_* tables by replacing admin checks with qm_current_role()
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOR t IN SELECT unnest(ARRAY['qm_hunts','qm_challenges','qm_teams','qm_team_members','qm_memberships','qm_submissions','qm_audit_log']) LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.qm_current_role() = ''admin'') WITH CHECK (public.qm_current_role() = ''admin'')', t||'_admin_all', t);
  END LOOP;
END $$;

-- Educator/participant policies per table
CREATE POLICY qm_hunts_owner_all ON public.qm_hunts FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY qm_hunts_member_select ON public.qm_hunts FOR SELECT USING (EXISTS (SELECT 1 FROM public.qm_memberships m WHERE m.hunt_id = qm_hunts.id AND m.user_id = auth.uid()));

CREATE POLICY qm_challenges_owner_all ON public.qm_challenges FOR ALL USING (EXISTS (SELECT 1 FROM public.qm_hunts h WHERE h.id = qm_challenges.hunt_id AND h.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.qm_hunts h WHERE h.id = qm_challenges.hunt_id AND h.owner_id = auth.uid()));
CREATE POLICY qm_challenges_member_select ON public.qm_challenges FOR SELECT USING (EXISTS (SELECT 1 FROM public.qm_memberships m WHERE m.hunt_id = qm_challenges.hunt_id AND m.user_id = auth.uid()));

CREATE POLICY qm_teams_owner_all ON public.qm_teams FOR ALL USING (EXISTS (SELECT 1 FROM public.qm_hunts h WHERE h.id = qm_teams.hunt_id AND h.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.qm_hunts h WHERE h.id = qm_teams.hunt_id AND h.owner_id = auth.uid()));
CREATE POLICY qm_teams_member_select ON public.qm_teams FOR SELECT USING (EXISTS (SELECT 1 FROM public.qm_memberships m WHERE m.hunt_id = qm_teams.hunt_id AND m.user_id = auth.uid()));

CREATE POLICY qm_team_members_self ON public.qm_team_members FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY qm_team_members_owner_select ON public.qm_team_members FOR SELECT USING (EXISTS (SELECT 1 FROM public.qm_teams t JOIN public.qm_hunts h ON h.id=t.hunt_id WHERE t.id = qm_team_members.team_id AND h.owner_id = auth.uid()));

CREATE POLICY qm_memberships_self ON public.qm_memberships FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY qm_memberships_owner_select ON public.qm_memberships FOR SELECT USING (EXISTS (SELECT 1 FROM public.qm_hunts h WHERE h.id = qm_memberships.hunt_id AND h.owner_id = auth.uid()));

CREATE POLICY qm_submissions_self ON public.qm_submissions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY qm_submissions_owner_all ON public.qm_submissions FOR ALL USING (EXISTS (SELECT 1 FROM public.qm_hunts h WHERE h.id = qm_submissions.hunt_id AND h.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.qm_hunts h WHERE h.id = qm_submissions.hunt_id AND h.owner_id = auth.uid()));
