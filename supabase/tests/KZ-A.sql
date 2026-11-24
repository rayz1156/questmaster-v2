-- KZ-A.sql: ujian penerimaan nama sijil oleh pendidik (migrasi 0078).
--
-- Ujian sebelum migrasi kekal: gabungkan fail supaya 0078 berada DI DALAM
-- transaksi fail ini, contohnya:
--   { echo 'begin;'; cat 0078_nama_sijil_pendidik.sql; sed '1,/^begin;$/d' KZ-A.sql; } | psql -v ON_ERROR_STOP=1
-- Fail ini berakhir dengan rollback, jadi migrasi dan data ujian tidak
-- kekal. "KZ-A: SEMUA UJIAN LULUS" bermakna semua lulus.

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000a00e1', 'kza-pensyarah@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000a00e2', 'kza-luar@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000a00a1', 'kza-taufik@ujian.invalid',    'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000a00a2', 'kza-fatehah@ujian.invalid',   'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000a00a3', 'kza-siti@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000a00a4', 'kza-bukanahli@ujian.invalid', 'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000a00e1', 'educator',    'Pensyarah KZ-A',      'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000a00e2', 'educator',    'Pendidik Luar',       'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000a00a1', 'participant', 'Bro Taufik',          'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000a00a2', 'participant', 'NURFATEHAH (KEMAS)',  'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000a00a3', 'participant', 'Siti',                'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000a00a4', 'participant', 'Bukan Ahli',          'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000a0c01', '00000000-0000-0000-0000-0000000a00e1', 'Kelas Ujian KZ-A'),
  ('00000000-0000-0000-0000-0000000a0c02', '00000000-0000-0000-0000-0000000a00e1', 'Kelas Lain KZ-A');

insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-0000000a0c01', '00000000-0000-0000-0000-0000000a00a1'),
  ('00000000-0000-0000-0000-0000000a0c01', '00000000-0000-0000-0000-0000000a00a2'),
  ('00000000-0000-0000-0000-0000000a0c01', '00000000-0000-0000-0000-0000000a00a3'),
  ('00000000-0000-0000-0000-0000000a0c02', '00000000-0000-0000-0000-0000000a00a1');

insert into public.qm_certificate_templates (id, class_id, title, criteria, created_by) values
  ('00000000-0000-0000-0000-0000000a0701', '00000000-0000-0000-0000-0000000a0c01', 'Templat KZ-A',
   '{"type":"all_members"}'::jsonb, '00000000-0000-0000-0000-0000000a00e1'),
  ('00000000-0000-0000-0000-0000000a0702', '00000000-0000-0000-0000-0000000a0c02', 'Templat Lain',
   '{"type":"all_members"}'::jsonb, '00000000-0000-0000-0000-0000000a00e1');

-- Sijil sedia ada Taufik dalam kedua-dua kelas, dengan nama panggilan.
insert into public.qm_certificates (id, template_id, class_id, participant_id, name_snapshot, program_snapshot, code, issued_by) values
  ('00000000-0000-0000-0000-0000000a0e01', '00000000-0000-0000-0000-0000000a0701', '00000000-0000-0000-0000-0000000a0c01',
   '00000000-0000-0000-0000-0000000a00a1', 'Bro Taufik', 'Kelas Ujian KZ-A', 'KZAUJIA', '00000000-0000-0000-0000-0000000a00e1'),
  ('00000000-0000-0000-0000-0000000a0e02', '00000000-0000-0000-0000-0000000a0702', '00000000-0000-0000-0000-0000000a0c02',
   '00000000-0000-0000-0000-0000000a00a1', 'Bro Taufik', 'Kelas Lain KZ-A', 'KZAUJIB', '00000000-0000-0000-0000-0000000a00e1');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a00e1", "role": "authenticated"}', true);
set local role authenticated;

-- Ujian 1: sebelum perubahan, Taufik belum disahkan dan nama sandaran dipakai.
do $u$
declare r record;
begin
  select * into r from public.qm_certificate_eligibility('00000000-0000-0000-0000-0000000a0701')
   where participant_id = '00000000-0000-0000-0000-0000000a00a1';
  if r.certificate_name <> 'Bro Taufik' or r.name_confirmed then
    raise exception 'UJIAN 1 GAGAL: %', row_to_json(r);
  end if;
end $u$;

-- Ujian 2: scope certificate menukar nama kelas ini, sijil kelas ini dan log.
do $u$
declare r record; n int;
begin
  select * into r from public.qm_set_member_certificate_name(
    '00000000-0000-0000-0000-0000000a0c01', '00000000-0000-0000-0000-0000000a00a1',
    '  TAUFIQ   BIN MOHD YUSOF ', 'certificate');
  if r.old_name <> 'Bro Taufik' or r.new_name <> 'TAUFIQ BIN MOHD YUSOF'
     or r.certificate_ids <> array['00000000-0000-0000-0000-0000000a0e01'::uuid] then
    raise exception 'UJIAN 2 GAGAL (pulangan): %', row_to_json(r);
  end if;
  select * into r from public.qm_certificate_eligibility('00000000-0000-0000-0000-0000000a0701')
   where participant_id = '00000000-0000-0000-0000-0000000a00a1';
  if r.certificate_name <> 'TAUFIQ BIN MOHD YUSOF' or not r.name_confirmed or not r.already_issued then
    raise exception 'UJIAN 2 GAGAL (kelayakan): %', row_to_json(r);
  end if;
  select count(*) into n from public.qm_certificate_name_log
   where class_id = '00000000-0000-0000-0000-0000000a0c01'
     and old_name = 'Bro Taufik' and new_name = 'TAUFIQ BIN MOHD YUSOF' and scope = 'certificate';
  if n <> 1 then raise exception 'UJIAN 2 GAGAL (log): %', n; end if;
end $u$;

-- Ujian 3: scope certificate TIDAK menyentuh profil atau sijil kelas lain.
reset role;
do $u$
declare v text;
begin
  select display_name into v from public.qm_profiles where id = '00000000-0000-0000-0000-0000000a00a1';
  if v <> 'Bro Taufik' then raise exception 'UJIAN 3 GAGAL (profil): %', v; end if;
  select name_snapshot into v from public.qm_certificates where id = '00000000-0000-0000-0000-0000000a0e02';
  if v <> 'Bro Taufik' then raise exception 'UJIAN 3 GAGAL (kelas lain): %', v; end if;
  select name_snapshot into v from public.qm_certificates where id = '00000000-0000-0000-0000-0000000a0e01';
  if v <> 'TAUFIQ BIN MOHD YUSOF' then raise exception 'UJIAN 3 GAGAL (kelas ini): %', v; end if;
end $u$;
set local role authenticated;

-- Ujian 4: pendidik luar dan peserta ditolak.
do $u$
begin
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a00e2", "role": "authenticated"}', true);
  begin
    perform public.qm_set_member_certificate_name('00000000-0000-0000-0000-0000000a0c01',
      '00000000-0000-0000-0000-0000000a00a3', 'Siti binti Ali', 'certificate');
    raise exception 'UJIAN 4 GAGAL: pendidik luar dibenarkan';
  exception when others then
    if sqlerrm not like 'Only the class educator%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a00a3", "role": "authenticated"}', true);
  begin
    perform public.qm_set_member_certificate_name('00000000-0000-0000-0000-0000000a0c01',
      '00000000-0000-0000-0000-0000000a00a3', 'Siti binti Ali', 'profile');
    raise exception 'UJIAN 4 GAGAL: peserta dibenarkan';
  exception when others then
    if sqlerrm not like 'Only the class educator%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a00e1", "role": "authenticated"}', true);
end $u$;

-- Ujian 5: bukan ahli, nama terlalu pendek dan scope salah ditolak.
do $u$
begin
  begin
    perform public.qm_set_member_certificate_name('00000000-0000-0000-0000-0000000a0c01',
      '00000000-0000-0000-0000-0000000a00a4', 'Bukan Ahli Penuh', 'certificate');
    raise exception 'UJIAN 5 GAGAL: bukan ahli dibenarkan';
  exception when others then
    if sqlerrm not like 'Participant is not a member%' then raise; end if;
  end;
  begin
    perform public.qm_set_member_certificate_name('00000000-0000-0000-0000-0000000a0c01',
      '00000000-0000-0000-0000-0000000a00a3', ' A ', 'certificate');
    raise exception 'UJIAN 5 GAGAL: nama pendek diterima';
  exception when others then
    if sqlerrm not like 'Name must be between%' then raise; end if;
  end;
  begin
    perform public.qm_set_member_certificate_name('00000000-0000-0000-0000-0000000a0c01',
      '00000000-0000-0000-0000-0000000a00a3', 'Siti binti Ali', 'semua');
    raise exception 'UJIAN 5 GAGAL: scope salah diterima';
  exception when others then
    if sqlerrm not like 'scope must be%' then raise; end if;
  end;
end $u$;

-- Ujian 5b: scope profile ditolak untuk akaun bukan peserta.
reset role;
insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-0000000a0c01', '00000000-0000-0000-0000-0000000a00e2');
set local role authenticated;
do $u$
begin
  begin
    perform public.qm_set_member_certificate_name('00000000-0000-0000-0000-0000000a0c01',
      '00000000-0000-0000-0000-0000000a00e2', 'Nama Godam Pendidik', 'profile');
    raise exception 'UJIAN 5b GAGAL: profil pendidik ditukar';
  exception when others then
    if sqlerrm not like 'Profile names can only%' then raise; end if;
  end;
end $u$;

-- Ujian 6: scope profile mengemas kini profil, notis dan sumber pendidik.
do $u$
declare r record;
begin
  select * into r from public.qm_set_member_certificate_name('00000000-0000-0000-0000-0000000a0c01',
    '00000000-0000-0000-0000-0000000a00a2', 'NURFATEHAH BINTI AHMAD', 'profile');
  if r.old_name <> 'NURFATEHAH (KEMAS)' or cardinality(r.certificate_ids) <> 0 then
    raise exception 'UJIAN 6 GAGAL (pulangan): %', row_to_json(r);
  end if;
end $u$;
reset role;
do $u$
declare p record;
begin
  select * into p from public.qm_profiles where id = '00000000-0000-0000-0000-0000000a00a2';
  if p.display_name <> 'NURFATEHAH BINTI AHMAD' or p.certificate_name <> 'NURFATEHAH BINTI AHMAD'
     or p.certificate_name_source <> 'educator' or p.certificate_name_confirmed_at is null
     or p.certificate_name_notice_at is null or p.certificate_name_notice_seen_at is not null then
    raise exception 'UJIAN 6 GAGAL (profil): %', row_to_json(p);
  end if;
end $u$;
set local role authenticated;

-- Ujian 7: pengeluaran baharu memakai nama kelas didahulukan.
do $u$
declare r record; v text;
begin
  perform public.qm_set_member_certificate_name('00000000-0000-0000-0000-0000000a0c01',
    '00000000-0000-0000-0000-0000000a00a3', 'SITI AISYAH BINTI OMAR', 'certificate');
  select * into r from public.qm_issue_certificates('00000000-0000-0000-0000-0000000a0701',
    array['00000000-0000-0000-0000-0000000a00a3'::uuid, '00000000-0000-0000-0000-0000000a00a2'::uuid]);
  if r.issued_count <> 2 then raise exception 'UJIAN 7 GAGAL (bilangan): %', row_to_json(r); end if;
  select name_snapshot into v from public.qm_certificates
   where template_id = '00000000-0000-0000-0000-0000000a0701' and participant_id = '00000000-0000-0000-0000-0000000a00a3';
  if v <> 'SITI AISYAH BINTI OMAR' then raise exception 'UJIAN 7 GAGAL (Siti): %', v; end if;
  select name_snapshot into v from public.qm_certificates
   where template_id = '00000000-0000-0000-0000-0000000a0701' and participant_id = '00000000-0000-0000-0000-0000000a00a2';
  if v <> 'NURFATEHAH BINTI AHMAD' then raise exception 'UJIAN 7 GAGAL (Fatehah): %', v; end if;
end $u$;

-- Ujian 8: tulisan terus ke jadual nama dan log ditolak untuk authenticated.
do $u$
begin
  begin
    insert into public.qm_class_certificate_names (class_id, user_id, certificate_name)
    values ('00000000-0000-0000-0000-0000000a0c01', '00000000-0000-0000-0000-0000000a00a3', 'Godam Nama');
    raise exception 'UJIAN 8 GAGAL: sisipan terus dibenarkan';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.qm_certificate_name_log;
    raise exception 'UJIAN 8 GAGAL: padam log dibenarkan';
  exception when insufficient_privilege then null;
  end;
end $u$;

-- Ujian 9: RLS: peserta nampak baris namanya sendiri sahaja; pendidik luar tiada.
do $u$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a00a3", "role": "authenticated"}', true);
  select count(*) into n from public.qm_class_certificate_names;
  if n <> 1 then raise exception 'UJIAN 9 GAGAL (peserta): %', n; end if;
  select count(*) into n from public.qm_certificate_name_log;
  if n <> 0 then raise exception 'UJIAN 9 GAGAL (log peserta): %', n; end if;
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a00e2", "role": "authenticated"}', true);
  select count(*) into n from public.qm_class_certificate_names;
  if n <> 0 then raise exception 'UJIAN 9 GAGAL (pendidik luar): %', n; end if;
end $u$;

-- Ujian 10: peserta boleh menanda notis dibaca pada profil sendiri.
do $u$
declare v timestamptz;
begin
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a00a2", "role": "authenticated"}', true);
  update public.qm_profiles set certificate_name_notice_seen_at = now()
   where id = '00000000-0000-0000-0000-0000000a00a2';
  select certificate_name_notice_seen_at into v from public.qm_profiles
   where id = '00000000-0000-0000-0000-0000000a00a2';
  if v is null then raise exception 'UJIAN 10 GAGAL'; end if;
end $u$;

reset role;
select 'KZ-A: SEMUA UJIAN LULUS' as keputusan;

rollback;
