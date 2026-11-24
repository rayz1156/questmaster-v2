-- KZ-C (24 Nov 2026): baris gilir e-mel sijil.
--
-- Masalah: email_certificates menghantar 3 serentak dalam satu gelung dan
-- Emailit mengehadkan 2 mesej sesaat; satu daripada 6 gagal dengan
-- "452 4.4.5 Messages per second limit exceeded (2/2)" tanpa cubaan semula.
--
-- Penyelesaian: setiap sijil dimasukkan ke qm_certificate_email_queue dan
-- satu pekerja dalam proses pelayan menghantar paling banyak
-- EMAIL_MAX_PER_SECOND (lalai 1) e-mel sesaat, dengan cubaan semula backoff
-- untuk ralat sementara (SMTP 4xx, HTTP 429/5xx) dan gagal serta-merta
-- untuk ralat kekal (SMTP 5xx).
--
-- Idempotensi: kunci unik per sijil per penghantaran (idempotency_key), dan
-- paling banyak satu baris aktif (queued/sending/retrying) bagi setiap
-- sijil, jadi panggilan berulang dan pekerja yang dimulakan semula tidak
-- menghasilkan e-mel pendua.
--
-- Idempoten. Mesej ralat dalam English.

create table if not exists public.qm_certificate_email_queue (
  id               uuid primary key default gen_random_uuid(),
  certificate_id   uuid not null references public.qm_certificates(id) on delete cascade,
  class_id         uuid not null references public.qm_classes(id) on delete cascade,
  requested_by     uuid references public.qm_profiles(id) on delete set null,
  idempotency_key  text not null unique,
  status           text not null default 'queued'
                   check (status in ('queued', 'sending', 'sent', 'retrying', 'failed', 'cancelled')),
  attempts         int not null default 0,
  last_error       text,
  next_attempt_at  timestamptz not null default now(),
  locked_at        timestamptz,
  sent_at          timestamptz,
  had_attachment   boolean,
  subject_override text check (subject_override is null or char_length(subject_override) <= 200),
  body_override    text check (body_override is null or char_length(body_override) <= 8000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.qm_certificate_email_queue enable row level security;

create unique index if not exists qm_cert_email_queue_satu_aktif
  on public.qm_certificate_email_queue (certificate_id)
  where status in ('queued', 'sending', 'retrying');
create index if not exists qm_cert_email_queue_sedia
  on public.qm_certificate_email_queue (next_attempt_at)
  where status in ('queued', 'retrying');
create index if not exists qm_cert_email_queue_kelas
  on public.qm_certificate_email_queue (class_id, created_at desc);

-- Pendidik kelas boleh membaca status; semua tulisan oleh pelayan (service role).
drop policy if exists p_cert_email_queue_read on public.qm_certificate_email_queue;
create policy p_cert_email_queue_read on public.qm_certificate_email_queue
  for select to authenticated
  using (public.qm_certificate_is_educator(class_id));
revoke all on public.qm_certificate_email_queue from anon, authenticated;
grant select on public.qm_certificate_email_queue to authenticated;

-- Ambil kerja untuk pekerja: baris sedia dikunci dengan SKIP LOCKED supaya
-- dua pekerja tidak mengambil baris yang sama. Baris 'sending' yang
-- tertinggal lebih 10 minit (pekerja mati di tengah jalan) dipulangkan
-- semula sebagai 'retrying'. Pelayan sahaja.
create or replace function public.qm_claim_certificate_emails(p_limit int default 5)
returns setof public.qm_certificate_email_queue
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.qm_certificate_email_queue q
     set status = 'retrying',
         locked_at = null,
         last_error = coalesce(q.last_error, 'Worker stopped while sending; retried.'),
         updated_at = now()
   where q.status = 'sending'
     and q.locked_at < now() - interval '10 minutes';

  return query
  update public.qm_certificate_email_queue q
     set status = 'sending',
         locked_at = now(),
         attempts = q.attempts + 1,
         updated_at = now()
   where q.id in (
     select q2.id
       from public.qm_certificate_email_queue q2
      where q2.status in ('queued', 'retrying')
        and q2.next_attempt_at <= now()
      order by q2.next_attempt_at, q2.created_at
      limit greatest(1, least(coalesce(p_limit, 5), 50))
      for update skip locked
   )
  returning q.*;
end;
$fn$;

revoke all on function public.qm_claim_certificate_emails(int) from public, anon, authenticated;
grant execute on function public.qm_claim_certificate_emails(int) to service_role;

-- Tanda berjaya dalam SATU transaksi: baris gilir 'sent' dan emailed_at
-- sijil, supaya kegagalan separa tidak menyebabkan penghantaran berganda
-- (baris tertinggal 'sending' dipulihkan, atau sijil tanpa emailed_at
-- dipilih semula oleh "Email all unsent"). Pelayan sahaja.
create or replace function public.qm_mark_certificate_email_sent(p_queue uuid, p_had_attachment boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cert uuid;
begin
  update public.qm_certificate_email_queue q
     set status = 'sent',
         sent_at = now(),
         had_attachment = p_had_attachment,
         last_error = null,
         locked_at = null,
         updated_at = now()
   where q.id = p_queue
  returning q.certificate_id into v_cert;
  if v_cert is null then
    raise exception 'Queue row not found.';
  end if;
  update public.qm_certificates c
     set emailed_at = now()
   where c.id = v_cert
     and c.revoked_at is null;
end;
$fn$;

revoke all on function public.qm_mark_certificate_email_sent(uuid, boolean) from public, anon, authenticated;
grant execute on function public.qm_mark_certificate_email_sent(uuid, boolean) to service_role;

notify pgrst, 'reload schema';
