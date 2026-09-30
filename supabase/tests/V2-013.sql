-- V2-013.sql: markah terkumpul peserta untuk educator, dan penapis
-- kebenaran view qm_class_individual_scores (migrasi 0050).
--
-- PERLU DIJALANKAN OLEH CTO PADA VPS (agen tiada akses pangkalan data):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/tests/V2-013.sql
--
-- PERLU MIGRASI 0050 DAHULU (fungsi qm_boleh_lihat_markah_kelas dan view
-- qm_class_individual_scores lapan lajur dengan penapis WHERE).
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya (ROLLBACK), jadi tiada data ujian kekal. Semua semakan
-- dihadkan kepada data ujian sendiri (ID unik) kerana pangkalan data
-- sebenar sudah memuat data produksi. Setiap semakan memaparkan LULUS
-- atau GAGAL melalui RAISE NOTICE; GAGAL menghentikan skrip.
--
-- Disemak di sini:
--   1. Pra-syarat: fungsi wujud, ditarik daripada anon/PUBLIC, diberi
--      kepada authenticated dan service_role; view kekal lapan lajur
--      pada kedudukan betul; geran SELECT view kekal.
--   2. Bilangan baris view bagi kelas A untuk setiap peranan: pemilik,
--      educator diterima, admin dan ahli A nampak semua ahli A (2 baris);
--      ahli kelas B, educator jemputan belum diterima dan pengguna lain
--      nampak 0.
--   3. Markah jumlah kekal betul selepas 0050: satu submission diluluskan
--      (10) dan satu skor Live Quiz (300) memberi jumlah 310; ahli tanpa
--      markah kekal kosong.
--   4. service_role nampak semua baris (laluan scores membaca view tanpa
--      JWT pengguna), dan ahli B nampak kelas B sendiri.
--   5. Fungsi boleh dipanggil terus oleh authenticated (geran EXECUTE).

begin;

-- ============================================================
-- 0. Data asas (semua ID hex sah supaya UUID sah)
-- ============================================================
-- b1 pemilik kelas A dan B, b2 educator A diterima, b3 educator A belum
-- diterima, b4 Ali (ahli A, ada markah), b5 Siti (ahli A, tiada markah),
-- b6 Budi (ahli B sahaja), b7 admin, b8 pengguna lain.
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'v2-013-pemilik@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', 'v2-013-edu-ya@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b3', 'v2-013-edu-tidak@ujian.invalid','authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b4', 'v2-013-ali@ujian.invalid',     'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b5', 'v2-013-siti@ujian.invalid',    'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b6', 'v2-013-budi@ujian.invalid',    'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b7', 'v2-013-admin@ujian.invalid',   'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b8', 'v2-013-luar@ujian.invalid',    'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

-- Buang profil auto dahulu (jika pencetus penciptaan profil tetap berjalan
-- dalam tetapan ini), supaya sisipan eksplisit di bawah tidak berlanggar
-- pada kunci utama.
delete from public.qm_profiles
 where id in ('00000000-0000-0000-0000-0000000000b1'::uuid,
              '00000000-0000-0000-0000-0000000000b2'::uuid,
              '00000000-0000-0000-0000-0000000000b3'::uuid,
              '00000000-0000-0000-0000-0000000000b4'::uuid,
              '00000000-0000-0000-0000-0000000000b5'::uuid,
              '00000000-0000-0000-0000-0000000000b6'::uuid,
              '00000000-0000-0000-0000-0000000000b7'::uuid,
              '00000000-0000-0000-0000-0000000000b8'::uuid);

-- plan NOT NULL (skema-production.sql baris 5257), diberi jelas di sini.
insert into public.qm_profiles (id, role, display_name, plan, approved, suspended) values
  ('00000000-0000-0000-0000-0000000000b1', 'educator',    'Pemilik Ujian',  'free', true, false),
  ('00000000-0000-0000-0000-0000000000b2', 'educator',    'Educator Ya',    'free', true, false),
  ('00000000-0000-0000-0000-0000000000b3', 'educator',    'Educator Belum', 'free', true, false),
  ('00000000-0000-0000-0000-0000000000b4', 'participant', 'Ali Ahmad',      'free', true, false),
  ('00000000-0000-0000-0000-0000000000b5', 'participant', 'Siti Aminah',    'free', true, false),
  ('00000000-0000-0000-0000-0000000000b6', 'participant', 'Budi',           'free', true, false),
  ('00000000-0000-0000-0000-0000000000b7', 'admin',       'Admin Ujian',    'free', true, false),
  ('00000000-0000-0000-0000-0000000000b8', 'participant', 'Orang Luar',     'free', true, false);

-- Dua kelas, sama pemilik supaya fokus ujian pada keahlian.
insert into public.qm_classes (id, owner_id, name, color, join_code) values
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b1', 'Kelas A Ujian V2-013', '#6366f1', 'V213AABB'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000b1', 'Kelas B Ujian V2-013', '#22c55e', 'V213BBCC');

-- Ahli: Ali dan Siti dalam kelas A; Budi dalam kelas B sahaja.
insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b4'),
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b5'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000b6');

-- Educator kelas A: satu sudah terima jemputan, satu belum.
insert into public.qm_class_educators (class_id, educator_id, role, invited_by, accepted_at) values
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b2', 'co_creator', '00000000-0000-0000-0000-0000000000b1', now()),
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b3', 'co_creator', '00000000-0000-0000-0000-0000000000b1', null);

-- Markah Ali: satu submission diluluskan bernilai 10.
insert into public.qm_hunts (id, owner_id, class_id, title) values
  ('00000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000ca', 'Hunt Ujian V2-013');

insert into public.qm_challenges (id, hunt_id, title, prompt, answer, points, order_idx) values
  ('00000000-0000-0000-0000-0000000000cd', '00000000-0000-0000-0000-0000000000cc', 'Soalan Ujian V2-013', 'Berapa?', '42', 10, 1);

insert into public.qm_submissions (challenge_id, team_id, user_id, answer, status) values
  ('00000000-0000-0000-0000-0000000000cd', null, '00000000-0000-0000-0000-0000000000b4', '42', 'approved');

-- Markah Ali: satu skor Live Quiz bernilai 300 (sesi ended, kuiz kelas A).
insert into public.qm_live_quizzes (id, class_id, owner_id, title) values
  ('00000000-0000-0000-0000-0000000000ce', '00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b1', 'Kuiz Kelas A Ujian');

insert into public.qm_live_sessions (id, quiz_id, host_id, code, status) values
  ('00000000-0000-0000-0000-0000000000cf', '00000000-0000-0000-0000-0000000000ce', '00000000-0000-0000-0000-0000000000b1', 'TSAA22', 'ended');

insert into public.qm_live_players (id, session_id, nickname, user_id, player_token, score) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000cf', 'Ali Ahmad', '00000000-0000-0000-0000-0000000000b4', lpad('d1', 32, 'a'), 300);

-- ============================================================
-- 1. Pra-syarat migrasi 0050
-- ============================================================
do $$
declare
  v_bil int;
  v_kolum text;
begin
  select count(*) into v_bil
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'qm_boleh_lihat_markah_kelas';
  if v_bil = 1 then
    raise notice 'LULUS 1a: fungsi qm_boleh_lihat_markah_kelas wujud';
  else
    raise exception 'GAGAL 1a: fungsi tidak wujud (migrasi 0050 belum dijalankan?)';
  end if;

  if has_function_privilege('anon', 'public.qm_boleh_lihat_markah_kelas(uuid)', 'EXECUTE') then
    raise exception 'GAGAL 1b: anon masih boleh melaksanakan fungsi';
  else
    raise notice 'LULUS 1b: anon tidak boleh melaksanakan fungsi';
  end if;

  if has_function_privilege('authenticated', 'public.qm_boleh_lihat_markah_kelas(uuid)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.qm_boleh_lihat_markah_kelas(uuid)', 'EXECUTE') then
    raise notice 'LULUS 1c: authenticated dan service_role boleh melaksanakan fungsi';
  else
    raise exception 'GAGAL 1c: geran EXECUTE authenticated/service_role hilang';
  end if;

  select string_agg(column_name, ',' order by ordinal_position) into v_kolum
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'qm_class_individual_scores';
  if v_kolum = 'class_id,user_id,display_name,total_score,task_score,live_score,adjustment_score,live_sessions' then
    raise notice 'LULUS 1d: view lapan lajur pada kedudukan betul';
  else
    raise exception 'GAGAL 1d: lajur view salah: %', coalesce(v_kolum, 'tiada');
  end if;

  if has_table_privilege('authenticated', 'public.qm_class_individual_scores', 'SELECT')
     and has_table_privilege('service_role', 'public.qm_class_individual_scores', 'SELECT') then
    raise notice 'LULUS 1e: geran SELECT view kekal untuk authenticated dan service_role';
  else
    raise exception 'GAGAL 1e: geran SELECT view hilang';
  end if;
end $$;

-- ============================================================
-- 2. Bilangan baris view kelas A per peranan
-- ============================================================
-- Peranan dibuat dengan tuntutan JWT + set role, corak V2-012 bahagian 7.
do $$
declare v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000ca';
  execute 'reset role';
  if v_bil = 2 then
    raise notice 'LULUS 2a: pemilik kelas A nampak 2 ahli A';
  else
    raise exception 'GAGAL 2a: pemilik nampak % baris (jangka 2)', v_bil;
  end if;
end $$;

do $$
declare v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000ca';
  execute 'reset role';
  if v_bil = 2 then
    raise notice 'LULUS 2b: educator diterima nampak 2 ahli A';
  else
    raise exception 'GAGAL 2b: educator diterima nampak % baris (jangka 2)', v_bil;
  end if;
end $$;

do $$
declare v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000ca';
  execute 'reset role';
  if v_bil = 2 then
    raise notice 'LULUS 2c: admin nampak 2 ahli A';
  else
    raise exception 'GAGAL 2c: admin nampak % baris (jangka 2)', v_bil;
  end if;
end $$;

do $$
declare v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000ca';
  execute 'reset role';
  if v_bil = 2 then
    raise notice 'LULUS 2d: ahli A nampak semua ahli A (kedudukan peserta berfungsi)';
  else
    raise exception 'GAGAL 2d: ahli A nampak % baris (jangka 2)', v_bil;
  end if;
end $$;

do $$
declare v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000ca';
  execute 'reset role';
  if v_bil = 0 then
    raise notice 'LULUS 2e: ahli kelas B nampak 0 baris kelas A';
  else
    raise exception 'GAGAL 2e: ahli kelas B nampak % baris kelas A (jangka 0)', v_bil;
  end if;
end $$;

do $$
declare v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000ca';
  execute 'reset role';
  if v_bil = 0 then
    raise notice 'LULUS 2f: educator jemputan belum diterima nampak 0 baris';
  else
    raise exception 'GAGAL 2f: educator belum diterima nampak % baris (jangka 0)', v_bil;
  end if;
end $$;

do $$
declare v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000ca';
  execute 'reset role';
  if v_bil = 0 then
    raise notice 'LULUS 2g: pengguna lain nampak 0 baris';
  else
    raise exception 'GAGAL 2g: pengguna lain nampak % baris (jangka 0)', v_bil;
  end if;
end $$;

-- ============================================================
-- 3. Markah jumlah kekal betul (dibaca sebagai pemilik kelas A)
-- ============================================================
do $$
declare
  v_total bigint;
  v_task bigint;
  v_live bigint;
  v_adj bigint;
  v_sesi bigint;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select total_score, task_score, live_score, adjustment_score, live_sessions
    into v_total, v_task, v_live, v_adj, v_sesi
    from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000ca'
     and user_id = '00000000-0000-0000-0000-0000000000b4';
  execute 'reset role';

  -- 10 task + 300 live + 0 pelarasan = 310.
  if v_task = 10 and v_live = 300 and v_adj = 0 and v_total = 310 and v_sesi = 1 then
    raise notice 'LULUS 3a: Ali task=% live=% adj=% total=% sesi=%', v_task, v_live, v_adj, v_total, v_sesi;
  else
    raise exception 'GAGAL 3a: task=% live=% adj=% total=% sesi=% (jangka 10, 300, 0, 310, 1)',
      v_task, v_live, v_adj, v_total, v_sesi;
  end if;
end $$;

do $$
declare
  v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil
    from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000ca'
     and user_id = '00000000-0000-0000-0000-0000000000b5'
     and total_score = 0 and task_score = 0 and live_score = 0
     and adjustment_score = 0 and live_sessions = 0;
  execute 'reset role';
  if v_bil = 1 then
    raise notice 'LULUS 3b: Siti tanpa markah kekal kosong';
  else
    raise exception 'GAGAL 3b: % baris Siti sepatutnya kosong markah', v_bil;
  end if;
end $$;

-- ============================================================
-- 4. service_role dan ahli kelas sendiri
-- ============================================================
do $$
declare v_bil int;
begin
  -- Kedua-dua GUC ditetapkan kerana auth.role() dibaca sama ada daripada
  -- tuntutan JWT mahupun request.jwt.role mengikut versi skema auth.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"service_role"}', false);
  perform set_config('request.jwt.role', 'service_role', false);
  execute 'set local role service_role';
  select count(*) into v_bil from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000ca';
  execute 'reset role';
  if v_bil = 2 then
    raise notice 'LULUS 4a: service_role nampak 2 ahli A (laluan scores berfungsi)';
  else
    raise exception 'GAGAL 4a: service_role nampak % baris (jangka 2)', v_bil;
  end if;
end $$;

do $$
declare v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_class_individual_scores
   where class_id = '00000000-0000-0000-0000-0000000000cb';
  execute 'reset role';
  if v_bil = 1 then
    raise notice 'LULUS 4b: ahli B nampak 1 ahli kelas B sendiri';
  else
    raise exception 'GAGAL 4b: ahli B nampak % baris kelas B (jangka 1)', v_bil;
  end if;
end $$;

-- ============================================================
-- 5. Fungsi boleh dipanggil terus oleh authenticated (geran EXECUTE)
-- ============================================================
do $$
declare v_ok boolean;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select public.qm_boleh_lihat_markah_kelas('00000000-0000-0000-0000-0000000000ca') into v_ok;
  execute 'reset role';
  if v_ok is true then
    raise notice 'LULUS 5a: authenticated pemilik boleh memanggil fungsi terus';
  else
    raise exception 'GAGAL 5a: fungsi memulangkan % untuk pemilik (jangka true)', v_ok;
  end if;
end $$;

select set_config('request.jwt.claims', '', false);
select set_config('request.jwt.role', '', false);

rollback;
