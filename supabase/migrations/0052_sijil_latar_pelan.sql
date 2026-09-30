-- 0052 (CTO, V2-015): latar sijil reka bentuk penuh.
-- 1. Pencetus pelan templat sijil kini menerima pelan 'unlimited' selain
--    pro dan institution. Sebelum ini latar dan logo pemilik Unlimited
--    dipaksa NULL secara senyap.
-- 2. Had saiz bucket certificate-assets dinaikkan dari 5MB ke 8MB supaya
--    PNG A4 300 dpi daripada Canva diterima (selari dengan had UI dan API).
BEGIN;

create or replace function public.qm_certificate_template_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner uuid;
  v_plan  text;
begin
  select k.owner_id into v_owner
    from public.qm_classes k
   where k.id = new.class_id;
  select public.qm_effective_plan(v_owner) into v_plan;
  if v_plan is null or v_plan not in ('pro', 'institution', 'unlimited') then
    new.background_path := null;
    new.logo_path := null;
  end if;
  return new;
end;
$fn$;

revoke all on function public.qm_certificate_template_plan_guard() from public, anon;

update storage.buckets
   set file_size_limit = 8388608
 where id = 'certificate-assets';

notify pgrst, 'reload schema';

COMMIT;
