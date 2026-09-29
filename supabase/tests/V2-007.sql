-- V2-007 (kzdev): fungsi qm_user_directory selepas 0045. BEGIN ... ROLLBACK.
-- Prasyarat: migrasi 0045 sudah digunakan pada pangkalan data ujian.
-- Kes mengikut tiket:
--   1. educator kelas nampak nama dan emel ahli
--   2. ahli lain kelas sama nampak nama tetapi emel NULL
--   3. pengguna luar tidak dapat baris
--   4. anon ditolak (EXECUTE ditarik balik)
--   5. pentadbir nampak semua
begin;
set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000007a1', 'v2-007-e1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000007a2', 'v2-007-e2@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000007a3', 'v2-007-e3@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000007b1', 'v2-007-m1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000007b2', 'v2-007-m2@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000007c1', 'v2-007-luar@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000007d1', 'v2-007-adm@ujian.invalid', 'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000007a1', 'educator', 'Guru Satu'),
  ('00000000-0000-0000-0000-0000000007a2', 'educator', 'Guru Dua'),
  ('00000000-0000-0000-0000-0000000007a3', 'educator', 'Guru Tiga'),
  ('00000000-0000-0000-0000-0000000007b1', 'participant', 'Murid Satu'),
  ('00000000-0000-0000-0000-0000000007b2', 'participant', 'Murid Dua'),
  ('00000000-0000-0000-0000-0000000007c1', 'participant', 'Luar'),
  ('00000000-0000-0000-0000-0000000007d1', 'admin', 'Pentadbir');

-- Kelas A dimiliki e1; m1 dan m2 ahli; e2 educator co_creator diterima;
-- e3 educator co_creator TANPA accepted_at (jemputan belum dijawab).
insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-000000000701'::uuid,
   '00000000-0000-0000-0000-0000000007a1', 'Kelas Ujian V2-007');
insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-000000000701'::uuid, '00000000-0000-0000-0000-0000000007b1'),
  ('00000000-0000-0000-0000-000000000701'::uuid, '00000000-0000-0000-0000-0000000007b2');
insert into public.qm_class_educators (class_id, educator_id, role, accepted_at) values
  ('00000000-0000-0000-0000-000000000701'::uuid, '00000000-0000-0000-0000-0000000007a2', 'co_creator', now()),
  ('00000000-0000-0000-0000-000000000701'::uuid, '00000000-0000-0000-0000-0000000007a3', 'co_creator', null);

-- Pembantu: panggil qm_user_directory sebagai peranan/identiti tertentu,
-- pulangkan hasil sebagai JSON teks (atau '[]' tiada baris, 'TOLAK' jika ditolak).
create function pg_temp.panggil(p_uid text, p_role text, p_ids uuid[])
returns text language plpgsql as $$
declare r json;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  select coalesce(json_agg(t), '[]'::json) into r
    from public.qm_user_directory(p_ids) t;
  execute 'reset role';
  return r::text;
exception when others then
  execute 'reset role';
  return 'TOLAK';
end $$;

do $$
declare
  e1 uuid := '00000000-0000-0000-0000-0000000007a1';
  e2 uuid := '00000000-0000-0000-0000-0000000007a2';
  e3 uuid := '00000000-0000-0000-0000-0000000007a3';
  m1 uuid := '00000000-0000-0000-0000-0000000007b1';
  m2 uuid := '00000000-0000-0000-0000-0000000007b2';
  luar uuid := '00000000-0000-0000-0000-0000000007c1';
  adm uuid := '00000000-0000-0000-0000-0000000007d1';
  r text; ok boolean; n int;
begin
  -- 1: educator (pemilik) nampak nama dan emel ahli kelasnya
  r := pg_temp.panggil(e1::text, 'authenticated', array[m1, m2]);
  ok := (r::jsonb) @> jsonb_build_array(
    jsonb_build_object('user_id', m1, 'email', 'v2-007-m1@ujian.invalid'),
    jsonb_build_object('user_id', m2, 'email', 'v2-007-m2@ujian.invalid'))
    and jsonb_array_length(r::jsonb) = 2;
  raise notice '% 1: educator nampak nama dan emel ahli (%)',
    case when ok then 'LULUS' else 'GAGAL' end, r;

  -- 1b: educator juga nampak educator kelasnya (e2, diterima)
  r := pg_temp.panggil(e1::text, 'authenticated', array[e2]);
  ok := (r::jsonb) @> jsonb_build_array(
    jsonb_build_object('user_id', e2, 'email', 'v2-007-e2@ujian.invalid'));
  raise notice '% 1b: educator nampak educator kelas itu (%)',
    case when ok then 'LULUS' else 'GAGAL' end, r;

  -- 2: ahli kelas sama nampak nama tetapi emel NULL
  r := pg_temp.panggil(m1::text, 'authenticated', array[m2]);
  ok := jsonb_array_length(r::jsonb) = 1
    and (r::jsonb)->0->>'display_name' = 'Murid Dua'
    and ((r::jsonb)->0->>'email') is null;
  raise notice '% 2: ahli nampak nama, emel NULL (%)',
    case when ok then 'LULUS' else 'GAGAL' end, r;

  -- 2b: ahli nampak educator kelas itu, emel NULL
  r := pg_temp.panggil(m1::text, 'authenticated', array[e2]);
  ok := jsonb_array_length(r::jsonb) = 1
    and ((r::jsonb)->0->>'email') is null;
  raise notice '% 2b: ahli nampak educator, emel NULL (%)',
    case when ok then 'LULUS' else 'GAGAL' end, r;

  -- 3: pengguna luar tidak mendapat baris (tiada kelas kongsi)
  r := pg_temp.panggil(m1::text, 'authenticated', array[luar]);
  raise notice '% 3: ahli tidak nampak pengguna luar (%)',
    case when r = '[]' then 'LULUS' else 'GAGAL' end, r;
  r := pg_temp.panggil(luar::text, 'authenticated', array[m1]);
  raise notice '% 3b: pengguna luar tidak dapat baris (%)',
    case when r = '[]' then 'LULUS' else 'GAGAL' end, r;

  -- 3c: educator dengan jemputan belum diterima tidak nampak apa-apa
  r := pg_temp.panggil(e3::text, 'authenticated', array[m1]);
  raise notice '% 3c: educator belum terima jemputan tidak nampak (%)',
    case when r = '[]' then 'LULUS' else 'GAGAL' end, r;

  -- 4: anon ditolak (EXECUTE ditarik balik pada 0045)
  r := pg_temp.panggil('', 'anon', array[m1]);
  raise notice '% 4: anon ditolak (%)',
    case when r = 'TOLAK' then 'LULUS' else 'GAGAL' end, r;

  -- 5: pentadbir nampak semua, termasuk pengguna luar
  r := pg_temp.panggil(adm::text, 'authenticated', array[m1, m2, luar]);
  ok := jsonb_array_length(r::jsonb) = 3
    and (r::jsonb) @> jsonb_build_array(
      jsonb_build_object('user_id', luar, 'email', 'v2-007-luar@ujian.invalid'));
  raise notice '% 5: pentadbir nampak semua dengan emel (%)',
    case when ok then 'LULUS' else 'GAGAL' end, r;
end $$;

rollback;
