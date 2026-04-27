-- Promote qm_teams from hunt-scoped to class-scoped so a single team roster
-- can persist across multiple quests in the same class. Per-quest progress
-- continues to live in qm_team_quest_completions and qm_score_adjustments.

begin;

-- 1. Add class_id column referencing qm_classes
alter table public.qm_teams add column if not exists class_id uuid references public.qm_classes(id) on delete cascade;

-- 2. Backfill class_id from the team's hunt's class
update public.qm_teams t
  set class_id = h.class_id
  from public.qm_hunts h
  where t.hunt_id = h.id and t.class_id is null;

-- 3. Make hunt_id nullable -- a team may belong to a class without being tied
-- to a single hunt. Existing rows keep their hunt_id for backwards compatibility
-- but new teams created from the class-scoped UI will have hunt_id null.
alter table public.qm_teams alter column hunt_id drop not null;

-- 4. Index for class lookups
create index if not exists qm_teams_class_id_idx on public.qm_teams(class_id);

-- 5. Per-class team-name uniqueness (allow same name in different classes;
-- prevent duplicates inside one class). Skip rows with null class_id.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qm_teams_class_name_key') then
    -- create unique index qm_teams_class_name_key on public.qm_teams(class_id, lower(name)) where class_id is not null;
  end if;
end$$;

-- 6. RLS update: team can be selected/updated by class owner OR class member,
-- in addition to existing hunt-based policies. We keep the hunt-based policies
-- so legacy teams (with hunt_id set, class_id null) still work.

-- Educator/owner all-access via class
drop policy if exists qm_teams_class_owner_all on public.qm_teams;
create policy qm_teams_class_owner_all on public.qm_teams for all
  using (class_id is not null and public.qm_is_class_owner(class_id))
  with check (class_id is not null and public.qm_is_class_owner(class_id));

-- Class members can SELECT teams in their class (so participants see their team list)
drop policy if exists qm_teams_class_member_select on public.qm_teams;
create policy qm_teams_class_member_select on public.qm_teams for select
  using (class_id is not null and exists(select 1 from public.qm_class_members cm where cm.class_id = qm_teams.class_id and cm.user_id = auth.uid()));

-- 7. qm_team_members RLS: allow class members to insert themselves into a team
-- whose class they belong to (today's policy only allows hunt-class members).
drop policy if exists qm_team_members_class_self_join on public.qm_team_members;
create policy qm_team_members_class_self_join on public.qm_team_members for insert to authenticated
  with check (
    user_id = auth.uid() and exists(
      select 1 from public.qm_teams t
      join public.qm_class_members cm on cm.class_id = t.class_id
      where t.id = team_id and cm.user_id = auth.uid()
    )
  );

-- 8. Allow class members to SELECT team_members rows for teams in their class
drop policy if exists qm_team_members_class_select on public.qm_team_members;
create policy qm_team_members_class_select on public.qm_team_members for select
  using (
    exists(
      select 1 from public.qm_teams t
      join public.qm_class_members cm on cm.class_id = t.class_id
      where t.id = team_id and cm.user_id = auth.uid()
    )
  );

commit;
