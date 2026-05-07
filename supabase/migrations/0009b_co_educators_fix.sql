-- 0009b_co_educators_fix.sql
-- Corrects functions from 0009_co_educators.sql to source educator email from
-- auth.users(email) instead of qm_profiles (which has no email column).

-- ---- 1. Re-create qm_invite_class_educator with auth.users join ----
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
  join auth.users u on u.id = ce.educator_id
  where ce.class_id = p_class and lower(u.email) = v_email
  limit 1;
  if v_existing_educator_id is not null then
    raise exception 'That educator is already on this class';
  end if;

  -- Reuse a still-valid pending invite if one exists
  select cei.id, cei.code, cei.token, cei.expires_at
    into v_id, v_code, v_token, v_expires
  from public.qm_class_educator_invites cei
  where cei.class_id = p_class
    and lower(cei.email) = v_email
    and cei.status = 'pending'
    and cei.expires_at > now()
  limit 1;

  if v_id is null then
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

-- ---- 2. Re-create qm_list_class_educators with auth.users join for email ----
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
         u.email::text, p.display_name
  from public.qm_class_educators ce
  left join public.qm_profiles p on p.id = ce.educator_id
  left join auth.users u on u.id = ce.educator_id
  where ce.class_id = p_class
    and (public.qm_is_class_educator(p_class) or public.is_admin())
  order by case ce.role when 'owner' then 0 else 1 end, ce.invited_at;
$f$;
grant execute on function public.qm_list_class_educators(uuid) to authenticated;

-- ---- 3. Re-create the remaining list RPCs that didn't get created ----
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
