-- KZ-B (24 Nov 2026): tetapan lalai sijil setiap pendidik.
--
-- Satu baris bagi setiap pendidik: aset (latar, logo, tandatangan),
-- penandatangan, layout dan templat e-mel sijil. Templat baharu mewarisi
-- nilai ini; apply_defaults_to_template menyalinnya ke templat sedia ada.
--
-- Aset lalai disimpan dalam bucket certificate-assets di bawah
-- defaults/<educator_id>/ dan dirujuk (bukan disalin) oleh templat, jadi
-- qm_certificate_asset_in_use kini turut menyemak jadual ini supaya objek
-- yang masih dirujuk tidak dipadam.
--
-- Idempoten. Mesej ralat dalam English (sampai ke skrin pengguna).

create table if not exists public.qm_certificate_defaults (
  educator_id     uuid primary key references public.qm_profiles(id) on delete cascade,
  background_path text,
  logo_path       text,
  signature_path  text,
  signer_name     text check (signer_name is null or char_length(signer_name) between 1 and 100),
  signer_title    text check (signer_title is null or char_length(signer_title) between 1 and 120),
  layout          jsonb not null default '{}'::jsonb check (jsonb_typeof(layout) = 'object'),
  email_template  jsonb not null default '{}'::jsonb check (jsonb_typeof(email_template) = 'object'),
  updated_at      timestamptz not null default now(),
  -- Laluan aset lalai mesti dalam ruang nama pendidik itu sendiri.
  constraint qm_certificate_defaults_ruang_nama_chk check (
        (background_path is null or background_path like 'defaults/' || educator_id::text || '/%')
    and (logo_path is null or logo_path like 'defaults/' || educator_id::text || '/%')
    and (signature_path is null or signature_path like 'defaults/' || educator_id::text || '/%')
  ),
  constraint qm_certificate_defaults_saiz_chk check (
    octet_length(layout::text) <= 8192 and octet_length(email_template::text) <= 16384
  )
);
alter table public.qm_certificate_defaults enable row level security;

drop policy if exists p_cert_defaults_own_read on public.qm_certificate_defaults;
create policy p_cert_defaults_own_read on public.qm_certificate_defaults
  for select to authenticated
  using (educator_id = auth.uid());

drop policy if exists p_cert_defaults_own_insert on public.qm_certificate_defaults;
create policy p_cert_defaults_own_insert on public.qm_certificate_defaults
  for insert to authenticated
  with check (educator_id = auth.uid());

drop policy if exists p_cert_defaults_own_update on public.qm_certificate_defaults;
create policy p_cert_defaults_own_update on public.qm_certificate_defaults
  for update to authenticated
  using (educator_id = auth.uid())
  with check (educator_id = auth.uid());

revoke all on public.qm_certificate_defaults from anon, authenticated;
grant select, insert, update on public.qm_certificate_defaults to authenticated;

-- Semakan rujukan aset: salinan 0054 ditambah jadual tetapan lalai.
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
  ) or exists (
    select 1 from public.qm_certificate_defaults d
     where p_path is not null
       and (d.background_path = p_path or d.logo_path = p_path
            or d.signature_path = p_path)
  );
$fn$;

revoke all on function public.qm_certificate_asset_in_use(text) from public, anon;
grant execute on function public.qm_certificate_asset_in_use(text) to service_role;

notify pgrst, 'reload schema';
