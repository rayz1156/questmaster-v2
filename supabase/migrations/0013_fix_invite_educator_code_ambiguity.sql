-- Fix "column reference 'code' is ambiguous" error when inviting an educator.
-- The previous version of public.qm_invite_class_educator had a RETURNS TABLE
-- declaring an output column named `code`, which collided with the unqualified
-- `code` column reference inside the function body.
--
-- This patch re-creates the function, fully-qualifying every `code` column
-- reference with the table name (qm_class_educator_invites).

create or replace function public.qm_invite_class_educator(
  p_class uuid,
  p_email text
)
returns table (id uuid, code text, token text, expires_at timestamptz, email text, status text)
language plpgsql security definer
set search_path = public, pg_temp
as $f$
declare
  v_email text;
  v_existing_educator_id uuid;
  v_id uuid;
  v_code text;
  v_token text;
  v_expires timestamptz;
begin
  -- Only the class owner can invite
  if not exists (
    select 1 from public.qm_classes c
    where c.id = p_class and c.owner_id = auth.uid()
  ) then
    raise exception 'Only the class owner can invite educators';
  end if;

  v_email := lower(trim(p_email));
  if v_email is null or v_email = '' then
    raise exception 'Email is required';
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
      exit when not exists(
        select 1 from public.qm_class_educator_invites cei2
        where cei2.code = v_code
      );
    end loop;
    insert into public.qm_class_educator_invites (class_id, email, code, invited_by, expires_at)
      values (p_class, v_email, v_code, auth.uid(), now() + interval '14 days')
      returning qm_class_educator_invites.id,
                qm_class_educator_invites.code,
                qm_class_educator_invites.token,
                qm_class_educator_invites.expires_at
      into v_id, v_code, v_token, v_expires;
  end if;

  return query select v_id, v_code, v_token, v_expires, v_email, 'pending'::text;
end;
$f$;
grant execute on function public.qm_invite_class_educator(uuid, text) to authenticated;
