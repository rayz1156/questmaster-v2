-- =====================================================
-- 0024_leave_class.sql
-- Allow students to leave classes they joined and
-- allow co-educators to leave classes they were invited to.
-- Owners cannot use these functions to remove themselves.
-- =====================================================

-- ---- 1. Student leave ----------------------------------
create or replace function public.qm_leave_class_as_student(p_class uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_class is null then raise exception 'class id required'; end if;
  delete from public.qm_class_members
    where class_id = p_class
      and user_id  = auth.uid();
end;
$f$;
grant execute on function public.qm_leave_class_as_student(uuid) to authenticated;

-- ---- 2. Co-educator leave ------------------------------
-- Refuses if the caller is the class owner (owners must transfer/delete the class).
create or replace function public.qm_leave_class_as_educator(p_class uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
declare
  v_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_class is null then raise exception 'class id required'; end if;

  select role into v_role
    from public.qm_class_educators
    where class_id = p_class
      and educator_id = auth.uid();

  if v_role is null then
    raise exception 'You are not an educator on this class';
  end if;

  if v_role = 'owner' then
    raise exception 'Owners cannot leave their own class. Transfer ownership or delete the class instead.';
  end if;

  delete from public.qm_class_educators
    where class_id = p_class
      and educator_id = auth.uid();
end;
$f$;
grant execute on function public.qm_leave_class_as_educator(uuid) to authenticated;
