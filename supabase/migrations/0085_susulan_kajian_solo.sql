-- 0085_susulan_kajian_solo.sql
-- KZ-UTT Fasa 4 (28 Nov 2026): pelan pengukuran, persetujuan kajian,
-- log susulan T2 dan T3, dan e-mel susulan automatik.
--
-- Empat perubahan:
--   1. qm_solo_measure_plans: satu pelan bagi setiap kuiz mod ujian
--      (kelas, masa mula Modul 1, masa tamat kursus, teks persetujuan,
--      suis e-mel). Nilai STANDARD v1 (tetingkap T2 14 hari, T3 hari 80
--      hingga 110, peringatan) TIDAK disimpan di sini: ia pemalar dalam
--      src/lib/kajian-solo.ts supaya tidak boleh diubah oleh satu kelas.
--      day_length_sec hanya untuk ujian penerimaan (tetingkap dalam minit).
--   2. qm_research_consents: keputusan persetujuan peserta bagi setiap kuiz,
--      tarik diri (tidak dieksport) dan berhenti langganan (tiada e-mel).
--   3. qm_research_followups: log setiap e-mel susulan (T2 atau T3, urutan
--      0 = jemputan, 1 dan 2 = peringatan), dengan tarikh rujukan dan
--      sumbernya. Unik (kuiz, pengguna, titik, urutan), jadi perancang yang
--      berjalan berulang kali tidak menghasilkan e-mel pendua.
--   4. Baris gilir e-mel KZ-C menerima jenis 'research_followup', supaya
--      satu pekerja dan satu had kadar (Emailit 2 mesej sesaat) dikongsi
--      oleh sijil dan susulan kajian.
--
-- RLS dihidupkan pada jadual baharu tanpa polisi: hanya pelayan (service
-- role selepas semakan requireQuizHost) membaca dan menulis.
-- Idempoten. Mesej ralat dalam English.

-- ============================================================ 1. Pelan
create table if not exists public.qm_solo_measure_plans (
  quiz_id          uuid primary key references public.qm_live_quizzes(id) on delete cascade,
  class_id         uuid not null references public.qm_classes(id) on delete cascade,
  module1_start_at timestamptz,
  course_end_at    timestamptz,
  emails_enabled   boolean not null default false,
  consent_text     text check (consent_text is null or char_length(consent_text) between 20 and 5000),
  consent_version  int not null default 1 check (consent_version >= 1),
  day_length_sec   int not null default 86400 check (day_length_sec between 60 and 86400),
  updated_by       uuid references public.qm_profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (module1_start_at is null or course_end_at is null or module1_start_at < course_end_at)
);
alter table public.qm_solo_measure_plans enable row level security;
revoke all on public.qm_solo_measure_plans from anon, authenticated;

-- ============================================================ 2. Persetujuan
create table if not exists public.qm_research_consents (
  quiz_id         uuid not null references public.qm_live_quizzes(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  decision        text not null check (decision in ('agree', 'decline')),
  consent_version int not null check (consent_version >= 1),
  decided_at      timestamptz not null default now(),
  withdrawn_at    timestamptz,
  unsubscribed_at timestamptz,
  primary key (quiz_id, user_id)
);
alter table public.qm_research_consents enable row level security;
revoke all on public.qm_research_consents from anon, authenticated;

-- ============================================================ 3. Log susulan
create table if not exists public.qm_research_followups (
  id               uuid primary key default gen_random_uuid(),
  quiz_id          uuid not null references public.qm_live_quizzes(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  class_id         uuid not null references public.qm_classes(id) on delete cascade,
  point            text not null check (point in ('T2', 'T3')),
  seq              int not null check (seq between 0 and 2),
  ref_source       text not null check (ref_source in ('course_end', 'T2', 'T1', 'join')),
  ref_at           timestamptz not null,
  due_at           timestamptz not null,
  closes_at        timestamptz not null,
  status           text not null default 'queued'
                   check (status in ('queued', 'sent', 'failed', 'cancelled')),
  cancel_reason    text,
  unsub_token_hash text unique,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (quiz_id, user_id, point, seq),
  check (due_at < closes_at)
);
create index if not exists qm_research_followups_kuiz
  on public.qm_research_followups (quiz_id, created_at desc);
alter table public.qm_research_followups enable row level security;
revoke all on public.qm_research_followups from anon, authenticated;

-- ============================================================ 4. Baris gilir
alter table public.qm_certificate_email_queue
  add column if not exists followup_id uuid references public.qm_research_followups(id) on delete cascade;

alter table public.qm_certificate_email_queue drop constraint if exists qm_cert_email_queue_kind_chk;
alter table public.qm_certificate_email_queue
  add constraint qm_cert_email_queue_kind_chk check (
    kind in ('certificate', 'name_updated', 'name_request', 'research_followup')
    and (name_link_purpose is null or name_link_purpose in ('after_issue', 'before_issue'))
    and (name_link_days is null or name_link_days between 1 and 90)
    and (
      certificate_id is not null
      or (kind = 'name_request' and participant_id is not null)
      or (kind = 'research_followup' and participant_id is not null and followup_id is not null)
    )
  );

-- Indeks "satu e-mel nama aktif bagi setiap peserta dan kelas" (0082)
-- dahulu meliputi SEMUA baris tanpa sijil. Ia disempitkan kepada
-- name_request supaya e-mel susulan kajian tidak bertembung dengannya.
drop index if exists public.qm_cert_email_queue_satu_aktif_nama;
create unique index if not exists qm_cert_email_queue_satu_aktif_nama_v2
  on public.qm_certificate_email_queue (participant_id, class_id)
  where certificate_id is null and kind = 'name_request' and status in ('queued', 'sending', 'retrying');

-- ============================================================ 5. Fungsi
-- Masukkan satu susulan dan baris gilirnya dalam satu transaksi.
-- Memulangkan id susulan, atau null jika (kuiz, pengguna, titik, urutan)
-- sudah wujud. Pelayan sahaja.
create or replace function public.qm_research_enqueue_followup(
  p_quiz       uuid,
  p_user       uuid,
  p_class      uuid,
  p_point      text,
  p_seq        int,
  p_ref_source text,
  p_ref_at     timestamptz,
  p_due_at     timestamptz,
  p_closes_at  timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  insert into public.qm_research_followups
    (quiz_id, user_id, class_id, point, seq, ref_source, ref_at, due_at, closes_at)
  values
    (p_quiz, p_user, p_class, p_point, p_seq, p_ref_source, p_ref_at, p_due_at, p_closes_at)
  on conflict (quiz_id, user_id, point, seq) do nothing
  returning qm_research_followups.id into v_id;

  if v_id is null then
    return null;
  end if;

  insert into public.qm_certificate_email_queue
    (class_id, participant_id, kind, followup_id, idempotency_key)
  values
    (p_class, p_user, 'research_followup', v_id, 'rf:' || v_id::text);

  return v_id;
end;
$fn$;
revoke all on function public.qm_research_enqueue_followup(uuid, uuid, uuid, text, int, text, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.qm_research_enqueue_followup(uuid, uuid, uuid, text, int, text, timestamptz, timestamptz, timestamptz)
  to service_role;

-- Tanda berjaya: baris gilir dan susulan dalam satu transaksi.
create or replace function public.qm_research_mark_sent(p_queue uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_f uuid;
begin
  update public.qm_certificate_email_queue q
     set status = 'sent',
         sent_at = now(),
         had_attachment = false,
         last_error = null,
         locked_at = null,
         updated_at = now()
   where q.id = p_queue
  returning q.followup_id into v_f;
  if not found then
    raise exception 'Queue row not found.';
  end if;
  update public.qm_research_followups f
     set status = 'sent', sent_at = now(), updated_at = now()
   where f.id = v_f;
end;
$fn$;
revoke all on function public.qm_research_mark_sent(uuid) from public, anon, authenticated;
grant execute on function public.qm_research_mark_sent(uuid) to service_role;

notify pgrst, 'reload schema';
