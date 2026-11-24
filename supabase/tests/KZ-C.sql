-- KZ-C.sql: ujian penerimaan baris gilir e-mel sijil (migrasi 0080).
-- Jalankan dengan 0080 DI DALAM transaksi fail ini:
--   { echo 'begin;'; cat 0080_baris_gilir_emel_sijil.sql; sed '1,/^begin;$/d' KZ-C.sql; } | psql -v ON_ERROR_STOP=1
-- Berakhir dengan rollback. "KZ-C: SEMUA UJIAN LULUS" bermakna semua lulus.

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000c00e1', 'kzc-pensyarah@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000c00e2', 'kzc-luar@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000c00a1', 'kzc-p1@ujian.invalid',        'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000c00a2', 'kzc-p2@ujian.invalid',        'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000c00e1', 'educator',    'Pensyarah KZ-C', 'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000c00e2', 'educator',    'Luar KZ-C',      'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000c00a1', 'participant', 'Peserta Satu',   'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000c00a2', 'participant', 'Peserta Dua',    'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000c0c01', '00000000-0000-0000-0000-0000000c00e1', 'Kelas Ujian KZ-C');
insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-0000000c0c01', '00000000-0000-0000-0000-0000000c00a1'),
  ('00000000-0000-0000-0000-0000000c0c01', '00000000-0000-0000-0000-0000000c00a2');
insert into public.qm_certificate_templates (id, class_id, title, criteria, created_by) values
  ('00000000-0000-0000-0000-0000000c0701', '00000000-0000-0000-0000-0000000c0c01', 'Templat KZ-C',
   '{"type":"all_members"}'::jsonb, '00000000-0000-0000-0000-0000000c00e1');
insert into public.qm_certificates (id, template_id, class_id, participant_id, name_snapshot, program_snapshot, code, issued_by) values
  ('00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0701', '00000000-0000-0000-0000-0000000c0c01',
   '00000000-0000-0000-0000-0000000c00a1', 'Peserta Satu', 'Kelas Ujian KZ-C', 'KZCUJIA', '00000000-0000-0000-0000-0000000c00e1'),
  ('00000000-0000-0000-0000-0000000c0e02', '00000000-0000-0000-0000-0000000c0701', '00000000-0000-0000-0000-0000000c0c01',
   '00000000-0000-0000-0000-0000000c00a2', 'Peserta Dua', 'Kelas Ujian KZ-C', 'KZCUJIB', '00000000-0000-0000-0000-0000000c00e1');

-- Ujian 1: satu baris aktif sahaja bagi setiap sijil (idempotensi).
insert into public.qm_certificate_email_queue (certificate_id, class_id, requested_by, idempotency_key)
values ('00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0c01',
        '00000000-0000-0000-0000-0000000c00e1', 'kzc:1:a');
do $u$
begin
  begin
    insert into public.qm_certificate_email_queue (certificate_id, class_id, idempotency_key)
    values ('00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0c01', 'kzc:1:b');
    raise exception 'UJIAN 1 GAGAL: baris aktif kedua diterima';
  exception when unique_violation then null;
  end;
  begin
    insert into public.qm_certificate_email_queue (certificate_id, class_id, idempotency_key)
    values ('00000000-0000-0000-0000-0000000c0e02', '00000000-0000-0000-0000-0000000c0c01', 'kzc:1:a');
    raise exception 'UJIAN 1 GAGAL: kunci idempotensi berulang diterima';
  exception when unique_violation then null;
  end;
end $u$;

insert into public.qm_certificate_email_queue (certificate_id, class_id, idempotency_key, next_attempt_at)
values ('00000000-0000-0000-0000-0000000c0e02', '00000000-0000-0000-0000-0000000c0c01', 'kzc:2:a', now() + interval '1 hour');

-- Ujian 2: claim mengambil baris sedia sahaja, menanda sending, attempts+1.
do $u$
declare r record; n int := 0;
begin
  for r in select * from public.qm_claim_certificate_emails(10) loop
    n := n + 1;
    if r.certificate_id <> '00000000-0000-0000-0000-0000000c0e01' or r.status <> 'sending' or r.attempts <> 1 then
      raise exception 'UJIAN 2 GAGAL: %', row_to_json(r);
    end if;
  end loop;
  if n <> 1 then raise exception 'UJIAN 2 GAGAL: bilangan %', n; end if;
  -- Claim kedua tidak mengambil baris yang sama lagi.
  select count(*) into n from public.qm_claim_certificate_emails(10);
  if n <> 0 then raise exception 'UJIAN 2 GAGAL: diambil semula %', n; end if;
end $u$;

-- Ujian 3: baris 'sending' yang tertinggal > 10 minit dipulihkan dan diambil semula.
update public.qm_certificate_email_queue set locked_at = now() - interval '11 minutes'
 where idempotency_key = 'kzc:1:a';
do $u$
declare r record;
begin
  select * into r from public.qm_claim_certificate_emails(10);
  if r.idempotency_key <> 'kzc:1:a' or r.attempts <> 2 or r.status <> 'sending' then
    raise exception 'UJIAN 3 GAGAL: %', row_to_json(r);
  end if;
end $u$;

-- Ujian 4: qm_mark_certificate_email_sent menanda baris dan emailed_at bersama;
-- selepas 'sent', baris aktif baharu untuk sijil itu dibenarkan (resend).
do $u$
declare v_id uuid; v_status text; v_lampiran boolean; v_emel timestamptz;
begin
  select id into v_id from public.qm_certificate_email_queue where idempotency_key = 'kzc:1:a';
  perform public.qm_mark_certificate_email_sent(v_id, false);
  select status, had_attachment into v_status, v_lampiran from public.qm_certificate_email_queue where id = v_id;
  select emailed_at into v_emel from public.qm_certificates where id = '00000000-0000-0000-0000-0000000c0e01';
  if v_status <> 'sent' or v_lampiran is distinct from false or v_emel is null then
    raise exception 'UJIAN 4 GAGAL: % % %', v_status, v_lampiran, v_emel;
  end if;
end $u$;
insert into public.qm_certificate_email_queue (certificate_id, class_id, idempotency_key)
values ('00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0c01', 'kzc:1:resend');

-- Ujian 5: RLS: pendidik kelas membaca, pendidik luar dan peserta tidak; tulisan ditolak.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000c00e1", "role": "authenticated"}', true);
set local role authenticated;
do $u$
declare n int;
begin
  select count(*) into n from public.qm_certificate_email_queue;
  if n <> 3 then raise exception 'UJIAN 5 GAGAL (pendidik): %', n; end if;
  begin
    update public.qm_certificate_email_queue set status = 'sent';
    raise exception 'UJIAN 5 GAGAL: kemas kini dibenarkan';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.qm_claim_certificate_emails(1);
    raise exception 'UJIAN 5 GAGAL: claim dibenarkan untuk authenticated';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.qm_mark_certificate_email_sent(gen_random_uuid(), true);
    raise exception 'UJIAN 5 GAGAL: mark dibenarkan untuk authenticated';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000c00e2", "role": "authenticated"}', true);
  select count(*) into n from public.qm_certificate_email_queue;
  if n <> 0 then raise exception 'UJIAN 5 GAGAL (luar): %', n; end if;
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000c00a1", "role": "authenticated"}', true);
  select count(*) into n from public.qm_certificate_email_queue;
  if n <> 0 then raise exception 'UJIAN 5 GAGAL (peserta): %', n; end if;
end $u$;

reset role;
select 'KZ-C: SEMUA UJIAN LULUS' as keputusan;

rollback;
