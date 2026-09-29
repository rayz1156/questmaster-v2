-- V2-009.sql: ujian penyegerakan nama profil (kad Intro => nama akaun).
--
-- PERLU DIJALANKAN OLEH CTO PADA VPS (qa tiada akses pangkalan data):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/tests/V2-009.sql
--
-- PERLU MIGRASI 0046 DAHULU (jadual sandaran, fungsi dan trigger
-- qm_segerak_nama_intro dicipta oleh 0046_segerak_nama_profil.sql).
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya (ROLLBACK), jadi tiada data ujian kekal. Setiap semakan
-- memaparkan LULUS atau GAGAL melalui RAISE NOTICE; GAGAL menghentikan
-- skrip dengan pengecualian 'henti selepas gagal'.
--
-- Disemak di sini:
--   1. Pra-syarat: fungsi qm_segerak_nama_intro dan jadual sandaran wujud.
--   2. Logik isi semula (backfill) pada data benih bercampur: intro NULL,
--      intro kosong, intro sama, intro berbeza, akaun padam sendiri.
--   3. Pelajar (authenticated) kemas kini intro_display_name sendiri dan
--      display_name ikut berubah (trigger berjalan di bawah RLS + guard).
--   4. Kosongkan intro tidak mengosongkan display_name.
--   5. Kemas kini tanpa perubahan intro tidak mengubah display_name.
--   6. Pelajar tidak boleh UPDATE profil orang lain (RLS).
--   7. anon dan authenticated tidak boleh SELECT jadual sandaran.
--   8. Guard sedia ada masih memin lajur keistimewaan semasa trigger baru
--      berjalan (role kekal, tetapi nama tetap disegerakkan).

begin;

-- ============================================================
-- 0. Data asas (semua ID hex sah supaya UUID sah)
-- ============================================================
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000b001', 'v2-009-berbeza@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000b002', 'v2-009-intro-null@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000b003', 'v2-009-intro-kosong@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000b004', 'v2-009-intro-sama@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000b005', 'v2-009-padam@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000b006', 'v2-009-berbeza-dua@ujian.invalid', 'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

-- plan NOT NULL (skema-production.sql baris 5257), lalai 'free' tetapi
-- diberi jelas di sini.
insert into public.qm_profiles (id, role, display_name, intro_display_name, plan, approved, suspended) values
  -- b001: intro berbeza daripada display_name => sasaran backfill.
  ('00000000-0000-0000-0000-00000000b001', 'participant', 'Ali Lama',      'Ali Baru',      'free', true, false),
  -- b002: intro NULL => tidak disentuh backfill.
  ('00000000-0000-0000-0000-00000000b002', 'participant', 'Kosong',         null,            'free', true, false),
  -- b003: intro rentetan kosong => tidak disentuh backfill.
  ('00000000-0000-0000-0000-00000000b003', 'participant', 'Tepi',           '',              'free', true, false),
  -- b004: intro sama dengan display_name => tidak disentuh backfill.
  ('00000000-0000-0000-0000-00000000b004', 'participant', 'Sama',           'Sama',          'free', true, false),
  -- b005: akaun padam sendiri (softDeleteMyAccount menanda "[Deleted] ")
  -- => dikecualikan walaupun intro berbeza.
  ('00000000-0000-0000-0000-00000000b005', 'participant', '[Deleted] Ali',  'Ali Baru',      'free', true, false),
  -- b006: sasaran backfill kedua, dipakai sebagai "profil orang lain".
  ('00000000-0000-0000-0000-00000000b006', 'participant', 'Lama Enam',      'Baharu Enam',   'free', true, false);

-- ============================================================
-- 1. Pra-syarat: fungsi trigger dan jadual sandaran wujud
-- ============================================================
do $$
declare
  v_bil int;
begin
  select count(*) into v_bil
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'qm_segerak_nama_intro';
  if v_bil = 1 then
    raise notice 'LULUS UJIAN 1a: fungsi qm_segerak_nama_intro wujud';
  else
    raise notice 'GAGAL UJIAN 1a: fungsi qm_segerak_nama_intro tidak wujud (jalankan migrasi 0046 dahulu)';
    raise exception 'henti selepas gagal';
  end if;

  select count(*) into v_bil
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'qm_profiles_nama_sandaran_0046' and c.relkind = 'r';
  if v_bil = 1 then
    raise notice 'LULUS UJIAN 1b: jadual sandaran wujud';
  else
    raise notice 'GAGAL UJIAN 1b: jadual qm_profiles_nama_sandaran_0046 tidak wujud';
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 2. Logik isi semula (backfill) pada data benih bercampur.
--    Pernyataan sama seperti langkah data migrasi 0046.
-- ============================================================
insert into public.qm_profiles_nama_sandaran_0046 (id, display_name_lama)
select p.id, p.display_name
from public.qm_profiles p
where nullif(btrim(p.intro_display_name), '') is not null
  and nullif(btrim(p.intro_display_name), '') is distinct from btrim(coalesce(p.display_name, ''))
  and coalesce(p.display_name, '') not like '[Deleted]%';

update public.qm_profiles p
set display_name = left(btrim(p.intro_display_name), 80)
where nullif(btrim(p.intro_display_name), '') is not null
  and nullif(btrim(p.intro_display_name), '') is distinct from btrim(coalesce(p.display_name, ''))
  and coalesce(p.display_name, '') not like '[Deleted]%';

do $$
declare
  v_sandaran record;
  v_nama text;
begin
  -- 2a. Sandaran tepat: b001 dan b006 sahaja (senarai ID ujian jelas).
  for v_sandaran in
    select id, display_name_lama
    from public.qm_profiles_nama_sandaran_0046
    where id in (
      '00000000-0000-0000-0000-00000000b001',
      '00000000-0000-0000-0000-00000000b002',
      '00000000-0000-0000-0000-00000000b003',
      '00000000-0000-0000-0000-00000000b004',
      '00000000-0000-0000-0000-00000000b005',
      '00000000-0000-0000-0000-00000000b006')
    order by id
  loop
    if v_sandaran.id = '00000000-0000-0000-0000-00000000b001' and v_sandaran.display_name_lama = 'Ali Lama' then
      raise notice 'LULUS UJIAN 2a1: sandaran b001 nama lama Ali Lama';
    elsif v_sandaran.id = '00000000-0000-0000-0000-00000000b006' and v_sandaran.display_name_lama = 'Lama Enam' then
      raise notice 'LULUS UJIAN 2a2: sandaran b006 nama lama Lama Enam';
    else
      raise notice 'GAGAL UJIAN 2a: baris sandaran tidak dijangka % nama %',
        v_sandaran.id, v_sandaran.display_name_lama;
      raise exception 'henti selepas gagal';
    end if;
  end loop;
  if not exists (
    select 1 from public.qm_profiles_nama_sandaran_0046
    where id in ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b006')
  ) then
    raise notice 'GAGAL UJIAN 2a3: tiada baris sandaran dijangka';
    raise exception 'henti selepas gagal';
  end if;

  -- 2b. display_name dikemas kini untuk sasaran.
  select display_name into v_nama from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000b001';
  if v_nama = 'Ali Baru' then
    raise notice 'LULUS UJIAN 2b1: b001 display_name => Ali Baru';
  else
    raise notice 'GAGAL UJIAN 2b1: jangka Ali Baru, dapat %', v_nama;
    raise exception 'henti selepas gagal';
  end if;

  select display_name into v_nama from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000b006';
  if v_nama = 'Baharu Enam' then
    raise notice 'LULUS UJIAN 2b2: b006 display_name => Baharu Enam';
  else
    raise notice 'GAGAL UJIAN 2b2: jangka Baharu Enam, dapat %', v_nama;
    raise exception 'henti selepas gagal';
  end if;

  -- 2c. Baris lain tidak disentuh: intro NULL, intro kosong, intro sama,
  --     dan akaun padam sendiri.
  select display_name into v_nama from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000b002';
  if v_nama = 'Kosong' then
    raise notice 'LULUS UJIAN 2c1: b002 (intro NULL) tidak berubah';
  else
    raise notice 'GAGAL UJIAN 2c1: jangka Kosong, dapat %', v_nama;
    raise exception 'henti selepas gagal';
  end if;

  select display_name into v_nama from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000b003';
  if v_nama = 'Tepi' then
    raise notice 'LULUS UJIAN 2c2: b003 (intro kosong) tidak berubah';
  else
    raise notice 'GAGAL UJIAN 2c2: jangka Tepi, dapat %', v_nama;
    raise exception 'henti selepas gagal';
  end if;

  select display_name into v_nama from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000b004';
  if v_nama = 'Sama' then
    raise notice 'LULUS UJIAN 2c3: b004 (intro sama) tidak berubah';
  else
    raise notice 'GAGAL UJIAN 2c3: jangka Sama, dapat %', v_nama;
    raise exception 'henti selepas gagal';
  end if;

  select display_name into v_nama from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000b005';
  if v_nama = '[Deleted] Ali' then
    raise notice 'LULUS UJIAN 2c4: b005 (padam sendiri) tidak berubah';
  else
    raise notice 'GAGAL UJIAN 2c4: jangka "[Deleted] Ali", dapat %', v_nama;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 3. Pelajar (authenticated) kemas kini intro sendiri: display_name ikut.
--    SET ROLE authenticated supaya RLS dan guard berjalan sebenar;
--    claims JWT memberi auth.uid().
-- ============================================================
do $$
declare
  v_nama text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}', false);
  execute 'set local role authenticated';

  update public.qm_profiles
  set intro_display_name = 'Ali Terkini'
  where id = '00000000-0000-0000-0000-00000000b001';

  execute 'reset role';

  select display_name into v_nama from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000b001';
  if v_nama = 'Ali Terkini' then
    raise notice 'LULUS UJIAN 3: authenticated kemas kini intro, display_name ikut (%)', v_nama;
  else
    raise notice 'GAGAL UJIAN 3: jangka Ali Terkini, dapat %', v_nama;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 4. Kosongkan intro tidak mengosongkan display_name.
--    Ujian mengikut kedua-dua bentuk yang mungkin sampai ke pelayan:
--    rentetan kosong (b003) dan NULL (b001).
-- ============================================================
do $$
declare
  v_nama text;
  v_intro text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}', false);
  execute 'set local role authenticated';

  update public.qm_profiles
  set intro_display_name = ''
  where id = '00000000-0000-0000-0000-00000000b003';

  execute 'reset role';

  select display_name, intro_display_name into v_nama, v_intro
  from public.qm_profiles where id = '00000000-0000-0000-0000-00000000b003';
  if v_nama = 'Tepi' and v_intro = '' then
    raise notice 'LULUS UJIAN 4a: intro kosong, display_name kekal Tepi';
  else
    raise notice 'GAGAL UJIAN 4a: nama=% intro=%', v_nama, v_intro;
    raise exception 'henti selepas gagal';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}', false);
  execute 'set local role authenticated';

  update public.qm_profiles
  set intro_display_name = null
  where id = '00000000-0000-0000-0000-00000000b001';

  execute 'reset role';

  select display_name, intro_display_name into v_nama, v_intro
  from public.qm_profiles where id = '00000000-0000-0000-0000-00000000b001';
  if v_nama = 'Ali Terkini' and v_intro is null then
    raise notice 'LULUS UJIAN 4b: intro NULL, display_name kekal Ali Terkini';
  else
    raise notice 'GAGAL UJIAN 4b: nama=% intro=%', v_nama, v_intro;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 5. Kemas kini tanpa perubahan intro tidak mengubah display_name
--    (trigger tidak berjalan tanpa perlu).
-- ============================================================
do $$
declare
  v_nama text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}', false);
  execute 'set local role authenticated';

  update public.qm_profiles
  set bio = 'bio ujian'
  where id = '00000000-0000-0000-0000-00000000b001';

  execute 'reset role';

  select display_name into v_nama from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000b001';
  if v_nama = 'Ali Terkini' then
    raise notice 'LULUS UJIAN 5: kemas kini bio tidak mengubah display_name';
  else
    raise notice 'GAGAL UJIAN 5: jangka Ali Terkini, dapat %', v_nama;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- Bersihkan konteks JWT supaya tiada kebocoran ke semakan lain.
select set_config('request.jwt.claims', '', false);

-- ============================================================
-- 6. Pelajar tidak boleh UPDATE profil orang lain (RLS menapis baris).
-- ============================================================
do $$
declare
  v_rows int;
  v_intro text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}', false);
  execute 'set local role authenticated';

  update public.qm_profiles
  set intro_display_name = 'Curi Nama'
  where id = '00000000-0000-0000-0000-00000000b002';

  get diagnostics v_rows = row_count;

  execute 'reset role';

  select intro_display_name into v_intro from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000b002';
  if v_rows = 0 and v_intro is null then
    raise notice 'LULUS UJIAN 6: profil orang lain tidak dapat dikemas kini (% baris)', v_rows;
  else
    raise notice 'GAGAL UJIAN 6: baris terjejas=% intro b002=%', v_rows, v_intro;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 7. anon dan authenticated tidak boleh SELECT jadual sandaran.
-- ============================================================
do $$
declare
  v_bil int;
begin
  execute 'set local role anon';
  begin
    select count(*) into v_bil from public.qm_profiles_nama_sandaran_0046;
  exception
    when others then
      v_bil := null;
  end;
  execute 'reset role';
  if v_bil is null or v_bil = 0 then
    raise notice 'LULUS UJIAN 7a: anon tidak dapat membaca jadual sandaran';
  else
    raise notice 'GAGAL UJIAN 7a: anon membaca % baris sandaran', v_bil;
    raise exception 'henti selepas gagal';
  end if;

  execute 'set local role authenticated';
  begin
    select count(*) into v_bil from public.qm_profiles_nama_sandaran_0046;
  exception
    when others then
      v_bil := null;
  end;
  execute 'reset role';
  if v_bil is null or v_bil = 0 then
    raise notice 'LULUS UJIAN 7b: authenticated tidak dapat membaca jadual sandaran';
  else
    raise notice 'GAGAL UJIAN 7b: authenticated membaca % baris sandaran', v_bil;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 8. Guard sedia ada kekal: pelajar tidak boleh menaikkan role sendiri,
--    tetapi penyegerakan nama tetap berjalan dalam kemas kini yang sama.
-- ============================================================
do $$
declare
  v_role text;
  v_nama text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}', false);
  execute 'set local role authenticated';

  update public.qm_profiles
  set role = 'admin', intro_display_name = 'Ujian Guard'
  where id = '00000000-0000-0000-0000-00000000b001';

  execute 'reset role';

  select role, display_name into v_role, v_nama from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000b001';
  if v_role = 'participant' and v_nama = 'Ujian Guard' then
    raise notice 'LULUS UJIAN 8: role dipin (participant), nama disegerak (Ujian Guard)';
  else
    raise notice 'GAGAL UJIAN 8: role=% nama=%', v_role, v_nama;
    raise exception 'henti selepas gagal';
  end if;
end $$;

select set_config('request.jwt.claims', '', false);

rollback;
