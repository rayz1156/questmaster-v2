-- 0009_co_educators.sql
-- Adds support for inviting other educators as co-creators of a class.
-- Pattern: junction table qm_class_educators (owner|co_creator) + email-locked invites with short code.
-- Backfills one owner row per existing class from qm_classes.owner_id.

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.qm_class_educators (
  class_id     uuid not null references public.qm_classes(id) on delete cascade,
  educator_id  uuid not null references public.qm_profiles(id) on delete cascade,
  role         text not null check (role in ('owner','co_creator')),
  invited_by   uuid references public.qm_profiles(id) on delete set null,
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (class_id, educator_id)
);
alter table public.qm_class_educators enable row level security;
create index if not exists qm_class_educators_educator_idx on public.qm_class_educators(educator_id);
-- enforce exactly one owner per class
create unique index if not exists qm_class_educators_one_owner_idx
  on public.qm_class_educators(class_id) where role = 'owner';

create table if not exists public.qm_class_educator_invites (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.qm_classes(id) on delete cascade,
  email        text not null,
  code         text unique not null,
  token        text unique not null default replace(gen_random_uuid()::text,'-',''),
  invited_by   uuid references public.qm_profiles(id) on delete set null,
  status       text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_by  uuid references public.qm_profiles(id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.qm_class_educator_invites enable row level security;
create index if not exists qm_class_edu_invites_class_idx on public.qm_class_educator_invites(class_id);
create index if not exists qm_class_edu_invites_email_idx on public.qm_class_educator_invites(lower(email));

-- ============================================================
-- 2. Helper functions (security definer so RLS callers don't recurse)
-- ============================================================

create or replace function public.qm_is_class_educator(p_class uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $f$
  select exists(
    select 1 from public.qm_class_educators ce
    where ce.class_id = p_class
      and ce.educator_id = auth.uid()
      and ce.accepted_at is not null
  );
$f$;
grant execute on function public.qm_is_class_educator(uuid) to authenticated;

create or replace function public.qm_is_class_owner(p_class uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $f$
  select exists(
    select 1 from public.qm_class_educators ce
    where ce.class_id = p_class
      and ce.educator_id = auth.uid()
      and ce.role = 'owner'
      and ce.accepted_at is not null
  );
$f$;
grant execute on function public.qm_is_class_owner(uuid) to authenticated;

-- short, human-friendly invite code (8 chars, base32-ish, no ambiguous 0/O/1/I)
create or replace function public.qm_gen_class_educator_invite_code()
returns text language plpgsql as $f$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result   text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$f$;

-- ============================================================
-- 3. Backfill: every existing class gets its current owner_id as 'owner'
-- ============================================================
insert into public.qm_class_educators (class_id, educator_id, role, invited_by, invited_at, accepted_at)
select c.id, c.owner_id, 'owner', c.owner_id, c.created_at, c.created_at
from public.qm_classes c
on conflict (class_id, educator_id) do nothing;

-- ============================================================
-- 4. RLS on the new tables
-- ============================================================

-- qm_class_educators: an educator can read rows for classes they belong to;
-- only owners can write (insert/update/delete). Self-reads are also allowed.
drop policy if exists p_ce_self_read on public.qm_class_educators;
create policy p_ce_self_read on public.qm_class_educators for select
  using (educator_id = auth.uid() or public.qm_is_class_educator(class_id));

drop policy if exists p_ce_owner_write on public.qm_class_educators;
create policy p_ce_owner_write on public.qm_class_educators for all
  using (public.qm_is_class_owner(class_id))
  with check (public.qm_is_class_owner(class_id));

drop policy if exists p_ce_admin on public.qm_class_educators;
create policy p_ce_admin on public.qm_class_educators for all
  using (public.is_admin()) with check (public.is_admin());

-- qm_class_educator_invites: owner of the class can read/manage; the invitee
-- (matched by lower(email) = lower(auth.email())) can read their own pending invites.
drop policy if exists p_cei_owner on public.qm_class_educator_invites;
create policy p_cei_owner on public.qm_class_educator_invites for all
  using (public.qm_is_class_owner(class_id))
  with check (public.qm_is_class_owner(class_id));

drop policy if exists p_cei_invitee_read on public.qm_class_educator_invites;
create policy p_cei_invitee_read on public.qm_class_educator_invites for select
  using (lower(email) = lower(coalesce((auth.jwt() ->> 'email')::text, '')));

drop policy if exists p_cei_admin on public.qm_class_educator_invites;
create policy p_cei_admin on public.qm_class_educator_invites for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 5. Extend existing RLS so co-creators get the same management access
--    that owner_id used to have on qm_classes / qm_class_members /
--    qm_class_invites / qm_hunts. We keep the original owner policies
--    intact and add educator-aware companions.
-- ============================================================

-- qm_classes: any educator on the class can read/write; only owners can delete
drop policy if exists p_class_educator_rw on public.qm_classes;
create policy p_class_educator_rw on public.qm_classes for all
  using (public.qm_is_class_educator(id))
  with check (public.qm_is_class_educator(id));
-- restrict deletes specifically to owner (owner_id legacy or qm_is_class_owner)
drop policy if exists p_class_owner_only_delete on public.qm_classes;
create policy p_class_owner_only_delete on public.qm_classes for delete
  using (public.qm_is_class_owner(id) or owner_id = auth.uid() or public.is_admin());

-- qm_class_members: educators (any role) can manage participants on their class
drop policy if exists p_cm_educator on public.qm_class_members;
create policy p_cm_educator on public.qm_class_members for all
  using (public.qm_is_class_educator(class_id))
  with check (public.qm_is_class_educator(class_id));

-- qm_class_invites (participant invites): any educator can manage
drop policy if exists p_ci_educator on public.qm_class_invites;
create policy p_ci_educator on public.qm_class_invites for all
  using (public.qm_is_class_educator(class_id))
  with check (public.qm_is_class_educator(class_id));

-- qm_hunts (activities/quests): any educator on the hunt's class can manage
drop policy if exists p_hunts_educator on public.qm_hunts;
create policy p_hunts_educator on public.qm_hunts for all
  using (
    class_id is not null and public.qm_is_class_educator(class_id)
  )
  with check (
    class_id is not null and public.qm_is_class_educator(class_id)
  );

-- ============================================================
-- 6. RPCs (security definer; granted to authenticated)
-- ============================================================

-- Invite an educator to a class by email. Owner-only.
-- Returns the new invite row (id, code, token, expires_at).
create or replace function public.qm_invite_class_educator(
  p_class uuid,
  p_email text
)
returns table (id uuid, code text, token text, expires_at timestamptz, email text, status text)
language plpgsql security definer
set search_path = public, pg_temp
as $f$
declare
  v_email text := lower(trim(p_email));
  v_code  text;
  v_id    uuid;
  v_token text;
  v_expires timestamptz := now() + interval '7 days';
  v_existing_educator_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if not public.qm_is_class_owner(p_class) then
    raise exception 'Only the class owner can invite educators' using errcode='42501';
  end if;
  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Invalid email';
  end if;

  -- Already an educator on this class?
  select ce.educator_id into v_existing_educator_id
  from public.qm_class_educators ce
  join public.qm_profiles p on p.id = ce.educator_id
  where ce.class_id = p_class and lower(p.email) = v_email
  limit 1;
  if v_existing_educator_id is not null then
    raise exception 'That educator is already on this class';
  end if;

  -- Reuse an existing pending invite if one already exists for this email+class
  select cei.id, cei.code, cei.token, cei.expires_at
    into v_id, v_code, v_token, v_expires
  from public.qm_class_educator_invites cei
  where cei.class_id = p_class
    and lower(cei.email) = v_email
    and cei.status = 'pending'
    and cei.expires_at > now()
  limit 1;

  if v_id is null then
    -- generate a unique code
    loop
      v_code := public.qm_gen_class_educator_invite_code();
      exit when not exists(select 1 from public.qm_class_educator_invites where code = v_code);
    end loop;
    insert into public.qm_class_educator_invites (class_id, email, code, invited_by, expires_at)
      values (p_class, v_email, v_code, auth.uid(), v_expires)
      returning qm_class_educator_invites.id, qm_class_educator_invites.code, qm_class_educator_invites.token, qm_class_educator_invites.expires_at
      into v_id, v_code, v_token, v_expires;
  end if;

  return query select v_id, v_code, v_token, v_expires, v_email, 'pending'::text;
end;
$f$;
grant execute on function public.qm_invite_class_educator(uuid, text) to authenticated;

-- Accept an educator invite by short code. Email-locked: caller's auth email must match.
create or replace function public.qm_accept_class_educator_invite_by_code(p_code text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $f$
declare
  v_invite     record;
  v_user_email text := lower(coalesce((auth.jwt() ->> 'email')::text, ''));
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if v_user_email = '' then raise exception 'Account has no email'; end if;
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'Invite code required'; end if;

  select * into v_invite
  from public.qm_class_educator_invites
  where upper(code) = upper(trim(p_code))
  limit 1;
  if v_invite is null then raise exception 'Invalid invite code'; end if;
  if v_invite.status <> 'pending' then raise exception 'Invite is no longer pending'; end if;
  if v_invite.expires_at <= now() then
    update public.qm_class_educator_invites set status = 'expired' where id = v_invite.id;
    raise exception 'Invite has expired';
  end if;
  if lower(v_invite.email) <> v_user_email then
    raise exception 'This invite was sent to %. Sign in with that email to accept.', v_invite.email;
  end if;

  insert into public.qm_class_educators (class_id, educator_id, role, invited_by, invited_at, accepted_at)
    values (v_invite.class_id, auth.uid(), 'co_creator', v_invite.invited_by, v_invite.created_at, now())
    on conflict (class_id, educator_id) do update
      set accepted_at = coalesce(public.qm_class_educators.accepted_at, excluded.accepted_at);

  update public.qm_class_educator_invites
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v_invite.id;

  return v_invite.class_id;
end;
$f$;
grant execute on function public.qm_accept_class_educator_invite_by_code(text) to authenticated;

-- Revoke a pending educator invite. Owner-only.
create or replace function public.qm_revoke_class_educator_invite(p_invite uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $f$
declare v_class uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  select class_id into v_class from public.qm_class_educator_invites where id = p_invite;
  if v_class is null then raise exception 'Invite not found'; end if;
  if not public.qm_is_class_owner(v_class) then raise exception 'Only the class owner can revoke invites'; end if;
  update public.qm_class_educator_invites
    set status = 'revoked'
    where id = p_invite and status = 'pending';
end;
$f$;
grant execute on function public.qm_revoke_class_educator_invite(uuid) to authenticated;

-- Remove a co-creator from a class. Owner-only. Cannot remove the owner.
create or replace function public.qm_remove_class_educator(p_class uuid, p_educator uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $f$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if not public.qm_is_class_owner(p_class) then raise exception 'Only the class owner can remove educators'; end if;
  select role into v_role from public.qm_class_educators where class_id = p_class and educator_id = p_educator;
  if v_role is null then raise exception 'Educator is not on this class'; end if;
  if v_role = 'owner' then raise exception 'Cannot remove the owner. Transfer ownership first.'; end if;
  delete from public.qm_class_educators where class_id = p_class and educator_id = p_educator;
end;
$f$;
grant execute on function public.qm_remove_class_educator(uuid, uuid) to authenticated;

-- Transfer ownership: current owner -> co_creator, target co_creator -> owner. Atomic.
create or replace function public.qm_transfer_class_ownership(p_class uuid, p_new_owner uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $f$
declare
  v_target_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if not public.qm_is_class_owner(p_class) then raise exception 'Only the current owner can transfer ownership'; end if;
  if p_new_owner = auth.uid() then raise exception 'You are already the owner'; end if;
  select role into v_target_role from public.qm_class_educators where class_id = p_class and educator_id = p_new_owner;
  if v_target_role is null then raise exception 'Target educator is not a co-creator on this class'; end if;

  -- Drop the partial unique index temporarily by updating both rows in one transaction.
  -- Step 1: demote current owner first to free the unique slot, step 2: promote target.
  update public.qm_class_educators set role = 'co_creator'
    where class_id = p_class and educator_id = auth.uid();
  update public.qm_class_educators set role = 'owner', accepted_at = coalesce(accepted_at, now())
    where class_id = p_class and educator_id = p_new_owner;

  -- keep legacy qm_classes.owner_id in sync so any code that still reads it stays correct
  update public.qm_classes set owner_id = p_new_owner where id = p_class;
end;
$f$;
grant execute on function public.qm_transfer_class_ownership(uuid, uuid) to authenticated;

-- ============================================================
-- 7. Read RPCs that join in profile/class info (security definer
--    so the UI can render names + emails without requiring a wide
--    SELECT policy on qm_profiles).
-- ============================================================

-- List all educators on a class, including their role and profile basics.
-- Caller must be an educator on the class.
create or replace function public.qm_list_class_educators(p_class uuid)
returns table (
  educator_id   uuid,
  role          text,
  invited_by    uuid,
  invited_at    timestamptz,
  accepted_at   timestamptz,
  email         text,
  display_name  text
)
language sql stable security definer
set search_path = public, pg_temp
as $f$
  select ce.educator_id, ce.role, ce.invited_by, ce.invited_at, ce.accepted_at,
         p.email, p.display_name
  from public.qm_class_educators ce
  left join public.qm_profiles p on p.id = ce.educator_id
  where ce.class_id = p_class
    and (public.qm_is_class_educator(p_class) or public.is_admin())
  order by case ce.role when 'owner' then 0 else 1 end, ce.invited_at;
$f$;
grant execute on function public.qm_list_class_educators(uuid) to authenticated;

-- List pending educator invites for a class. Owner-only.
create or replace function public.qm_list_class_educator_invites(p_class uuid)
returns table (
  id          uuid,
  email       text,
  code        text,
  status      text,
  invited_by  uuid,
  expires_at  timestamptz,
  created_at  timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $f$
  select cei.id, cei.email, cei.code, cei.status, cei.invited_by, cei.expires_at, cei.created_at
  from public.qm_class_educator_invites cei
  where cei.class_id = p_class
    and (public.qm_is_class_owner(p_class) or public.is_admin())
  order by cei.created_at desc;
$f$;
grant execute on function public.qm_list_class_educator_invites(uuid) to authenticated;

-- List pending educator invites addressed to the calling user's email.
create or replace function public.qm_list_my_class_educator_invites()
returns table (
  id          uuid,
  class_id    uuid,
  class_name  text,
  class_color text,
  email       text,
  code        text,
  status      text,
  invited_by  uuid,
  inviter_name text,
  expires_at  timestamptz,
  created_at  timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $f$
  select cei.id, cei.class_id, c.name, c.color, cei.email, cei.code, cei.status,
         cei.invited_by, p.display_name, cei.expires_at, cei.created_at
  from public.qm_class_educator_invites cei
  join public.qm_classes c on c.id = cei.class_id
  left join public.qm_profiles p on p.id = cei.invited_by
  where lower(cei.email) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
    and cei.status = 'pending'
    and cei.expires_at > now()
  order by cei.created_at desc;
$f$;
grant execute on function public.qm_list_my_class_educator_invites() to authenticated;

-- List classes I'm an educator on (owner or co_creator), with role.
create or replace function public.qm_list_my_educator_classes()
returns table (
  id            uuid,
  name          text,
  description   text,
  color         text,
  join_code     text,
  is_archived   boolean,
  created_at    timestamptz,
  role          text
)
language sql stable security definer
set search_path = public, pg_temp
as $f$
  select c.id, c.name, c.description, c.color, c.join_code, c.is_archived, c.created_at, ce.role
  from public.qm_class_educators ce
  join public.qm_classes c on c.id = ce.class_id
  where ce.educator_id = auth.uid()
    and ce.accepted_at is not null
  order by case ce.role when 'owner' then 0 else 1 end, c.created_at desc;
$f$;
grant execute on function public.qm_list_my_educator_classes() to authenticated;
