-- Fix infinite recursion: replace cross-table EXISTS subqueries in RLS with
-- SECURITY DEFINER helpers that bypass RLS internally.

create or replace function public.qm_is_class_owner(p_class uuid)
returns boolean language sql security definer stable as $f$
  select exists(select 1 from public.qm_classes where id = p_class and owner_id = auth.uid());
$f$;
grant execute on function public.qm_is_class_owner(uuid) to authenticated, anon;

create or replace function public.qm_is_class_member(p_class uuid)
returns boolean language sql security definer stable as $f$
  select exists(select 1 from public.qm_class_members where class_id = p_class and user_id = auth.uid());
$f$;
grant execute on function public.qm_is_class_member(uuid) to authenticated, anon;

-- qm_classes
drop policy if exists p_class_owner on public.qm_classes;
drop policy if exists p_class_member_read on public.qm_classes;
drop policy if exists p_class_admin on public.qm_classes;

create policy p_class_owner on public.qm_classes for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy p_class_member_read on public.qm_classes for select
  using (public.qm_is_class_member(id));

create policy p_class_admin on public.qm_classes for all
  using (public.is_admin()) with check (public.is_admin());

-- qm_class_members
drop policy if exists p_cm_self on public.qm_class_members;
drop policy if exists p_cm_owner on public.qm_class_members;
drop policy if exists p_cm_admin on public.qm_class_members;

create policy p_cm_self on public.qm_class_members for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy p_cm_owner on public.qm_class_members for all
  using (public.qm_is_class_owner(class_id))
  with check (public.qm_is_class_owner(class_id));

create policy p_cm_admin on public.qm_class_members for all
  using (public.is_admin()) with check (public.is_admin());

-- qm_class_invites
drop policy if exists p_ci_owner on public.qm_class_invites;
drop policy if exists p_ci_admin on public.qm_class_invites;

create policy p_ci_owner on public.qm_class_invites for all
  using (public.qm_is_class_owner(class_id))
  with check (public.qm_is_class_owner(class_id));

create policy p_ci_admin on public.qm_class_invites for all
  using (public.is_admin()) with check (public.is_admin());
