-- V2-011d.sql (CTO): ujian 0048 qm_admin_delete_user yang dikeraskan.
-- Perlu 0047 dan 0048. Satu transaksi, digulung semula.
begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000001a1', 'v2-011d-super@ujian.invalid',   'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000001a2', 'v2-011d-admin@ujian.invalid',   'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000001a3', 'v2-011d-gantung@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000001a4', 'v2-011d-admin2@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000001a5', 'v2-011d-peserta@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000001a6', 'v2-011d-sasaran@ujian.invalid', 'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended) values
  ('00000000-0000-0000-0000-0000000001a1', 'superadmin',  'Super D',   'free', true, false),
  ('00000000-0000-0000-0000-0000000001a2', 'admin',       'Admin D',   'free', true, false),
  ('00000000-0000-0000-0000-0000000001a3', 'admin',       'Gantung D', 'free', true, true),
  ('00000000-0000-0000-0000-0000000001a4', 'admin',       'Admin2 D',  'free', true, false),
  ('00000000-0000-0000-0000-0000000001a5', 'participant', 'Peserta D', 'free', true, false),
  ('00000000-0000-0000-0000-0000000001a6', 'participant', 'Sasaran D', 'free', true, false)
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name, suspended = excluded.suspended;

-- Pembantu: cuba padam sebagai pemanggil tertentu, pulangkan SQLSTATE atau 'OK'.
create or replace function pg_temp.cuba_padam(p_pemanggil uuid, p_sasaran uuid)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_pemanggil::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.qm_admin_delete_user(p_sasaran);
    execute 'reset role';
    return 'OK';
  exception when others then
    execute 'reset role';
    return sqlstate;
  end;
end $$;

do $$
declare r text; n int;
begin
  r := pg_temp.cuba_padam('00000000-0000-0000-0000-0000000001a5', '00000000-0000-0000-0000-0000000001a6');
  if r = '42501' then raise notice 'LULUS d1: participant ditolak'; else raise exception 'GAGAL d1: %', r; end if;

  r := pg_temp.cuba_padam('00000000-0000-0000-0000-0000000001a3', '00000000-0000-0000-0000-0000000001a6');
  if r = '42501' then raise notice 'LULUS d2: admin digantung ditolak'; else raise exception 'GAGAL d2: %', r; end if;

  r := pg_temp.cuba_padam('00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-0000000001a2');
  if r = '42501' then raise notice 'LULUS d3: padam diri sendiri ditolak'; else raise exception 'GAGAL d3: %', r; end if;

  r := pg_temp.cuba_padam('00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-0000000001a1');
  if r = '42501' then raise notice 'LULUS d4: admin padam superadmin ditolak'; else raise exception 'GAGAL d4: %', r; end if;

  r := pg_temp.cuba_padam('00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-0000000001a4');
  if r = '42501' then raise notice 'LULUS d5: admin padam admin lain ditolak'; else raise exception 'GAGAL d5: %', r; end if;

  select count(*) into n from public.qm_profiles where id in
    ('00000000-0000-0000-0000-0000000001a1','00000000-0000-0000-0000-0000000001a2',
     '00000000-0000-0000-0000-0000000001a4','00000000-0000-0000-0000-0000000001a6');
  if n = 4 then raise notice 'LULUS d6: tiada profil hilang selepas percubaan ditolak'; else raise exception 'GAGAL d6: %', n; end if;

  r := pg_temp.cuba_padam('00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-0000000001a6');
  select count(*) into n from public.qm_profiles where id = '00000000-0000-0000-0000-0000000001a6';
  if r = 'OK' and n = 0 and not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000001a6')
  then raise notice 'LULUS d7: admin padam participant (profil dan auth.users hilang)';
  else raise exception 'GAGAL d7: r=% n=%', r, n; end if;

  select count(*) into n from public.qm_audit_log
   where action = 'delete_user' and target_id = '00000000-0000-0000-0000-0000000001a6'
     and actor_id = '00000000-0000-0000-0000-0000000001a2'
     and meta->'before'->>'display_name' = 'Sasaran D' and meta->'before'->>'role' = 'participant';
  if n = 1 then raise notice 'LULUS d8: audit delete_user sisi pelayan dengan before'; else raise exception 'GAGAL d8: %', n; end if;

  r := pg_temp.cuba_padam('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-0000000001a4');
  if r = 'OK' and not exists (select 1 from public.qm_profiles where id = '00000000-0000-0000-0000-0000000001a4')
  then raise notice 'LULUS d9: superadmin padam admin'; else raise exception 'GAGAL d9: %', r; end if;

  if not has_function_privilege('anon', 'public.qm_admin_delete_user(uuid)', 'EXECUTE')
  then raise notice 'LULUS d10: anon tiada EXECUTE'; else raise exception 'GAGAL d10: anon masih boleh EXECUTE'; end if;
end $$;

rollback;
