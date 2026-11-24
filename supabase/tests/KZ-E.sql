-- KZ-E.sql: ujian token kemas kini nama (migrasi 0082).
-- Jalankan dengan 0082 DI DALAM transaksi fail ini:
--   { echo 'begin;'; cat 0082_token_kemaskini_nama.sql; sed '1,/^begin;$/d' KZ-E.sql; } | psql -v ON_ERROR_STOP=1
-- Berakhir dengan rollback. "KZ-E: SEMUA UJIAN LULUS" bermakna semua lulus.

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000e00e1', 'kze-pensyarah@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000e00a1', 'kze-p1@ujian.invalid',        'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000e00a2', 'kze-p2@ujian.invalid',        'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000e00e1', 'educator',    'Pensyarah KZ-E', 'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000e00a1', 'participant', 'ujian nick',     'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000e00a2', 'participant', 'Peserta Dua',    'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-0000000e00e1', 'Kelas Ujian KZ-E');
insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-0000000e00a1'),
  ('00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-0000000e00a2');
insert into public.qm_certificate_templates (id, class_id, title, criteria, created_by) values
  ('00000000-0000-0000-0000-0000000e0701', '00000000-0000-0000-0000-0000000e0c01', 'Templat KZ-E',
   '{"type":"all_members"}'::jsonb, '00000000-0000-0000-0000-0000000e00e1');
insert into public.qm_certificates (id, template_id, class_id, participant_id, name_snapshot, program_snapshot, code, issued_by) values
  ('00000000-0000-0000-0000-0000000e0e01', '00000000-0000-0000-0000-0000000e0701', '00000000-0000-0000-0000-0000000e0c01',
   '00000000-0000-0000-0000-0000000e00a1', 'ujian nick', 'Kelas Ujian KZ-E', 'KZEUJIA', '00000000-0000-0000-0000-0000000e00e1');

-- Token: a (after_issue p1), b (before_issue p2), c (tamat tempoh, p2 kelas lain tidak perlu).
insert into public.qm_name_update_tokens (id, token_hash, participant_id, class_id, certificate_id, template_id, purpose, created_by) values
  ('00000000-0000-0000-0000-0000000e7a01', repeat('a', 64), '00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e0c01',
   '00000000-0000-0000-0000-0000000e0e01', '00000000-0000-0000-0000-0000000e0701', 'after_issue', '00000000-0000-0000-0000-0000000e00e1'),
  ('00000000-0000-0000-0000-0000000e7a02', repeat('b', 64), '00000000-0000-0000-0000-0000000e00a2', '00000000-0000-0000-0000-0000000e0c01',
   null, null, 'before_issue', '00000000-0000-0000-0000-0000000e00e1');

do $u$
declare
  r record;
  v_n int;
  v_txt text;
  v_cert uuid;
  v_cert2 uuid;
begin
  -- Ujian 1: satu token pending sahaja bagi peserta dan kelas.
  begin
    insert into public.qm_name_update_tokens (token_hash, participant_id, class_id, purpose)
    values (repeat('c', 64), '00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e0c01', 'after_issue');
    raise exception 'UJIAN 1 GAGAL: token pending kedua diterima';
  exception when unique_violation then null;
  end;

  -- Ujian 2: pengesahan after_issue mengemas kini profil, sijil, log, token.
  select * into r from public.qm_confirm_name_token(repeat('a', 64), '  UJIAN   BIN NAMA PENUH ', 'iphash1');
  if r.token_id is distinct from '00000000-0000-0000-0000-0000000e7a01'::uuid then raise exception 'UJIAN 2 GAGAL: token_id %', r.token_id; end if;
  if r.new_name <> 'UJIAN BIN NAMA PENUH' or r.old_name <> 'ujian nick' then raise exception 'UJIAN 2 GAGAL: nama % / %', r.old_name, r.new_name; end if;
  if r.certificate_ids <> array['00000000-0000-0000-0000-0000000e0e01'::uuid] then raise exception 'UJIAN 2 GAGAL: ids %', r.certificate_ids; end if;
  select count(*) into v_n from public.qm_profiles p
   where p.id = '00000000-0000-0000-0000-0000000e00a1' and p.certificate_name = 'UJIAN BIN NAMA PENUH'
     and p.display_name = 'UJIAN BIN NAMA PENUH' and p.certificate_name_source = 'participant_link'
     and p.certificate_name_confirmed_at is not null;
  if v_n <> 1 then raise exception 'UJIAN 2 GAGAL: profil tidak dikemas kini'; end if;
  select c.name_snapshot into v_txt from public.qm_certificates c where c.id = '00000000-0000-0000-0000-0000000e0e01';
  if v_txt <> 'UJIAN BIN NAMA PENUH' then raise exception 'UJIAN 2 GAGAL: name_snapshot %', v_txt; end if;
  if (select code from public.qm_certificates where id = '00000000-0000-0000-0000-0000000e0e01') <> 'KZEUJIA' then
    raise exception 'UJIAN 2 GAGAL: kod sijil berubah';
  end if;
  select count(*) into v_n from public.qm_certificate_name_log l
   where l.token_id = '00000000-0000-0000-0000-0000000e7a01' and l.ip_hash = 'iphash1'
     and l.old_name = 'ujian nick' and l.source = 'participant_link';
  if v_n <> 1 then raise exception 'UJIAN 2 GAGAL: log audit'; end if;

  -- Ujian 3: token sekali guna.
  begin
    perform * from public.qm_confirm_name_token(repeat('a', 64), 'Nama Lain Sekali', null);
    raise exception 'UJIAN 3 GAGAL: token digunakan dua kali';
  exception when others then
    if sqlerrm <> 'TOKEN_USED' then raise exception 'UJIAN 3 GAGAL: %', sqlerrm; end if;
  end;

  -- Ujian 4: token tidak wujud dan nama terlalu pendek.
  begin
    perform * from public.qm_confirm_name_token(repeat('f', 64), 'Nama Penuh Ada', null);
    raise exception 'UJIAN 4 GAGAL: token tidak wujud diterima';
  exception when others then
    if sqlerrm <> 'TOKEN_NOT_FOUND' then raise exception 'UJIAN 4 GAGAL: %', sqlerrm; end if;
  end;
  begin
    perform * from public.qm_confirm_name_token(repeat('b', 64), 'Ab', null);
    raise exception 'UJIAN 4 GAGAL: nama pendek diterima';
  exception when others then
    if sqlerrm not like 'Name must be%' then raise exception 'UJIAN 4 GAGAL: %', sqlerrm; end if;
  end;

  -- Ujian 5: before_issue, sijil dikeluarkan selepas pengesahan, idempoten.
  begin
    perform public.qm_issue_certificate_for_token('00000000-0000-0000-0000-0000000e7a02');
    raise exception 'UJIAN 5 GAGAL: sijil dikeluarkan sebelum pengesahan';
  exception when others then
    if sqlerrm <> 'Token is not confirmed.' then raise exception 'UJIAN 5 GAGAL: %', sqlerrm; end if;
  end;
  select * into r from public.qm_confirm_name_token(repeat('b', 64), 'Norfarahin binti Amat @ Adnin', 'iphash2');
  if r.certificate_ids <> array[]::uuid[] then raise exception 'UJIAN 5 GAGAL: ids sepatutnya kosong'; end if;
  -- Token tanpa template_id guna templat aktif kelas (templat tunggal aktif secara lalai).
  v_cert := public.qm_issue_certificate_for_token('00000000-0000-0000-0000-0000000e7a02');
  v_cert2 := public.qm_issue_certificate_for_token('00000000-0000-0000-0000-0000000e7a02');
  if v_cert is null or v_cert <> v_cert2 then raise exception 'UJIAN 5 GAGAL: tidak idempoten'; end if;
  select c.name_snapshot into v_txt from public.qm_certificates c where c.id = v_cert;
  if v_txt <> 'Norfarahin binti Amat @ Adnin' then raise exception 'UJIAN 5 GAGAL: nama sijil %', v_txt; end if;
  if (select template_id from public.qm_certificates where id = v_cert) <> '00000000-0000-0000-0000-0000000e0701' then
    raise exception 'UJIAN 5 GAGAL: templat salah';
  end if;
  if (select issued_by from public.qm_certificates where id = v_cert) <> '00000000-0000-0000-0000-0000000e00e1' then
    raise exception 'UJIAN 5 GAGAL: issued_by';
  end if;

  -- Ujian 6: lima cubaan gagal membatalkan token.
  insert into public.qm_name_update_tokens (id, token_hash, participant_id, class_id, purpose)
  values ('00000000-0000-0000-0000-0000000e7a03', repeat('d', 64), '00000000-0000-0000-0000-0000000e00a1',
          '00000000-0000-0000-0000-0000000e0c01', 'after_issue');
  for i in 1..5 loop perform public.qm_name_token_failed_attempt(repeat('d', 64)); end loop;
  if (select status from public.qm_name_update_tokens where id = '00000000-0000-0000-0000-0000000e7a03') <> 'revoked' then
    raise exception 'UJIAN 6 GAGAL: token tidak dibatalkan';
  end if;
  begin
    perform * from public.qm_confirm_name_token(repeat('d', 64), 'Nama Penuh Ada', null);
    raise exception 'UJIAN 6 GAGAL: token dibatalkan diterima';
  exception when others then
    if sqlerrm <> 'TOKEN_REVOKED' then raise exception 'UJIAN 6 GAGAL: %', sqlerrm; end if;
  end;

  -- Ujian 7: token tamat tempoh ditolak.
  insert into public.qm_name_update_tokens (token_hash, participant_id, class_id, purpose, expires_at)
  values (repeat('e', 64), '00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e0c01',
          'after_issue', now() - interval '1 minute');
  begin
    perform * from public.qm_confirm_name_token(repeat('e', 64), 'Nama Penuh Ada', null);
    raise exception 'UJIAN 7 GAGAL: token tamat tempoh diterima';
  exception when others then
    if sqlerrm <> 'TOKEN_EXPIRED' then raise exception 'UJIAN 7 GAGAL: %', sqlerrm; end if;
  end;

  -- Ujian 8: baris gilir name_request tanpa sijil diterima; tanpa peserta ditolak.
  insert into public.qm_certificate_email_queue (certificate_id, class_id, participant_id, kind, name_link_purpose, name_link_days, idempotency_key)
  values (null, '00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-0000000e00a2', 'name_request', 'before_issue', 30, 'kze:8:a');
  begin
    insert into public.qm_certificate_email_queue (certificate_id, class_id, kind, idempotency_key)
    values (null, '00000000-0000-0000-0000-0000000e0c01', 'certificate', 'kze:8:b');
    raise exception 'UJIAN 8 GAGAL: baris certificate tanpa sijil diterima';
  exception when check_violation then null;
  end;
  begin
    insert into public.qm_certificate_email_queue (certificate_id, class_id, participant_id, kind, idempotency_key)
    values (null, '00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-0000000e00a2', 'name_request', 'kze:8:c');
    raise exception 'UJIAN 8 GAGAL: permintaan nama aktif kedua diterima';
  exception when unique_violation then null;
  end;
  perform public.qm_mark_certificate_email_sent(
    (select id from public.qm_certificate_email_queue where idempotency_key = 'kze:8:a'), false);
  if (select status from public.qm_certificate_email_queue where idempotency_key = 'kze:8:a') <> 'sent' then
    raise exception 'UJIAN 8 GAGAL: tanda dihantar';
  end if;

  -- Ujian 9: fungsi tidak boleh dipanggil oleh authenticated/anon.
  if has_function_privilege('authenticated', 'public.qm_confirm_name_token(text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.qm_confirm_name_token(text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.qm_issue_certificate_for_token(uuid)', 'execute')
     or has_function_privilege('anon', 'public.qm_name_token_failed_attempt(text)', 'execute') then
    raise exception 'UJIAN 9 GAGAL: geran fungsi terlalu luas';
  end if;
  if has_column_privilege('authenticated', 'public.qm_name_update_tokens', 'token_hash', 'select') then
    raise exception 'UJIAN 9 GAGAL: token_hash boleh dibaca';
  end if;
  if not has_column_privilege('authenticated', 'public.qm_name_update_tokens', 'status', 'select') then
    raise exception 'UJIAN 9 GAGAL: status tidak boleh dibaca pendidik';
  end if;

  -- Ujian 10: akaun dipadam atau bukan ahli tidak boleh menggunakan token.
  delete from public.qm_name_update_tokens where participant_id = '00000000-0000-0000-0000-0000000e00a1' and status = 'pending';
  insert into public.qm_name_update_tokens (token_hash, participant_id, class_id, purpose)
  values (repeat('9', 64), '00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e0c01', 'after_issue');
  update public.qm_profiles set display_name = '[Deleted] Ujian' where id = '00000000-0000-0000-0000-0000000e00a1';
  begin
    perform * from public.qm_confirm_name_token(repeat('9', 64), 'Nama Penuh Ada', null);
    raise exception 'UJIAN 10 GAGAL: akaun dipadam diterima';
  exception when others then
    if sqlerrm <> 'TOKEN_REVOKED' then raise exception 'UJIAN 10 GAGAL: %', sqlerrm; end if;
  end;
  if (select display_name from public.qm_profiles where id = '00000000-0000-0000-0000-0000000e00a1') <> '[Deleted] Ujian' then
    raise exception 'UJIAN 10 GAGAL: profil dipadam ditulis ganti';
  end if;
  update public.qm_profiles set display_name = 'Pulih' where id = '00000000-0000-0000-0000-0000000e00a1';
  delete from public.qm_class_members where user_id = '00000000-0000-0000-0000-0000000e00a1';
  begin
    perform * from public.qm_confirm_name_token(repeat('9', 64), 'Nama Penuh Ada', null);
    raise exception 'UJIAN 10 GAGAL: bukan ahli diterima';
  exception when others then
    if sqlerrm <> 'TOKEN_REVOKED' then raise exception 'UJIAN 10 GAGAL: %', sqlerrm; end if;
  end;

  raise notice 'KZ-E: SEMUA UJIAN LULUS';
end $u$;

rollback;
