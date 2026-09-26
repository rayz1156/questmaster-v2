-- 0036_integrasi_emel.sql
--
-- Integrasi penyedia e-mel (Encharge) untuk pendidik Pro.
--
-- qm_email_integrations menyimpan kunci API penyedia yang DISULIT
-- (AES-256-GCM oleh laluan API, guna MCP_ENCRYPTION_KEY). Jadual ini
-- sengaja TIADA polisi RLS untuk anon/authenticated dan semua keistimewaan
-- dicabut daripada mereka: klien tidak boleh membaca, menulis atau menukar
-- kunci secara terus walaupun RLS dilumpuhkan secara tidak sengaja. Semua
-- akses melalui laluan API yang mengesahkan pemanggil dahulu.
--
-- qm_email_sync_log merekod setiap eksport. Ia menjadi asas had kadar
-- 60 saat per kelas dan paparan "last sync" pada profil.
--
-- Mengikut peraturan pasukan: fail migrasi tidak mengandungi COMMIT atau
-- BEGIN. Setiap pernyataan di sini idempoten supaya tampalan berulang
-- tidak berbahaya.

-- ---------------------------------------------------------------------
-- 1. Jadual integrasi (satu baris setiap pendidik, pk owner_id)
-- ---------------------------------------------------------------------
create table if not exists public.qm_email_integrations (
  owner_id     uuid primary key references public.qm_profiles(id) on delete cascade,
  provider     text not null check (provider in ('encharge')),
  secret_enc   text not null,
  secret_hint  text not null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  updated_at   timestamptz not null default now()
);

comment on table public.qm_email_integrations is
  'Kunci API penyedia e-mel, disulit; hanya service role boleh capai.';

-- ---------------------------------------------------------------------
-- 2. Jadual log eksport
-- ---------------------------------------------------------------------
create table if not exists public.qm_email_sync_log (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.qm_profiles(id) on delete cascade,
  class_id          uuid not null references public.qm_classes(id) on delete cascade,
  provider          text not null,
  total             integer,
  sent              integer,
  skipped           integer,
  failed            integer,
  consent_confirmed boolean not null,
  created_at        timestamptz default now()
);

create index if not exists qm_email_sync_log_class_created_idx
  on public.qm_email_sync_log (class_id, created_at desc);

comment on table public.qm_email_sync_log is
  'Satu baris setiap eksport e-mel; asas had kadar 60 saat per kelas.';

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table public.qm_email_integrations enable row level security;
alter table public.qm_email_sync_log enable row level security;

-- qm_email_integrations: TIADA polisi. Dengan RLS hidup dan tiada polisi,
-- semua peranan selain bypass (service role) ditolak. REVOKE menutup
-- laluan istimewa juga.
revoke all on public.qm_email_integrations from anon, authenticated;

-- qm_email_sync_log: pemilik boleh membaca lognya sendiri sahaja.
-- Tiada polisi insert/update/delete: baris hanya ditulis oleh service role.
drop policy if exists p_qm_email_sync_log_owner_read on public.qm_email_sync_log;
create policy p_qm_email_sync_log_owner_read on public.qm_email_sync_log
  for select using (owner_id = auth.uid());

grant select on public.qm_email_sync_log to authenticated;
revoke insert, update, delete on public.qm_email_sync_log from anon, authenticated;

-- Service role (laluan API sahaja) memerlukan capaian penuh.
grant all on public.qm_email_integrations to service_role;
grant all on public.qm_email_sync_log to service_role;

notify pgrst, 'reload schema';
