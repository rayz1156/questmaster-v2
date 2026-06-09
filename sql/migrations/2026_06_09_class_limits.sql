-- Class limits: per-educator caps on owned classes and co-educator memberships
begin;
alter table public.qm_profiles
  add column if not exists max_classes_owned integer not null default 10,
  add column if not exists max_classes_as_coeducator integer not null default 10;
commit;

-- Enforce owned-class limit on creation via trigger
create or replace function public.qm_enforce_class_owner_limit()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare
  v_limit integer;
  v_count integer;
begin
  select max_classes_owned into v_limit from public.qm_profiles where id = new.owner_id;
  if v_limit is null then return new; end if; -- no limit configured
  select count(*) into v_count from public.qm_classes where owner_id = new.owner_id;
  if v_count >= v_limit then
    raise exception 'Class creation limit reached (% of % classes). Contact an admin to raise your limit.', v_count, v_limit
      using errcode='P0001';
  end if;
  return new;
end;
$fn$;

drop trigger if exists qm_class_owner_limit_trg on public.qm_classes;
create trigger qm_class_owner_limit_trg
  before insert on public.qm_classes
  for each row execute function public.qm_enforce_class_owner_limit();

-- Patch co-educator accept RPC to enforce max_classes_as_coeducator
create or replace function public.qm_accept_class_educator_invite_by_code(p_code text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare
  v_invite record;
  v_user_email text := lower(coalesce((auth.jwt() ->> 'email')::text, ''));
  v_limit integer;
  v_count integer;
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

  -- Enforce co-educator limit (only count classes the user does not already own)
  select max_classes_as_coeducator into v_limit from public.qm_profiles where id = auth.uid();
  if v_limit is not null then
    select count(*) into v_count
    from public.qm_class_educators
    where educator_id = auth.uid() and accepted_at is not null;
    if v_count >= v_limit and not exists (
      select 1 from public.qm_class_educators
      where educator_id = auth.uid() and class_id = v_invite.class_id and accepted_at is not null
    ) then
      raise exception 'Co-educator limit reached (% of % classes). Contact an admin to raise your limit.', v_count, v_limit using errcode='P0001';
    end if;
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
$fn$;
