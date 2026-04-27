create table if not exists public.qm_classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.qm_profiles(id) on delete cascade,
  name text not null,
  description text,
  color text default '#6366f1',
  join_code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.qm_classes enable row level security;
create index if not exists classes_owner_idx on public.qm_classes(owner_id);

create table if not exists public.qm_class_members (
  class_id uuid not null references public.qm_classes(id) on delete cascade,
  user_id uuid not null references public.qm_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
alter table public.qm_class_members enable row level security;
create index if not exists class_members_user_idx on public.qm_class_members(user_id);

create table if not exists public.qm_class_invites (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.qm_classes(id) on delete cascade,
  email text,
  token text unique not null default replace(gen_random_uuid()::text,'-',''),
  invited_by uuid references public.qm_profiles(id) on delete set null,
  accepted_at timestamptz,
  accepted_by uuid references public.qm_profiles(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.qm_class_invites enable row level security;
create index if not exists class_invites_class_idx on public.qm_class_invites(class_id);
create index if not exists class_invites_email_idx on public.qm_class_invites(email);

alter table public.qm_hunts add column if not exists class_id uuid references public.qm_classes(id) on delete cascade;
create index if not exists hunts_class_idx on public.qm_hunts(class_id);

do $$
declare
  r record;
  new_class uuid;
begin
  for r in select distinct owner_id from public.qm_hunts where class_id is null loop
    insert into public.qm_classes(owner_id, name, description)
      values (r.owner_id, 'My First Class', 'Auto-created from existing activities')
      returning id into new_class;
    update public.qm_hunts set class_id = new_class
      where owner_id = r.owner_id and class_id is null;
    insert into public.qm_class_members(class_id, user_id)
      select distinct new_class, m.user_id
      from public.qm_memberships m
      join public.qm_hunts h on h.id = m.hunt_id
      where h.owner_id = r.owner_id
      on conflict do nothing;
  end loop;
end $$;

alter table public.qm_hunts alter column class_id set not null;

drop policy if exists p_class_owner on public.qm_classes;
create policy p_class_owner on public.qm_classes for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists p_class_member_read on public.qm_classes;
create policy p_class_member_read on public.qm_classes for select
  using (exists(select 1 from public.qm_class_members cm
                where cm.class_id = id and cm.user_id = auth.uid()));

drop policy if exists p_class_admin on public.qm_classes;
create policy p_class_admin on public.qm_classes for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists p_cm_self on public.qm_class_members;
create policy p_cm_self on public.qm_class_members for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists p_cm_owner on public.qm_class_members;
create policy p_cm_owner on public.qm_class_members for all
  using (exists(select 1 from public.qm_classes c where c.id = class_id and c.owner_id = auth.uid()))
  with check (exists(select 1 from public.qm_classes c where c.id = class_id and c.owner_id = auth.uid()));

drop policy if exists p_cm_admin on public.qm_class_members;
create policy p_cm_admin on public.qm_class_members for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists p_ci_owner on public.qm_class_invites;
create policy p_ci_owner on public.qm_class_invites for all
  using (exists(select 1 from public.qm_classes c where c.id = class_id and c.owner_id = auth.uid()))
  with check (exists(select 1 from public.qm_classes c where c.id = class_id and c.owner_id = auth.uid()));

drop policy if exists p_ci_admin on public.qm_class_invites;
create policy p_ci_admin on public.qm_class_invites for all
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.qm_join_class_by_code(p_code text)
returns uuid
language plpgsql security definer
as $f$
declare
  v_class uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id into v_class from public.qm_classes where join_code = upper(p_code) and is_archived = false;
  if v_class is null then raise exception 'Invalid class code'; end if;
  insert into public.qm_class_members(class_id, user_id) values (v_class, auth.uid())
    on conflict do nothing;
  return v_class;
end $f$;
grant execute on function public.qm_join_class_by_code(text) to authenticated;

create or replace function public.qm_accept_class_invite(p_token text)
returns uuid
language plpgsql security definer
as $f$
declare
  v_invite record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_invite from public.qm_class_invites
    where token = p_token and accepted_at is null
      and (expires_at is null or expires_at > now());
  if v_invite is null then raise exception 'Invalid or expired invite'; end if;
  insert into public.qm_class_members(class_id, user_id)
    values (v_invite.class_id, auth.uid()) on conflict do nothing;
  update public.qm_class_invites
    set accepted_at = now(), accepted_by = auth.uid()
    where id = v_invite.id;
  return v_invite.class_id;
end $f$;
grant execute on function public.qm_accept_class_invite(text) to authenticated;
