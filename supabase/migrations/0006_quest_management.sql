-- Quest management fields & team completion tracking
alter table public.qm_hunts add column if not exists points integer not null default 10;
alter table public.qm_hunts add column if not exists instructions text;
alter table public.qm_hunts add column if not exists link1 text;
alter table public.qm_hunts add column if not exists link2 text;

-- Team-quest completion table (one row per team marked completed for a quest)
create table if not exists public.qm_team_quest_completions (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.qm_hunts(id) on delete cascade,
  team_id uuid not null references public.qm_teams(id) on delete cascade,
  awarded_points integer not null default 0,
  adjustment_id uuid references public.qm_score_adjustments(id) on delete set null,
  marked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (hunt_id, team_id)
);

alter table public.qm_team_quest_completions enable row level security;

drop policy if exists p_tqc_owner on public.qm_team_quest_completions;
create policy p_tqc_owner on public.qm_team_quest_completions for all
  using (public.qm_is_hunt_owner(hunt_id))
  with check (public.qm_is_hunt_owner(hunt_id));

drop policy if exists p_tqc_team_read on public.qm_team_quest_completions;
create policy p_tqc_team_read on public.qm_team_quest_completions for select
  using (exists (select 1 from public.qm_team_members tm where tm.team_id = team_id and tm.user_id = auth.uid()));

drop policy if exists p_tqc_admin on public.qm_team_quest_completions;
create policy p_tqc_admin on public.qm_team_quest_completions for all
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.qm_team_quest_completions to authenticated;
