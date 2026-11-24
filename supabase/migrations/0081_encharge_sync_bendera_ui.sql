-- KZ-D (24 Nov 2026): Send to Encharge melalui connector, rekod per peserta,
-- dan bendera UI pendidik.
--
-- 1. qm_encharge_sync_log: satu baris bagi setiap (pemilik akaun, kelas,
--    e-mel). Peserta yang sudah 'sent' untuk kelas yang sama tidak dihantar
--    lagi kecuali force_resync. Ditulis oleh pelayan (service role) sahaja.
-- 2. Isi semula daripada qm_email_sync_log (butang UI lama, agregat sahaja):
--    hanya eksport yang JELAS lengkap (failed = 0, sent > 0 dan sent sama
--    dengan bilangan ahli ber-e-mel yang menyertai sebelum eksport itu)
--    dipetakan kepada baris per peserta dengan source = 'backfill'.
--    Eksport lain tidak dapat dipetakan dengan pasti dan dilaporkan oleh
--    fungsi qm_encharge_backfill_report.
-- 3. qm_profiles.ui_hide_encharge dan ui_hide_certificates: UI sahaja
--    disembunyikan; laluan API dan alat connector terus berfungsi.
--
-- Idempoten. Mesej ralat dalam English.

-- ---------------------------------------------------------------------
-- 1. Log per peserta
-- ---------------------------------------------------------------------
create table if not exists public.qm_encharge_sync_log (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.qm_profiles(id) on delete cascade,
  class_id             uuid not null references public.qm_classes(id) on delete cascade,
  participant_id       uuid references public.qm_profiles(id) on delete set null,
  email                text not null check (email = lower(btrim(email)) and email <> ''),
  tags                 text[] not null default '{}',
  status               text not null check (status in ('sent', 'skipped', 'failed')),
  encharge_response    jsonb not null default '{}'::jsonb,
  consent_confirmed_by uuid references public.qm_profiles(id) on delete set null,
  source               text not null default 'mcp' check (source in ('mcp', 'ui', 'backfill')),
  synced_at            timestamptz not null default now(),
  constraint qm_encharge_sync_log_unik unique (owner_id, class_id, email)
);
create index if not exists qm_encharge_sync_log_kelas_idx
  on public.qm_encharge_sync_log (class_id, status);
alter table public.qm_encharge_sync_log enable row level security;

drop policy if exists p_encharge_sync_log_read on public.qm_encharge_sync_log;
create policy p_encharge_sync_log_read on public.qm_encharge_sync_log
  for select to authenticated
  -- Hanya pemilik log (akaun Encharge) dan pentadbir, selaras qm_email_sync_log.
  using (owner_id = auth.uid() or public.qm_is_admin());
revoke all on public.qm_encharge_sync_log from anon, authenticated;
grant select on public.qm_encharge_sync_log to authenticated;

-- ---------------------------------------------------------------------
-- 2. Isi semula daripada eksport butang UI yang lengkap
-- ---------------------------------------------------------------------
create or replace function public.qm_encharge_backfill_from_ui_logs()
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_n int;
begin
  with eksport as (
    select l.id, l.owner_id, l.class_id, l.sent, l.created_at
      from public.qm_email_sync_log l
     where l.provider = 'encharge'
       and l.consent_confirmed = true
       and coalesce(l.failed, 0) = 0
       and coalesce(l.sent, 0) > 0
  ),
  calon as (
    select e.id as log_id, e.owner_id, e.class_id, e.created_at, e.sent,
           m.user_id, lower(btrim(u.email::text)) as email, k.name as nama_kelas
      from eksport e
      join public.qm_classes k on k.id = e.class_id
      join public.qm_class_members m on m.class_id = e.class_id
      join auth.users u on u.id = m.user_id
     where m.joined_at <= e.created_at
       and u.email is not null
       and not exists (
         select 1 from public.qm_class_educators ce
          where ce.class_id = e.class_id and ce.educator_id = m.user_id
       )
  ),
  padan as (
    -- Hanya eksport yang bilangan calon sama dengan sent (pemetaan pasti).
    select c.*
      from calon c
      join (select log_id, count(*) as n from calon group by log_id) j on j.log_id = c.log_id
     where j.n = c.sent
  )
  insert into public.qm_encharge_sync_log
    (owner_id, class_id, participant_id, email, tags, status, encharge_response, consent_confirmed_by, source, synced_at)
  select distinct on (p.owner_id, p.class_id, p.email)
         p.owner_id, p.class_id, p.user_id, p.email,
         -- Sama dengan classTags() dalam src/lib/email-providers/index.ts.
         case
           when trim(both '-' from regexp_replace(lower(p.nama_kelas), '[^a-z0-9]+', '-', 'g')) = '' then array['kuizen']
           else array['kuizen', left(regexp_replace('kuizen-' ||
             left(trim(both '-' from regexp_replace(lower(p.nama_kelas), '[^a-z0-9]+', '-', 'g')), 60),
             '-+$', ''), 40)]
         end,
         'sent',
         jsonb_build_object('note', 'Backfilled from UI export log', 'export_log_id', p.log_id),
         p.owner_id, 'backfill', p.created_at
    from padan p
   order by p.owner_id, p.class_id, p.email, p.created_at desc
  on conflict (owner_id, class_id, email) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;
revoke all on function public.qm_encharge_backfill_from_ui_logs() from public, anon, authenticated;
grant execute on function public.qm_encharge_backfill_from_ui_logs() to service_role;

select public.qm_encharge_backfill_from_ui_logs() as backfilled_rows;

-- Laporan eksport UI yang TIDAK dapat dipetakan (untuk pendidik/admin).
create or replace function public.qm_encharge_backfill_report()
returns table (export_log_id uuid, class_id uuid, created_at timestamptz, sent int, failed int, reason text)
language sql
stable
security definer
set search_path = public
as $fn$
  select l.id, l.class_id, l.created_at, l.sent, l.failed,
         case
           when coalesce(l.failed, 0) > 0 then 'Export had failures; per-contact result unknown.'
           when coalesce(l.sent, 0) = 0 then 'Nothing was sent.'
           else 'Member count at export time does not match sent count.'
         end
    from public.qm_email_sync_log l
   where l.provider = 'encharge'
     and (l.owner_id = auth.uid() or public.qm_is_admin())
     and not exists (
       select 1 from public.qm_encharge_sync_log s
        where s.source = 'backfill' and s.encharge_response->>'export_log_id' = l.id::text
     );
$fn$;
revoke all on function public.qm_encharge_backfill_report() from public, anon;
grant execute on function public.qm_encharge_backfill_report() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Bendera UI pendidik
-- ---------------------------------------------------------------------
alter table public.qm_profiles
  add column if not exists ui_hide_encharge boolean not null default false;
alter table public.qm_profiles
  add column if not exists ui_hide_certificates boolean not null default false;

notify pgrst, 'reload schema';
