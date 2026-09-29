-- V2-008.sql: ujian penerimaan pelan berbayar (pro, institution, unlimited)
-- dan pelan berkesan qm_effective_plan.
--
-- PERLU DIJALANKAN OLEH CTO PADA VPS (qa tiada akses pangkalan data):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/tests/V2-008.sql
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya (ROLLBACK), jadi tiada data ujian kekal. Setiap semakan
-- memaparkan LULUS atau GAGAL melalui RAISE NOTICE; GAGAL menghentikan
-- skrip dengan pengecualian 'henti selepas gagal'.
--
-- Disemak di sini:
--   1. Tandatangan qm_effective_plan ialah (p_user uuid), tiada overload
--      tanpa argumen (asas untuk laporan QA: laluan panggil rpc tanpa argumen).
--   2. Panggilan qm_effective_plan() TANPA argumen gagal di psql
--      (function does not exist). Ini bukti di SQL: PostgREST juga
--      memulangkan PGRST202 untuk bentuk panggilan itu.
--   3. qm_effective_plan(uid) dengan data bercampur:
--      pro aktif => pro; pro tamat tempoh => free; pro dengan
--      plan_expires_at NULL => pro; institution => institution;
--      unlimited => unlimited; free => free; admin/superadmin dengan
--      plan free => pro; free tamat tempoh => free; profil tiada => NULL.
--      (Kes "plan NULL" dibuang: skema production menetapkan
--      qm_profiles.plan NOT NULL dengan lalai 'free' (skema-production.sql
--      baris 5257), jadi kes itu mustahil wujud. Kes gantinya menguji niat
--      yang sama: nilai yang tidak berbayar kekal tidak berbayar walaupun
--      plan_expires_at lepas, iaitu tamat tempoh tidak meningkatkan pelan.)
--   4. qm_set_plan menerima unlimited dan menulis plan_expires_at.

begin;

-- ============================================================
-- 0. Data asas (semua ID hex sah supaya UUID sah)
-- ============================================================
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000d001', 'v2-008-pro@ujian.invalid',        'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000d002', 'v2-008-pro-tamat@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000d003', 'v2-008-pro-null@ujian.invalid',   'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000d004', 'v2-008-institusi@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000d005', 'v2-008-unlimited@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000d006', 'v2-008-free@ujian.invalid',       'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000d007', 'v2-008-admin@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000d008', 'v2-008-superadmin@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000d009', 'v2-008-free-tamat@ujian.invalid','authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000d00a', 'v2-008-tiada-profil@ujian.invalid','authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, plan_expires_at, approved, suspended) values
  ('00000000-0000-0000-0000-00000000d001', 'educator',    'Pro Aktif',      'pro',         now() + interval '30 days', true, false),
  ('00000000-0000-0000-0000-00000000d002', 'educator',    'Pro Tamat',      'pro',         now() - interval '1 day',   true, false),
  ('00000000-0000-0000-0000-00000000d003', 'educator',    'Pro Tiada Tamat','pro',         null,                       true, false),
  ('00000000-0000-0000-0000-00000000d004', 'educator',    'Institusi',      'institution', null,                       true, false),
  ('00000000-0000-0000-0000-00000000d005', 'educator',    'Unlimited',      'unlimited',   null,                       true, false),
  ('00000000-0000-0000-0000-00000000d006', 'participant', 'Free',           'free',        null,                       true, false),
  ('00000000-0000-0000-0000-00000000d007', 'admin',       'Admin',          'free',        null,                       true, false),
  ('00000000-0000-0000-0000-00000000d008', 'superadmin',  'Superadmin',     'free',        null,                       true, false),
  -- d009: pelan 'free' yang tamat tempoh. Pengganti kes "plan NULL" yang
  -- mustahil (qm_profiles.plan NOT NULL, skema-production.sql baris 5257):
  -- menguji bahawa plan_expires_at lepas tidak meningkatkan pelan yang
  -- tidak berbayar, jadi pelayan tetap menganggapnya tidak berbayar.
  ('00000000-0000-0000-0000-00000000d009', 'educator',    'Free Tamat',     'free',        now() - interval '1 day',   true, false);
-- d00a: berdaftar dalam auth.users TIADA baris qm_profiles (kes senarai kosong).

-- ============================================================
-- 1. Tandatangan fungsi
-- ============================================================
do $$
declare
  v_bil int;
  v_arg text;
begin
  select count(*), coalesce(string_agg(pg_get_function_arguments(p.oid), ' | '), '')
    into v_bil, v_arg
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'qm_effective_plan';

  if v_bil = 1 and v_arg like '%p_user%uuid%' then
    raise notice 'LULUS UJIAN 1: qm_effective_plan tunggal, %', v_arg;
  else
    raise notice 'GAGAL UJIAN 1: bil=% argumen=%', v_bil, v_arg;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 2. Panggilan TANPA argumen (bentuk kod V2-008: supa.rpc("qm_effective_plan"))
--    Jangkaan: RALAT function public.qm_effective_plan() does not exist.
--    Jika semakan ini GAGAL (fungsi berjaya dipanggil tanpa argumen),
--    laporan QA "rpc tanpa argumen" tidak sah dan perlu ditarik semula.
-- ============================================================
do $$
declare
  v_ralat text;
begin
  begin
    perform public.qm_effective_plan();
    v_ralat := null;
  exception
    when undefined_function then
      v_ralat := sqlerrm;
    when others then
      v_ralat := sqlerrm;
  end;
  if v_ralat is not null then
    raise notice 'LULUS UJIAN 2: panggilan tanpa argumen ditolak oleh SQL (%)', v_ralat;
  else
    raise notice 'GAGAL UJIAN 2: qm_effective_plan() berjaya dipanggil tanpa argumen';
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 3. qm_effective_plan(uid) dengan data bercampur
-- ============================================================
do $$
declare
  v_plan text;
begin
  v_plan := public.qm_effective_plan('00000000-0000-0000-0000-00000000d001');
  if v_plan = 'pro' then
    raise notice 'LULUS UJIAN 3a: pro aktif => pro';
  else
    raise notice 'GAGAL UJIAN 3a: jangka pro, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;

  v_plan := public.qm_effective_plan('00000000-0000-0000-0000-00000000d002');
  if v_plan = 'free' then
    raise notice 'LULUS UJIAN 3b: pro tamat tempoh => free';
  else
    raise notice 'GAGAL UJIAN 3b: jangka free, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;

  v_plan := public.qm_effective_plan('00000000-0000-0000-0000-00000000d003');
  if v_plan = 'pro' then
    raise notice 'LULUS UJIAN 3c: pro tanpa tamat tempoh => pro';
  else
    raise notice 'GAGAL UJIAN 3c: jangka pro, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;

  v_plan := public.qm_effective_plan('00000000-0000-0000-0000-00000000d004');
  if v_plan = 'institution' then
    raise notice 'LULUS UJIAN 3d: institution => institution';
  else
    raise notice 'GAGAL UJIAN 3d: jangka institution, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;

  v_plan := public.qm_effective_plan('00000000-0000-0000-0000-00000000d005');
  if v_plan = 'unlimited' then
    raise notice 'LULUS UJIAN 3e: unlimited => unlimited';
  else
    raise notice 'GAGAL UJIAN 3e: jangka unlimited, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;

  v_plan := public.qm_effective_plan('00000000-0000-0000-0000-00000000d006');
  if v_plan = 'free' then
    raise notice 'LULUS UJIAN 3f: free => free';
  else
    raise notice 'GAGAL UJIAN 3f: jangka free, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;

  v_plan := public.qm_effective_plan('00000000-0000-0000-0000-00000000d007');
  if v_plan = 'pro' then
    raise notice 'LULUS UJIAN 3g: admin dengan plan free => pro';
  else
    raise notice 'GAGAL UJIAN 3g: jangka pro, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;

  v_plan := public.qm_effective_plan('00000000-0000-0000-0000-00000000d008');
  if v_plan = 'pro' then
    raise notice 'LULUS UJIAN 3h: superadmin dengan plan free => pro';
  else
    raise notice 'GAGAL UJIAN 3h: jangka pro, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;

  v_plan := public.qm_effective_plan('00000000-0000-0000-0000-00000000d009');
  if v_plan = 'free' then
    raise notice 'LULUS UJIAN 3i: free tamat tempoh kekal free (tidak berbayar)';
  else
    raise notice 'GAGAL UJIAN 3i: jangka free, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;

  v_plan := public.qm_effective_plan('00000000-0000-0000-0000-00000000d00a');
  if v_plan is null then
    raise notice 'LULUS UJIAN 3j: pengguna tiada baris profil => NULL';
  else
    raise notice 'GAGAL UJIAN 3j: jangka NULL, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 4. qm_set_plan menerima unlimited dan menulis tamat tempoh
--    Panggilan dibuat SEBAGAI pentadbir (d007) melalui claims JWT:
--    qm_set_plan memerlukan qm_is_admin(), iaitu auth.uid() berperanan
--    admin/superadmin (skema-production.sql baris 4292 dan 1240). Tanpa
--    claims, auth.uid() ialah NULL dan panggilan ditolak QM_FORBIDDEN
--    walaupun pada psql VPS.
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d007","role":"authenticated"}', false);

do $$
declare
  v_plan text;
  v_tamat timestamptz;
  v_ralat text;
begin
  perform public.qm_set_plan(
    '00000000-0000-0000-0000-00000000d006'::uuid,
    'unlimited',
    null::timestamptz
  );
  select plan, plan_expires_at into v_plan, v_tamat
  from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000d006';
  if v_plan = 'unlimited' and v_tamat is null then
    raise notice 'LULUS UJIAN 4a: qm_set_plan menulis unlimited';
  else
    raise notice 'GAGAL UJIAN 4a: plan=% tamat=%', v_plan, v_tamat;
    raise exception 'henti selepas gagal';
  end if;

  perform public.qm_set_plan(
    '00000000-0000-0000-0000-00000000d005'::uuid,
    'free',
    null::timestamptz
  );
  select plan into v_plan
  from public.qm_profiles
  where id = '00000000-0000-0000-0000-00000000d005';
  if v_plan = 'free' then
    raise notice 'LULUS UJIAN 4b: turun taraf unlimited => free dibenarkan';
  else
    raise notice 'GAGAL UJIAN 4b: jangka free, dapat %', v_plan;
    raise exception 'henti selepas gagal';
  end if;

  begin
    perform public.qm_set_plan(
      '00000000-0000-0000-0000-00000000d006'::uuid,
      'enterprise',
      null::timestamptz
    );
    v_ralat := null;
  exception
    when others then
      v_ralat := sqlerrm;
  end;
  if v_ralat is not null and v_ralat like '%QM_BAD_PLAN%' then
    raise notice 'LULUS UJIAN 4c: pelan asing ditolak (%)', v_ralat;
  elsif v_ralat is not null then
    raise notice 'GAGAL UJIAN 4c: ralat lain (%)', v_ralat;
    raise exception 'henti selepas gagal';
  else
    raise notice 'GAGAL UJIAN 4c: pelan asing diterima';
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- Bersihkan konteks pentadbir supaya tiada kebocoran ke semakan lain.
select set_config('request.jwt.claims', '', false);

rollback;
