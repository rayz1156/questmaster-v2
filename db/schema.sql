-- ===== public.qm_profiles =====
create table if not exists public.qm_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'participant' check (role in ('participant','educator','admin')),
  display_name text,
  suspended boolean not null default false,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.qm_profiles enable row level security;

-- auto-create profile on signup
create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.public.qm_profiles(id, role, display_name, approved)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'role','participant'),
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
          case when coalesce(new.raw_user_meta_data->>'role','participant')='educator' then false else true end)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- backfill public.qm_profiles for existing auth users
insert into public.qm_profiles(id, role, display_name, approved)
select u.id,
       coalesce(u.raw_user_meta_data->>'role','participant'),
       coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email,'@',1)),
       true
from auth.users u
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

-- helper: am I admin?
create or replace function public.is_admin() returns boolean language sql stable as $$
  select exists(select 1 from public.qm_profiles where id = auth.uid() and role = 'admin')
$$;
create or replace function public.my_role() returns text language sql stable as $$
  select role from public.qm_profiles where id = auth.uid()
$$;

drop policy if exists p_profiles_self_select on public.qm_profiles;
create policy p_profiles_self_select on public.qm_profiles for select using (auth.uid() = id or public.is_admin());
drop policy if exists p_profiles_self_update on public.qm_profiles;
create policy p_profiles_self_update on public.qm_profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists p_profiles_admin_all on public.qm_profiles;
create policy p_profiles_admin_all on public.qm_profiles for all using (public.is_admin()) with check (public.is_admin());

-- ===== public.qm_hunts =====
create table if not exists public.qm_hunts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.qm_profiles(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  invite_code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  created_at timestamptz not null default now()
);
alter table public.qm_hunts enable row level security;
create index if not exists hunts_owner_idx on public.qm_hunts(owner_id);

-- ===== public.qm_challenges =====
create table if not exists public.qm_challenges (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.qm_hunts(id) on delete cascade,
  title text not null,
  prompt text,
  answer text,
  points int not null default 10,
  order_idx int not null default 0
);
alter table public.qm_challenges enable row level security;
create index if not exists challenges_hunt_idx on public.qm_challenges(hunt_id);

-- ===== public.qm_teams =====
create table if not exists public.qm_teams (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.qm_hunts(id) on delete cascade,
  name text not null,
  score int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.qm_teams enable row level security;

-- ===== public.qm_team_members =====
create table if not exists public.qm_team_members (
  team_id uuid not null references public.qm_teams(id) on delete cascade,
  user_id uuid not null references public.qm_profiles(id) on delete cascade,
  primary key (team_id, user_id)
);
alter table public.qm_team_members enable row level security;

-- ===== public.qm_memberships =====
create table if not exists public.qm_memberships (
  hunt_id uuid not null references public.qm_hunts(id) on delete cascade,
  user_id uuid not null references public.qm_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (hunt_id, user_id)
);
alter table public.qm_memberships enable row level security;

-- ===== public.qm_submissions =====
create table if not exists public.qm_submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.qm_challenges(id) on delete cascade,
  team_id uuid references public.qm_teams(id) on delete set null,
  user_id uuid not null references public.qm_profiles(id) on delete cascade,
  answer text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.qm_profiles(id),
  created_at timestamptz not null default now()
);
alter table public.qm_submissions enable row level security;
create index if not exists submissions_chal_idx on public.qm_submissions(challenge_id);

-- ===== public.qm_audit_log =====
create table if not exists public.qm_audit_log (
  id bigserial primary key,
  actor_id uuid references public.qm_profiles(id),
  action text not null,
  target_type text,
  target_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);
alter table public.qm_audit_log enable row level security;

-- ===== POLICIES =====
-- public.qm_hunts
drop policy if exists p_hunts_owner on public.qm_hunts;
create policy p_hunts_owner on public.qm_hunts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists p_hunts_member_select on public.qm_hunts;
create policy p_hunts_member_select on public.qm_hunts for select using (
  exists(select 1 from public.qm_memberships m where m.hunt_id = public.qm_hunts.id and m.user_id = auth.uid())
);
drop policy if exists p_hunts_join_select on public.qm_hunts;
create policy p_hunts_join_select on public.qm_hunts for select using (status = 'active');
drop policy if exists p_hunts_admin on public.qm_hunts;
create policy p_hunts_admin on public.qm_hunts for all using (public.is_admin()) with check (public.is_admin());

-- public.qm_challenges
drop policy if exists p_chal_owner on public.qm_challenges;
create policy p_chal_owner on public.qm_challenges for all using (
  exists(select 1 from public.qm_hunts h where h.id = public.qm_challenges.hunt_id and h.owner_id = auth.uid())
) with check (
  exists(select 1 from public.qm_hunts h where h.id = public.qm_challenges.hunt_id and h.owner_id = auth.uid())
);
drop policy if exists p_chal_member_select on public.qm_challenges;
create policy p_chal_member_select on public.qm_challenges for select using (
  exists(select 1 from public.qm_memberships m where m.hunt_id = public.qm_challenges.hunt_id and m.user_id = auth.uid())
);
drop policy if exists p_chal_admin on public.qm_challenges;
create policy p_chal_admin on public.qm_challenges for all using (public.is_admin()) with check (public.is_admin());

-- public.qm_teams
drop policy if exists p_teams_owner on public.qm_teams;
create policy p_teams_owner on public.qm_teams for all using (
  exists(select 1 from public.qm_hunts h where h.id = public.qm_teams.hunt_id and h.owner_id = auth.uid())
) with check (
  exists(select 1 from public.qm_hunts h where h.id = public.qm_teams.hunt_id and h.owner_id = auth.uid())
);
drop policy if exists p_teams_member_select on public.qm_teams;
create policy p_teams_member_select on public.qm_teams for select using (
  exists(select 1 from public.qm_memberships m where m.hunt_id = public.qm_teams.hunt_id and m.user_id = auth.uid())
);
drop policy if exists p_teams_admin on public.qm_teams;
create policy p_teams_admin on public.qm_teams for all using (public.is_admin()) with check (public.is_admin());

-- public.qm_team_members
drop policy if exists p_tm_self on public.qm_team_members;
create policy p_tm_self on public.qm_team_members for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists p_tm_owner on public.qm_team_members;
create policy p_tm_owner on public.qm_team_members for all using (
  exists(select 1 from public.qm_teams t join public.qm_hunts h on h.id = t.hunt_id where t.id = public.qm_team_members.team_id and h.owner_id = auth.uid())
) with check (true);
drop policy if exists p_tm_admin on public.qm_team_members;
create policy p_tm_admin on public.qm_team_members for all using (public.is_admin()) with check (public.is_admin());

-- public.qm_memberships
drop policy if exists p_mem_self on public.qm_memberships;
create policy p_mem_self on public.qm_memberships for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists p_mem_owner_select on public.qm_memberships;
create policy p_mem_owner_select on public.qm_memberships for select using (
  exists(select 1 from public.qm_hunts h where h.id = public.qm_memberships.hunt_id and h.owner_id = auth.uid())
);
drop policy if exists p_mem_admin on public.qm_memberships;
create policy p_mem_admin on public.qm_memberships for all using (public.is_admin()) with check (public.is_admin());

-- public.qm_submissions
drop policy if exists p_sub_self on public.qm_submissions;
create policy p_sub_self on public.qm_submissions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists p_sub_owner on public.qm_submissions;
create policy p_sub_owner on public.qm_submissions for all using (
  exists(select 1 from public.qm_challenges c join public.qm_hunts h on h.id=c.hunt_id where c.id = public.qm_submissions.challenge_id and h.owner_id = auth.uid())
) with check (
  exists(select 1 from public.qm_challenges c join public.qm_hunts h on h.id=c.hunt_id where c.id = public.qm_submissions.challenge_id and h.owner_id = auth.uid())
);
drop policy if exists p_sub_admin on public.qm_submissions;
create policy p_sub_admin on public.qm_submissions for all using (public.is_admin()) with check (public.is_admin());

-- public.qm_audit_log: admins read; anyone can insert their own action
drop policy if exists p_audit_admin_read on public.qm_audit_log;
create policy p_audit_admin_read on public.qm_audit_log for select using (public.is_admin());
drop policy if exists p_audit_self_insert on public.qm_audit_log;
create policy p_audit_self_insert on public.qm_audit_log for insert with check (actor_id = auth.uid() or public.is_admin());
