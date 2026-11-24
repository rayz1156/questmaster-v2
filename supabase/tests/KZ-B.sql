-- KZ-B.sql: ujian penerimaan tetapan lalai sijil (migrasi 0079).
-- Jalankan dengan 0079 DI DALAM transaksi fail ini:
--   { echo 'begin;'; cat 0079_tetapan_lalai_sijil.sql; sed '1,/^begin;$/d' KZ-B.sql; } | psql -v ON_ERROR_STOP=1
-- Berakhir dengan rollback. "KZ-B: SEMUA UJIAN LULUS" bermakna semua lulus.

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000b00e1', 'kzb-a@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000b00e2', 'kzb-b@ujian.invalid', 'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000b00e1', 'educator', 'Pendidik A', 'pro', true, false, now()),
  ('00000000-0000-0000-0000-0000000b00e2', 'educator', 'Pendidik B', 'pro', true, false, now())
on conflict (id) do nothing;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000b00e1", "role": "authenticated"}', true);
set local role authenticated;

-- Ujian 1: pendidik A menyimpan tetapan lalai sendiri.
insert into public.qm_certificate_defaults (educator_id, signer_name, signer_title, signature_path, layout)
values ('00000000-0000-0000-0000-0000000b00e1', 'Dr. A', 'Penceramah',
        'defaults/00000000-0000-0000-0000-0000000b00e1/signature-abc.png', '{"mode":"full_background"}');

-- Ujian 2: laluan di luar ruang nama sendiri ditolak oleh kekangan.
do $u$
begin
  begin
    update public.qm_certificate_defaults
       set logo_path = 'defaults/00000000-0000-0000-0000-0000000b00e2/logo-x.png'
     where educator_id = '00000000-0000-0000-0000-0000000b00e1';
    raise exception 'UJIAN 2 GAGAL: laluan pendidik lain diterima';
  exception when check_violation then null;
  end;
end $u$;

-- Ujian 3: pendidik A tidak boleh mencipta baris untuk pendidik B.
do $u$
begin
  begin
    insert into public.qm_certificate_defaults (educator_id, signer_name)
    values ('00000000-0000-0000-0000-0000000b00e2', 'Godam');
    raise exception 'UJIAN 3 GAGAL: baris pendidik lain dicipta';
  exception when insufficient_privilege then null;
  end;
end $u$;

-- Ujian 4: pendidik B tidak nampak dan tidak boleh mengubah baris A.
do $u$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000b00e2", "role": "authenticated"}', true);
  select count(*) into n from public.qm_certificate_defaults;
  if n <> 0 then raise exception 'UJIAN 4 GAGAL (baca): %', n; end if;
  update public.qm_certificate_defaults set signer_name = 'Godam'
   where educator_id = '00000000-0000-0000-0000-0000000b00e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'UJIAN 4 GAGAL (kemas kini): %', n; end if;
  begin
    delete from public.qm_certificate_defaults;
    raise exception 'UJIAN 4 GAGAL: padam dibenarkan';
  exception when insufficient_privilege then null;
  end;
end $u$;

-- Ujian 5: qm_certificate_asset_in_use mengenali laluan tetapan lalai.
reset role;
do $u$
begin
  if not public.qm_certificate_asset_in_use('defaults/00000000-0000-0000-0000-0000000b00e1/signature-abc.png') then
    raise exception 'UJIAN 5 GAGAL: laluan lalai tidak dikenali';
  end if;
  if public.qm_certificate_asset_in_use('defaults/00000000-0000-0000-0000-0000000b00e1/tiada.png') then
    raise exception 'UJIAN 5 GAGAL: laluan tiada dianggap dipakai';
  end if;
end $u$;

-- Ujian 6: layout bukan objek ditolak.
do $u$
begin
  begin
    update public.qm_certificate_defaults set layout = '[]'::jsonb
     where educator_id = '00000000-0000-0000-0000-0000000b00e1';
    raise exception 'UJIAN 6 GAGAL: layout tatasusunan diterima';
  exception when check_violation then null;
  end;
end $u$;

select 'KZ-B: SEMUA UJIAN LULUS' as keputusan;

rollback;
