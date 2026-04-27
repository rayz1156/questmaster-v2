-- Add team join code (8-char), unique
alter table public.qm_teams add column if not exists join_code text;
update public.qm_teams set join_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) where join_code is null;
alter table public.qm_teams alter column join_code set not null;
alter table public.qm_teams alter column join_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qm_teams_join_code_key') then
    alter table public.qm_teams add constraint qm_teams_join_code_key unique (join_code);
  end if;
end $$;

-- Allow authenticated users to SELECT a team by its join_code so they can look it up before joining.
-- (Existing select policy only allowed members; we relax SELECT for code-based discovery.)
drop policy if exists qm_teams_code_lookup on public.qm_teams;
create policy qm_teams_code_lookup on public.qm_teams for select to authenticated using (true);

-- Allow a class member of the team's hunt's class to insert themselves into qm_team_members
drop policy if exists qm_team_members_self_join on public.qm_team_members;
create policy qm_team_members_self_join on public.qm_team_members for insert to authenticated
  with check (
    user_id = auth.uid() and exists (
      select 1
      from public.qm_teams t
      join public.qm_hunts h on h.id = t.hunt_id
      join public.qm_class_members cm on cm.class_id = h.class_id
      where t.id = team_id and cm.user_id = auth.uid()
    )
  );

-- Allow a participant to remove themselves from a team
drop policy if exists qm_team_members_self_leave on public.qm_team_members;
create policy qm_team_members_self_leave on public.qm_team_members for delete to authenticated
  using (user_id = auth.uid());

-- Allow members to read team_members for their teams (likely already covered, idempotent)
drop policy if exists qm_team_members_self_select on public.qm_team_members;
create policy qm_team_members_self_select on public.qm_team_members for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.qm_team_members tm where tm.team_id = team_id and tm.user_id = auth.uid()));

grant select, insert, delete on public.qm_team_members to authenticated;
