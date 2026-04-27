-- 0005 teams + scheduling + manual scores

alter table public.qm_teams add column if not exists max_members integer not null default 5;

alter table public.qm_hunts add column if not exists start_at timestamptz;
alter table public.qm_hunts add column if not exists end_at timestamptz;
alter table public.qm_hunts add column if not exists timezone text default 'Asia/Kuala_Lumpur';

create table if not exists public.qm_score_adjustments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.qm_teams(id) on delete cascade,
  hunt_id uuid not null references public.qm_hunts(id) on delete cascade,
  delta integer not null,
  reason text,
  created_by uuid references public.qm_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.qm_score_adjustments enable row level security;
create index if not exists score_adj_team_idx on public.qm_score_adjustments(team_id);
create index if not exists score_adj_hunt_idx on public.qm_score_adjustments(hunt_id);

-- helper: am I the hunt owner? (security definer)
create or replace function public.qm_is_hunt_owner(p_hunt uuid)
returns boolean language sql security definer stable as $f$
  select exists(select 1 from public.qm_hunts where id = p_hunt and owner_id = auth.uid());
$f$;
grant execute on function public.qm_is_hunt_owner(uuid) to authenticated, anon;

drop policy if exists p_sa_owner on public.qm_score_adjustments;
create policy p_sa_owner on public.qm_score_adjustments for all
  using (public.qm_is_hunt_owner(hunt_id))
  with check (public.qm_is_hunt_owner(hunt_id));

drop policy if exists p_sa_team_read on public.qm_score_adjustments;
create policy p_sa_team_read on public.qm_score_adjustments for select
  using (exists(select 1 from public.qm_team_members tm where tm.team_id = team_id and tm.user_id = auth.uid()));

drop policy if exists p_sa_admin on public.qm_score_adjustments;
create policy p_sa_admin on public.qm_score_adjustments for all
  using (public.is_admin()) with check (public.is_admin());

-- View: team total score = sum(approved submission points) + sum(adjustments.delta)
create or replace view public.qm_team_scores as
  select t.id as team_id, t.hunt_id, t.name as team_name, t.score as base_score,
    coalesce((select sum(c.points) from public.qm_submissions s
              join public.qm_challenges c on c.id = s.challenge_id
              where s.team_id = t.id and s.status = 'approved'),0) as task_score,
    coalesce((select sum(delta) from public.qm_score_adjustments a where a.team_id = t.id),0) as adjustment_score,
    (t.score
      + coalesce((select sum(c.points) from public.qm_submissions s
                  join public.qm_challenges c on c.id = s.challenge_id
                  where s.team_id = t.id and s.status = 'approved'),0)
      + coalesce((select sum(delta) from public.qm_score_adjustments a where a.team_id = t.id),0)
    ) as total_score
  from public.qm_teams t;
grant select on public.qm_team_scores to authenticated, anon;
