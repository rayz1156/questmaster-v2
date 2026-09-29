-- V2-006 (CTO): polisi INSERT qm_feedback selepas 0043. BEGIN ... ROLLBACK.
begin;
set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000006a1', 'v2-006-a@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000006b1', 'v2-006-b@ujian.invalid', 'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;
insert into public.qm_profiles (id, role) values
  ('00000000-0000-0000-0000-0000000006a1', 'educator'),
  ('00000000-0000-0000-0000-0000000006b1', 'educator');

create function pg_temp.cuba(p_uid text, p_role text, p_user uuid, p_type text) returns text language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  insert into public.qm_feedback (user_id, type, subject, message, status) values (p_user, p_type, 's', 'm', 'open');
  execute 'reset role';
  return 'OK';
exception when others then
  execute 'reset role';
  return 'TOLAK';
end $$;

do $$
declare a uuid := '00000000-0000-0000-0000-0000000006a1'; b uuid := '00000000-0000-0000-0000-0000000006b1'; r text;
begin
  r := pg_temp.cuba(a::text, 'authenticated', a, 'plan_interest');
  raise notice '% 1: minat pelan diri sendiri diterima (%)', case when r='OK' then 'LULUS' else 'GAGAL' end, r;
  r := pg_temp.cuba(a::text, 'authenticated', b, 'plan_interest');
  raise notice '% 2: minat pelan untuk pengguna lain ditolak (%)', case when r='TOLAK' then 'LULUS' else 'GAGAL' end, r;
  r := pg_temp.cuba(a::text, 'authenticated', a, 'bug');
  raise notice '% 3: maklum balas biasa pengguna log masuk diterima (%)', case when r='OK' then 'LULUS' else 'GAGAL' end, r;
  r := pg_temp.cuba('', 'anon', null, 'idea');
  raise notice '% 4: maklum balas anon tanpa user_id diterima (%)', case when r='OK' then 'LULUS' else 'GAGAL' end, r;
  r := pg_temp.cuba('', 'anon', a, 'bug');
  raise notice '% 5: anon menyamar user_id ditolak (%)', case when r='TOLAK' then 'LULUS' else 'GAGAL' end, r;
  r := pg_temp.cuba('', 'anon', null, 'plan_interest');
  raise notice '% 6: anon plan_interest ditolak (%)', case when r='TOLAK' then 'LULUS' else 'GAGAL' end, r;
end $$;
rollback;
