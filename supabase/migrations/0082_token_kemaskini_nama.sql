-- KZ-E (Fasa 2, 24 Nov 2026): peserta mengesahkan nama penuh sendiri melalui
-- pautan bertoken dalam e-mel, kemudian sijil dijana semula dan dihantar
-- secara automatik.
--
-- 1. qm_name_update_tokens: token rawak disimpan sebagai hash SHA-256 sahaja,
--    satu token aktif bagi setiap (peserta, kelas), sekali guna, tamat 30 hari.
-- 2. qm_profiles.certificate_name_source menerima 'participant_link';
--    qm_certificate_name_log menerima sumber itu dan hash IP.
-- 3. Baris gilir e-mel menyokong e-mel tanpa sijil (permintaan nama sebelum
--    sijil dikeluarkan) dan pautan nama yang dicipta semasa menghantar.
-- 4. qm_confirm_name_token: satu transaksi untuk profil, sijil, log dan token.
-- 5. qm_issue_certificate_for_token: keluarkan sijil selepas pengesahan
--    (purpose before_issue) atas nama pendidik yang mencipta token.
--
-- Fungsi 4 dan 5 untuk service role sahaja (halaman awam tanpa log masuk
-- memanggilnya melalui laluan pelayan selepas token disahkan).
-- Idempoten. Mesej ralat dalam English.

-- ---------------------------------------------------------------------
-- 1. Token
-- ---------------------------------------------------------------------
create table if not exists public.qm_name_update_tokens (
  id               uuid primary key default gen_random_uuid(),
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  participant_id   uuid not null references public.qm_profiles(id) on delete cascade,
  class_id         uuid not null references public.qm_classes(id) on delete cascade,
  certificate_id   uuid references public.qm_certificates(id) on delete set null,
  template_id      uuid references public.qm_certificate_templates(id) on delete set null,
  purpose          text not null check (purpose in ('after_issue', 'before_issue')),
  status           text not null default 'pending' check (status in ('pending', 'used', 'expired', 'revoked')),
  expires_at       timestamptz not null default now() + interval '30 days',
  used_at          timestamptz,
  old_name         text,
  new_name         text,
  failed_attempts  int not null default 0,
  created_by       uuid references public.qm_profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create unique index if not exists qm_name_update_tokens_satu_aktif
  on public.qm_name_update_tokens (participant_id, class_id)
  where status = 'pending';
create index if not exists qm_name_update_tokens_kelas
  on public.qm_name_update_tokens (class_id, created_at desc);
alter table public.qm_name_update_tokens enable row level security;

-- Pendidik kelas membaca status (token_hash tidak boleh dibalikkan).
drop policy if exists p_name_tokens_read on public.qm_name_update_tokens;
create policy p_name_tokens_read on public.qm_name_update_tokens
  for select to authenticated
  using (public.qm_certificate_is_educator(class_id));
revoke all on public.qm_name_update_tokens from anon, authenticated;
grant select (id, participant_id, class_id, certificate_id, template_id, purpose, status,
              expires_at, used_at, old_name, new_name, failed_attempts, created_by, created_at)
  on public.qm_name_update_tokens to authenticated;

-- ---------------------------------------------------------------------
-- 2. Sumber nama dan log
-- ---------------------------------------------------------------------
alter table public.qm_profiles drop constraint if exists qm_profiles_cert_name_source_chk;
alter table public.qm_profiles
  add constraint qm_profiles_cert_name_source_chk
  check (certificate_name_source is null or certificate_name_source in ('participant', 'educator', 'participant_link'));

alter table public.qm_certificate_name_log add column if not exists ip_hash text;
alter table public.qm_certificate_name_log add column if not exists token_id uuid;

-- ---------------------------------------------------------------------
-- 3. Baris gilir e-mel: e-mel tanpa sijil dan pautan nama
-- ---------------------------------------------------------------------
alter table public.qm_certificate_email_queue alter column certificate_id drop not null;
alter table public.qm_certificate_email_queue add column if not exists participant_id uuid
  references public.qm_profiles(id) on delete cascade;
alter table public.qm_certificate_email_queue add column if not exists template_id uuid
  references public.qm_certificate_templates(id) on delete set null;
alter table public.qm_certificate_email_queue add column if not exists kind text not null default 'certificate';
alter table public.qm_certificate_email_queue add column if not exists name_link_purpose text;
alter table public.qm_certificate_email_queue add column if not exists name_link_days int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qm_cert_email_queue_kind_chk') then
    alter table public.qm_certificate_email_queue
      add constraint qm_cert_email_queue_kind_chk check (
        kind in ('certificate', 'name_updated', 'name_request')
        and (name_link_purpose is null or name_link_purpose in ('after_issue', 'before_issue'))
        and (name_link_days is null or name_link_days between 1 and 90)
        and (certificate_id is not null or (kind = 'name_request' and participant_id is not null))
      );
  end if;
end$$;

create unique index if not exists qm_cert_email_queue_satu_aktif_nama
  on public.qm_certificate_email_queue (participant_id, class_id)
  where certificate_id is null and status in ('queued', 'sending', 'retrying');

-- ---------------------------------------------------------------------
-- 4. Pengesahan nama oleh peserta (satu transaksi)
-- ---------------------------------------------------------------------
create or replace function public.qm_confirm_name_token(
  p_token_hash text,
  p_name       text,
  p_ip_hash    text default null
)
returns table (
  token_id        uuid,
  participant_id  uuid,
  class_id        uuid,
  purpose         text,
  template_id     uuid,
  created_by      uuid,
  old_name        text,
  new_name        text,
  certificate_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  t      public.qm_name_update_tokens%rowtype;
  v_name text;
  v_old  text;
  v_ids  uuid[];
begin
  select * into t from public.qm_name_update_tokens q
   where q.token_hash = p_token_hash
   for update;
  if not found then
    raise exception 'TOKEN_NOT_FOUND';
  end if;
  if t.status = 'pending' and t.expires_at <= now() then
    update public.qm_name_update_tokens q set status = 'expired' where q.id = t.id;
    raise exception 'TOKEN_EXPIRED';
  end if;
  if t.status <> 'pending' then
    raise exception 'TOKEN_%', upper(t.status);
  end if;

  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if length(v_name) < 5 or length(v_name) > 120 then
    raise exception 'Name must be between 5 and 120 characters.';
  end if;

  select coalesce(n.certificate_name, p.certificate_name, nullif(btrim(p.display_name), ''))
    into v_old
    from public.qm_profiles p
    left join public.qm_class_certificate_names n
           on n.class_id = t.class_id and n.user_id = p.id
   where p.id = t.participant_id;

  update public.qm_profiles p
     set display_name = v_name,
         certificate_name = v_name,
         certificate_name_confirmed_at = now(),
         certificate_name_source = 'participant_link'
   where p.id = t.participant_id;
  -- Nama kelas yang ditetapkan pendidik tidak lagi mengatasi pengesahan peserta.
  delete from public.qm_class_certificate_names n
   where n.class_id = t.class_id and n.user_id = t.participant_id;

  with u as (
    update public.qm_certificates c
       set name_snapshot = v_name
     where c.class_id = t.class_id
       and c.participant_id = t.participant_id
       and c.revoked_at is null
    returning c.id
  )
  select coalesce(array_agg(u.id), array[]::uuid[]) into v_ids from u;

  insert into public.qm_certificate_name_log
    (class_id, user_id, scope, old_name, new_name, changed_by, source, ip_hash, token_id)
  values
    (t.class_id, t.participant_id, 'profile', v_old, v_name, t.participant_id, 'participant_link', p_ip_hash, t.id);

  update public.qm_name_update_tokens q
     set status = 'used', used_at = now(), old_name = v_old, new_name = v_name
   where q.id = t.id;

  token_id := t.id;
  participant_id := t.participant_id;
  class_id := t.class_id;
  purpose := t.purpose;
  template_id := t.template_id;
  created_by := t.created_by;
  old_name := v_old;
  new_name := v_name;
  certificate_ids := v_ids;
  return next;
end;
$fn$;
revoke all on function public.qm_confirm_name_token(text, text, text) from public, anon, authenticated;
grant execute on function public.qm_confirm_name_token(text, text, text) to service_role;

-- Kira cubaan gagal; token dibatalkan selepas 5 cubaan gagal.
create or replace function public.qm_name_token_failed_attempt(p_token_hash text)
returns int
language sql
security definer
set search_path = public
as $fn$
  update public.qm_name_update_tokens q
     set failed_attempts = q.failed_attempts + 1,
         status = case when q.failed_attempts + 1 >= 5 then 'revoked' else q.status end
   where q.token_hash = p_token_hash and q.status = 'pending'
  returning q.failed_attempts;
$fn$;
revoke all on function public.qm_name_token_failed_attempt(text) from public, anon, authenticated;
grant execute on function public.qm_name_token_failed_attempt(text) to service_role;

-- ---------------------------------------------------------------------
-- 5. Keluarkan sijil selepas pengesahan (purpose before_issue)
-- ---------------------------------------------------------------------
create or replace function public.qm_issue_certificate_for_token(p_token_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  t          public.qm_name_update_tokens%rowtype;
  v_tpl      uuid;
  v_class_nm text;
  v_title    text;
  v_fields   jsonb;
  v_prog     text;
  v_nama     text;
  v_id       uuid;
  v_code     text;
begin
  select * into t from public.qm_name_update_tokens q where q.id = p_token_id;
  if not found or t.status <> 'used' then
    raise exception 'Token is not confirmed.';
  end if;
  -- Templat token, jika tiada, templat aktif kelas.
  select tp.id into v_tpl from public.qm_certificate_templates tp
   where tp.class_id = t.class_id
     and (tp.id = t.template_id or (t.template_id is null and tp.is_active))
   order by (tp.id = t.template_id) desc
   limit 1;
  if v_tpl is null then
    raise exception 'No certificate template for this class.';
  end if;
  if not exists (
    select 1 from public.qm_class_members m where m.class_id = t.class_id and m.user_id = t.participant_id
  ) then
    raise exception 'Participant is not a member of this class.';
  end if;

  -- Sijil aktif sedia ada untuk templat ini: pulangkan sahaja (idempoten).
  select c.id into v_id from public.qm_certificates c
   where c.template_id = v_tpl and c.participant_id = t.participant_id and c.revoked_at is null;
  if v_id is not null then
    return v_id;
  end if;

  select k.name into v_class_nm from public.qm_classes k where k.id = t.class_id;
  select tp.title, tp.fields into v_title, v_fields from public.qm_certificate_templates tp where tp.id = v_tpl;
  v_prog := coalesce(nullif(btrim(v_fields->>'course'), ''), v_class_nm, v_title);
  select coalesce(p.certificate_name, nullif(btrim(p.display_name), '')) into v_nama
    from public.qm_profiles p where p.id = t.participant_id;
  v_code := public.qm_certificate_code();

  select c.id into v_id from public.qm_certificates c
   where c.template_id = v_tpl and c.participant_id = t.participant_id and c.revoked_at is not null;
  if v_id is not null then
    update public.qm_certificates
       set code = v_code, name_snapshot = v_nama, program_snapshot = v_prog,
           issued_at = now(), issued_by = t.created_by, revoked_at = null, revoked_reason = null
     where id = v_id;
  else
    insert into public.qm_certificates
      (template_id, class_id, participant_id, name_snapshot, program_snapshot, code, issued_by)
    values
      (v_tpl, t.class_id, t.participant_id, v_nama, v_prog, v_code, t.created_by)
    returning qm_certificates.id into v_id;
  end if;
  update public.qm_name_update_tokens q set certificate_id = v_id where q.id = t.id;
  return v_id;
end;
$fn$;
revoke all on function public.qm_issue_certificate_for_token(uuid) from public, anon, authenticated;
grant execute on function public.qm_issue_certificate_for_token(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 6. Tanda dihantar: sokong baris tanpa sijil (salinan 0080, semakan FOUND)
-- ---------------------------------------------------------------------
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
  if not found then
    raise exception 'Queue row not found.';
  end if;
  if v_cert is not null then
    update public.qm_certificates c
       set emailed_at = now()
     where c.id = v_cert
       and c.revoked_at is null;
  end if;
end;
$fn$;
revoke all on function public.qm_mark_certificate_email_sent(uuid, boolean) from public, anon, authenticated;
grant execute on function public.qm_mark_certificate_email_sent(uuid, boolean) to service_role;

notify pgrst, 'reload schema';
