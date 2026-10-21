-- KZ-031: Integrasi Pay ke Akademi (kunci API pencipta dan pendaftaran automatik)
-- Idempoten. CTO jalankan di production pada supabase-db dan supabase-db-veltrix.

-- 1. Benarkan source 'pay' pada pendaftaran (check constraint sedia ada dibina semula)
alter table lms_enrollments
  drop constraint if exists lms_enrollments_source_check;
alter table lms_enrollments
  add constraint lms_enrollments_source_check
    check (source in ('free','stripe','toyyibpay','billplz','grant','pay'));

-- 2. Rujukan pesanan Pay pada pendaftaran
alter table lms_enrollments
  add column if not exists pay_order_ref text;

-- 3. Skop kunci API (setakat ini hanya 'pay')
alter table lms_api_keys
  add column if not exists scope text not null default 'pay';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lms_api_keys_scope_check'
      and conrelid = 'lms_api_keys'::regclass
  ) then
    alter table lms_api_keys
      add constraint lms_api_keys_scope_check
        check (scope in ('pay'));
  end if;
end
$$;

-- 4. Cincangan kunci mesti unik (carian kunci mengikut cincangan)
create unique index if not exists lms_api_keys_key_hash_uidx
  on lms_api_keys (key_hash);

-- 5. Cari pengguna mengikut e-mel untuk pendaftaran automatik Pay.
--    SECURITY DEFINER diperlukan supaya service_role boleh baca auth.users
--    tanpa mendedahkan jadual itu kepada peranan lain. EXECUTE hanya
--    service_role; anon dan authenticated ditolak kerana fungsi ini
--    boleh membocorkan sama ada sesebuah e-mel mempunyai akaun.
create or replace function public.lms_pay_cari_pengguna(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    return null;
  end if;
  select u.id into v_id
  from auth.users u
  where lower(btrim(u.email)) = lower(btrim(p_email))
  order by u.created_at
  limit 1;
  return v_id;
end;
$$;

revoke all on function public.lms_pay_cari_pengguna(text) from public, anon, authenticated;
grant execute on function public.lms_pay_cari_pengguna(text) to service_role;
