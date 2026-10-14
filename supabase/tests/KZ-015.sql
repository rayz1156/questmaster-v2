-- KZ-015.sql: qm_team_member_counts hanya untuk pemilik, pendidik, ahli
-- kelas atau pentadbir. Satu transaksi, digulung semula.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/tests/KZ-015.sql
-- Output terakhir "KZ-015: SEMUA UJIAN LULUS" bermakna lulus.

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000150e1', 'kz015-pensyarah@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000150a1', 'kz015-ahli@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000150b1', 'kz015-luar@ujian.invalid',      'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000150e1', 'educator',    'Pensyarah KZ-015', 'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000150a1', 'participant', 'Ahli',             'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000150b1', 'participant', 'Orang luar',       'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-000000015c01', '00000000-0000-0000-0000-0000000150e1', 'Kelas Ujian KZ-015');
insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-000000015c01', '00000000-0000-0000-0000-0000000150a1');
insert into public.qm_teams (id, class_id, hunt_id, name, max_members) values
  ('00000000-0000-0000-0000-000000015d01', '00000000-0000-0000-0000-000000015c01', null, 'T1', 4);
insert into public.qm_team_members (team_id, user_id, role) values
  ('00000000-0000-0000-0000-000000015d01', '00000000-0000-0000-0000-0000000150a1', 'member');

-- Ujian 1: geran. anon tiada execute, authenticated ada.
do $u$
begin
  if has_function_privilege('anon', 'public.qm_team_member_counts(uuid)', 'execute') then
    raise exception 'UJIAN 1 GAGAL: anon masih boleh execute';
  end if;
  if not has_function_privilege('authenticated', 'public.qm_team_member_counts(uuid)', 'execute') then
    raise exception 'UJIAN 1 GAGAL: authenticated tiada execute';
  end if;
end $u$;

-- Ujian 2: pemilik kelas nampak kiraan (1).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000150e1"}', true);
set local role authenticated;
do $u$
declare n bigint;
begin
  select cnt into n from public.qm_team_member_counts('00000000-0000-0000-0000-000000015c01');
  if n is distinct from 1 then raise exception 'UJIAN 2 GAGAL: pemilik dapat %', n; end if;
end $u$;
reset role;

-- Ujian 3: ahli kelas nampak kiraan (halaman peserta).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000150a1"}', true);
set local role authenticated;
do $u$
declare n bigint;
begin
  select cnt into n from public.qm_team_member_counts('00000000-0000-0000-0000-000000015c01');
  if n is distinct from 1 then raise exception 'UJIAN 3 GAGAL: ahli dapat %', n; end if;
end $u$;
reset role;

-- Ujian 4: pengguna log masuk bukan ahli kelas: tiada baris.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000150b1"}', true);
set local role authenticated;
do $u$
declare n int;
begin
  select count(*) into n from public.qm_team_member_counts('00000000-0000-0000-0000-000000015c01');
  if n <> 0 then raise exception 'UJIAN 4 GAGAL: orang luar dapat % baris', n; end if;
end $u$;
reset role;

-- Ujian 5: tanpa log masuk (tiada sub): tiada baris walaupun dipanggil.
select set_config('request.jwt.claims', '', true);
do $u$
declare n int;
begin
  select count(*) into n from public.qm_team_member_counts('00000000-0000-0000-0000-000000015c01');
  if n <> 0 then raise exception 'UJIAN 5 GAGAL: tanpa log masuk dapat % baris', n; end if;
  raise notice 'KZ-015: SEMUA UJIAN LULUS';
end $u$;

rollback;
