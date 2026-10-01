-- 0054_medan_sijil.sql
--
-- V2-016b: medan isian sijil (kursus, tarikh, tempat, penandatangan,
-- imej tandatangan) pada templat KELAS.
--   1. Lajur `fields` (jsonb objek, maksimum 4096 bait teks): nilai teks
--      yang educator isi sekali setiap templat kelas dan dicetak pada
--      setiap sijil. Dibenarkan untuk SEMUA pelan (ia teks, bukan aset).
--   2. Lajur `signature_path` (text): imej tandatangan PNG/JPEG dalam
--      bucket certificate-assets, dilayan seperti logo_path oleh
--      pencetus pelan (dipaksa NULL untuk pemilik kelas Percuma).
--   3. `qm_certificate_asset_in_use` turut menyemak signature_path
--      supaya imej yang masih digunakan tidak dipadam.
--   4. Had saiz bucket `certificates` dinaikkan kepada 15 MB: pdf-lib
--      memampatkan semula PNG, jadi latar PNG kira-kira 3.5 MB ke atas
--      menghasilkan PDF melebihi 5 MB lama dan preview/pengeluaran gagal
--      dengan "The object exceeded the maximum allowed size" (CTO,
--      1 Okt 2026).
--
-- Semua mesej ralat sampai ke skrin pengguna: Bahasa Inggeris.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Lajur baharu pada templat kelas
-- ---------------------------------------------------------------------

alter table public.qm_certificate_templates
  add column if not exists fields jsonb not null default '{}'::jsonb;

alter table public.qm_certificate_templates
  add column if not exists signature_path text;

-- CHECK: fields mesti objek jsonb dan tidak melebihi 4096 bait teks.
-- Idempoten melalui pg_constraint kerana ADD CONSTRAINT tiada IF NOT EXISTS.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.qm_certificate_templates'::regclass
       and conname = 'qm_cert_tpl_fields_objek_chk'
  ) then
    alter table public.qm_certificate_templates
      add constraint qm_cert_tpl_fields_objek_chk
      check (jsonb_typeof(fields) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.qm_certificate_templates'::regclass
       and conname = 'qm_cert_tpl_fields_saiz_chk'
  ) then
    alter table public.qm_certificate_templates
      add constraint qm_cert_tpl_fields_saiz_chk
      check (octet_length(fields::text) <= 4096);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Pencetus pelan: signature_path dilayan seperti logo_path.
--    Nilai teks fields dibenarkan untuk SEMUA pelan.
--    Corak 0053 dikekalkan; hanya blok signature_path ditambah.
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

  -- Imej tandatangan sentiasa dalam ruang nama kelas sendiri (tiada
  -- varian gallery/ atau library/), jadi cukup semakan pelan berbayar
  -- pemilik kelas, sama seperti latar/logo sendiri (0052).
  if new.signature_path is not null and v_berbayar = false then
    new.signature_path := null;
  end if;

  return new;
end;
$fn$;

revoke all on function public.qm_certificate_template_plan_guard() from public, anon;

-- Pencetus mesti menyala pada tulisan signature_path juga.
drop trigger if exists tr_qm_cert_template_plan on public.qm_certificate_templates;
create trigger tr_qm_cert_template_plan
  before insert or update of background_path, logo_path, signature_path
  on public.qm_certificate_templates
  for each row execute function public.qm_certificate_template_plan_guard();

-- ---------------------------------------------------------------------
-- 3. Semakan rujukan aset: signature_path templat turut dikira.
--    (Item pustaka tiada imej tandatangan; fields ialah teks.)
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
       and (t.background_path = p_path or t.logo_path = p_path
            or t.signature_path = p_path)
  ) or exists (
    select 1 from public.qm_certificate_library l
     where p_path is not null
       and (l.background_path = p_path or l.logo_path = p_path)
  );
$fn$;

revoke all on function public.qm_certificate_asset_in_use(text) from public, anon;
grant execute on function public.qm_certificate_asset_in_use(text) to service_role;

-- ---------------------------------------------------------------------
-- 4. Bucket certificates: 15 MB supaya latar PNG besar tidak melepasi
--    had selepas pdf-lib memampatkan semula imej.
-- ---------------------------------------------------------------------

update storage.buckets
   set file_size_limit = 15728640
 where id = 'certificates';

NOTIFY pgrst, 'reload schema';

COMMIT;
