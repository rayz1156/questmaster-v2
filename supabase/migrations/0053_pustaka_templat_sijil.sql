-- 0053_pustaka_templat_sijil.sql
--
-- V2-016a: pustaka templat sijil.
--   1. Jadual qm_certificate_library: templat galeri (admin) dan templat
--      peribadi educator ("Templat saya"). Sijil tetap dikeluarkan melalui
--      templat KELAS; tiada perubahan pada qm_issue_certificates.
--   2. RLS pustaka: galeri diterbitkan dilihat semua pengguna sahih,
--      galeri penuh untuk pentadbir aktif, personal hanya pemiliknya.
--   3. Pencetus qm_certificate_library_guard (BEFORE INSERT): personal
--      memerlukan pelan berkesan berbayar dan had 50 item setiap educator.
--   4. qm_certificate_templates.library_id merujuk item pustaka asal,
--      ON DELETE SET NULL supaya memadam item galeri tidak merosakkan
--      templat kelas yang sudah menggunakannya.
--   5. Pencetus pelan templat (0052) dikemas kini: laluan gallery/
--      dibenarkan hanya untuk item galeri diterbitkan yang padan (free_tier
--      atau pelan berbayar pemilik kelas); laluan library/ seperti latar
--      sendiri (pelan berbayar pemilik kelas); laluan lain kekal peraturan
--      0052.
--   6. qm_certificate_asset_in_use: semakan rujukan laluan aset merentas
--      templat kelas dan pustaka, supaya fail yang masih digunakan tidak
--      dipadam (pembaikan asset-finalize V2-016a).
--
-- Semua mesej ralat sampai ke skrin pengguna: Bahasa Inggeris.
-- ERRCODE sentiasa tepat lima aksara (perangkap live quiz 0018).

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Jadual pustaka templat
-- ---------------------------------------------------------------------

create table if not exists public.qm_certificate_library (
  id              uuid primary key default gen_random_uuid(),
  scope           text not null check (scope in ('gallery', 'personal')),
  owner_id        uuid references public.qm_profiles(id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 120),
  kind            text check (kind in ('participation', 'achievement')),
  text_tone       text not null default 'dark' check (text_tone in ('dark', 'light')),
  background_path text,
  logo_path       text,
  layout          jsonb not null default '{}'::jsonb,
  free_tier       boolean not null default false,
  published       boolean not null default false,
  sort_order      int not null default 0,
  created_by      uuid references public.qm_profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- owner_id mesti NULL untuk galeri dan wajib untuk personal.
  constraint qm_certificate_library_scope_owner check (
    (scope = 'gallery' and owner_id is null)
    or (scope = 'personal' and owner_id is not null)
  )
);

create index if not exists qm_certificate_library_senarai_idx
  on public.qm_certificate_library (scope, published, sort_order);
create index if not exists qm_certificate_library_owner_idx
  on public.qm_certificate_library (owner_id);

revoke all on public.qm_certificate_library from anon;
grant select, insert, update, delete on public.qm_certificate_library to authenticated;

-- ---------------------------------------------------------------------
-- 2. RLS pustaka
-- ---------------------------------------------------------------------

alter table public.qm_certificate_library enable row level security;

drop policy if exists p_cert_lib_select on public.qm_certificate_library;
create policy p_cert_lib_select on public.qm_certificate_library
  for select to authenticated
  using (
    (scope = 'gallery' and published)
    or (scope = 'gallery' and public.qm_admin_aktif())
    or (scope = 'personal' and owner_id = auth.uid())
  );

drop policy if exists p_cert_lib_gallery_insert on public.qm_certificate_library;
create policy p_cert_lib_gallery_insert on public.qm_certificate_library
  for insert to authenticated
  with check (scope = 'gallery' and public.qm_admin_aktif());

drop policy if exists p_cert_lib_personal_insert on public.qm_certificate_library;
create policy p_cert_lib_personal_insert on public.qm_certificate_library
  for insert to authenticated
  with check (scope = 'personal' and owner_id = auth.uid());

drop policy if exists p_cert_lib_gallery_update on public.qm_certificate_library;
create policy p_cert_lib_gallery_update on public.qm_certificate_library
  for update to authenticated
  using (scope = 'gallery' and public.qm_admin_aktif())
  with check (scope = 'gallery' and public.qm_admin_aktif());

drop policy if exists p_cert_lib_personal_update on public.qm_certificate_library;
create policy p_cert_lib_personal_update on public.qm_certificate_library
  for update to authenticated
  using (scope = 'personal' and owner_id = auth.uid())
  with check (scope = 'personal' and owner_id = auth.uid());

drop policy if exists p_cert_lib_gallery_delete on public.qm_certificate_library;
create policy p_cert_lib_gallery_delete on public.qm_certificate_library
  for delete to authenticated
  using (scope = 'gallery' and public.qm_admin_aktif());

drop policy if exists p_cert_lib_personal_delete on public.qm_certificate_library;
create policy p_cert_lib_personal_delete on public.qm_certificate_library
  for delete to authenticated
  using (scope = 'personal' and owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Pengawal sisipan personal: pelan berbayar dan had 50 item
-- ---------------------------------------------------------------------

create or replace function public.qm_certificate_library_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_bil   int;
  v_pelan text;
begin
  if new.scope = 'personal' then
    select public.qm_effective_plan(new.owner_id) into v_pelan;
    if v_pelan is null or v_pelan not in ('pro', 'institution', 'unlimited') then
      raise exception 'MY_TEMPLATE_PLAN' using errcode = 'LIB02';
    end if;
    select count(*) into v_bil
      from public.qm_certificate_library
     where owner_id = new.owner_id
       and scope = 'personal';
    if v_bil >= 50 then
      raise exception 'LIBRARY_LIMIT' using errcode = 'LIB01';
    end if;
  end if;
  return new;
end;
$fn$;

revoke all on function public.qm_certificate_library_guard() from public, anon;

drop trigger if exists tr_qm_certificate_library_guard on public.qm_certificate_library;
create trigger tr_qm_certificate_library_guard
  before insert on public.qm_certificate_library
  for each row execute function public.qm_certificate_library_guard();

-- ---------------------------------------------------------------------
-- 4. Rujukan pustaka pada templat kelas
-- ---------------------------------------------------------------------

alter table public.qm_certificate_templates
  add column if not exists library_id uuid
  references public.qm_certificate_library(id) on delete set null;

-- ---------------------------------------------------------------------
-- 5. Pencetus pelan templat: laluan galeri dan pustaka peribadi
--
--    Peraturan setiap lajur (background_path, logo_path):
--      gallery/<id>/... : dibenarkan hanya jika item yang dirujuk melalui
--        library_id wujud, scope gallery, diterbitkan, laluan lajur SAMA
--        dengan laluan item itu (menghalang rujukan laluan item lain),
--        dan (free_tier ATAU pelan berbayar pemilik kelas). Selain itu
--        dipaksa NULL.
--      library/<id>/... : hanya jika pelan berbayar pemilik kelas (sama
--        seperti latar sendiri).
--      laluan lain      : peraturan 0052 kekal (pelan berbayar pemilik
--        kelas; free dipaksa NULL).
--
--    Pencetus sengaja kekal "before insert or update of background_path,
--    logo_path" sahaja: ON DELETE SET NULL pada library_id TIDAK boleh
--    menyalakan semakan ini kerana memadam item galeri tidak boleh
--    merampas latar templat kelas yang sedia menggunakannya.
-- ---------------------------------------------------------------------

create or replace function public.qm_certificate_template_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner    uuid;
  v_plan     text;
  v_berbayar boolean;
  v_id       uuid;
  v_scope    text;
  v_pub      boolean;
  v_free     boolean;
  v_latar    text;
  v_logo     text;
begin
  select k.owner_id into v_owner
    from public.qm_classes k
   where k.id = new.class_id;
  select public.qm_effective_plan(v_owner) into v_plan;
  v_berbayar := v_plan is not null and v_plan in ('pro', 'institution', 'unlimited');

  -- Baca item pustaka yang dirujuk (hanya jika ada).
  if new.library_id is not null then
    select l.id, l.scope, l.published, l.free_tier, l.background_path, l.logo_path
      into v_id, v_scope, v_pub, v_free, v_latar, v_logo
      from public.qm_certificate_library l
     where l.id = new.library_id;
  end if;

  if new.background_path is not null then
    if new.background_path like 'gallery/%' then
      if v_id is null
         or v_scope is distinct from 'gallery'
         or coalesce(v_pub, false) = false
         or v_latar is distinct from new.background_path
         or (coalesce(v_free, false) = false and v_berbayar = false) then
        new.background_path := null;
      end if;
    elsif v_berbayar = false then
      new.background_path := null;
    end if;
  end if;

  if new.logo_path is not null then
    if new.logo_path like 'gallery/%' then
      if v_id is null
         or v_scope is distinct from 'gallery'
         or coalesce(v_pub, false) = false
         or v_logo is distinct from new.logo_path
         or (coalesce(v_free, false) = false and v_berbayar = false) then
        new.logo_path := null;
      end if;
    elsif v_berbayar = false then
      new.logo_path := null;
    end if;
  end if;

  return new;
end;
$fn$;

revoke all on function public.qm_certificate_template_plan_guard() from public, anon;

-- ---------------------------------------------------------------------
-- 6. Semakan rujukan aset: benar jika mana-mana templat kelas atau item
--    pustaka masih merujuk laluan itu. Dipakai sebelum memadam objek
--    storan kerana fail kini dikongsi antara templat.
-- ---------------------------------------------------------------------

create or replace function public.qm_certificate_asset_in_use(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.qm_certificate_templates t
     where p_path is not null
       and (t.background_path = p_path or t.logo_path = p_path)
  ) or exists (
    select 1 from public.qm_certificate_library l
     where p_path is not null
       and (l.background_path = p_path or l.logo_path = p_path)
  );
$fn$;

revoke all on function public.qm_certificate_asset_in_use(text) from public, anon;
grant execute on function public.qm_certificate_asset_in_use(text) to service_role;

-- kzsec V2-016a S3 (CTO): ruang nama laluan storan mesti sepadan dengan skop.
alter table public.qm_certificate_library
  add constraint qm_certificate_library_ruang_nama_chk check (
    (scope = 'gallery'
      and (background_path is null or background_path like 'gallery/%')
      and (logo_path is null or logo_path like 'gallery/%'))
    or
    (scope = 'personal'
      and (background_path is null or background_path like 'library/' || owner_id::text || '/%')
      and (logo_path is null or logo_path like 'library/' || owner_id::text || '/%'))
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
