-- 0022_fix_qm_teams_rls_recursion.sql
-- Fix: "infinite recursion detected in policy for relation qm_teams"
-- triggered when a participant updates qm_teams (e.g. renaming their team).
--
-- Recursion path (from pg_policies inspection 2026-05-13):
--   qm_teams_member_update (UPDATE on qm_teams)
--     -> EXISTS (SELECT 1 FROM qm_team_members WHERE team_id = qm_teams.id ...)
--   qm_team_members_class_select (SELECT on qm_team_members)
--     -> EXISTS (SELECT 1 FROM qm_teams t JOIN qm_class_members cm ...)
--   That JOIN re-evaluates qm_teams SELECT policies, which read qm_class_members,
--   whose own policies (p_cm_owner, p_cm_educator) call qm_is_class_owner /
--   qm_is_class_educator -> cycle.
--
-- Fix: route every membership / team-class lookup through SECURITY DEFINER
-- helper functions that bypass RLS. Same pattern as 0004_fix_classes_rls_recursion.sql.
--
-- This migration is idempotent: it only adds new functions and replaces two
-- existing policies with equivalent semantics (same SELECT / UPDATE scope,
-- just expressed via helpers). Educator / owner / admin policies are
-- untouched.

begin;

-- 1. Helper: is the current user a member of this team?
create or replace function public.qm_is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.qm_team_members
    where team_id = p_team_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.qm_is_team_member(uuid) from public;
grant execute on function public.qm_is_team_member(uuid) to authenticated;

-- 2. Helper: resolve a team's class_id WITHOUT touching qm_teams RLS.
create or replace function public.qm_team_class_id(p_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select class_id from public.qm_teams where id = p_team_id;
$$;

revoke all on function public.qm_team_class_id(uuid) from public;
grant execute on function public.qm_team_class_id(uuid) to authenticated;

-- 3. Rebuild qm_teams policies that recurse.

drop policy if exists qm_teams_class_member_select on public.qm_teams;
create policy qm_teams_class_member_select on public.qm_teams
  for select
  using (
    class_id is not null
    and public.qm_is_class_member(class_id)
  );

drop policy if exists qm_teams_member_update on public.qm_teams;
create policy qm_teams_member_update on public.qm_teams
  for update
  using ( public.qm_is_team_member(id) )
  with check ( public.qm_is_team_member(id) );

-- 4. Rebuild qm_team_members SELECT policy that recurses through qm_teams.
--    Original was: EXISTS (SELECT 1 FROM qm_teams t JOIN qm_class_members cm
--                          ON cm.class_id = t.class_id
--                          WHERE t.id = qm_team_members.team_id
--                            AND cm.user_id = auth.uid())
--    Rewritten via helpers (no direct qm_teams reference):
drop policy if exists qm_team_members_class_select on public.qm_team_members;
create policy qm_team_members_class_select on public.qm_team_members
  for select
  using (
    public.qm_is_class_member( public.qm_team_class_id(team_id) )
  );

commit;
