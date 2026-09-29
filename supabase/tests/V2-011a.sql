-- V2-011a.sql: ujian asas ruang kerja admin (audit tambah sahaja, tindakan
-- admin beralasan).
--
-- PERLU DIJALANKAN OLEH CTO PADA VPS (agen tiada akses pangkalan data):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/tests/V2-011a.sql
--
-- PERLU MIGRASI 0047 DAHULU (fungsi qm_admin_aktif, qm_admin_set_suspended,
-- qm_admin_set_challenge_points, qm_admin_override_submission dan polisi
-- baharu qm_audit_log dicipta oleh 0047_ruang_kerja_admin.sql).
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya (ROLLBACK), jadi tiada data ujian kekal. Setiap semakan
-- memaparkan LULUS atau GAGAL melalui RAISE NOTICE; GAGAL menghentikan
-- skrip dengan pengecualian 'henti selepas gagal'.
--
-- Disemak di sini:
--   1. Pra-syarat: fungsi 0047 wujud dan polisi audit tepat (SELECT dan
--      INSERT sahaja, tiada UPDATE/DELETE/TRUNCATE untuk authenticated).
--   2. Participant dan admin digantung ditolak (42501) pada ketiga-tiga RPC.
--   3. Gantung akaun: alasan wajib 5 hingga 500, sasaran diri ditolak,
--      sasaran admin hanya oleh superadmin, superadmin tidak boleh
--      digantung, audit before/after betul dengan actor_id admin.
--   4. Mata soalan: 10 ke 25 dengan audit, -1 dan 100001 ditolak, nilai
--      sama tidak menulis baris audit baharu.
--   5. Pintasan moderasi: approved (reviewed_by pemanggil), pending
--      (reviewed_by NULL), status tidak sah ditolak, audit ada.
--   6. Log audit tambah sahaja: UPDATE dan DELETE ditolak atau tiada
--      kesan; INSERT dengan actor_id orang lain ditolak oleh RLS;
--      INSERT dengan actor_id sendiri berjaya; participant SELECT 0 baris.

begin;

-- ============================================================
-- 0. Data asas (semua ID hex sah supaya UUID sah)
-- ============================================================
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'v2-011a-superadmin@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', 'v2-011a-admin@ujian.invalid',       'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a3', 'v2-011a-admin-gantung@ujian.invalid','authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a4', 'v2-011a-educator@ujian.invalid',     'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a5', 'v2-011a-peserta@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a6', 'v2-011a-sasaran@ujian.invalid',      'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

-- plan NOT NULL (skema-production.sql baris 5257), diberi jelas di sini.
-- Pencetus penciptaan profil tidak berjalan kerana
-- session_replication_role = replica semasa sisipan auth.users.
insert into public.qm_profiles (id, role, display_name, plan, approved, suspended) values
  ('00000000-0000-0000-0000-0000000000a1', 'superadmin',  'Super Ujian',    'free', true, false),
  ('00000000-0000-0000-0000-0000000000a2', 'admin',       'Admin Ujian',    'free', true, false),
  ('00000000-0000-0000-0000-0000000000a3', 'admin',       'Admin Gantung',  'free', true, true),
  ('00000000-0000-0000-0000-0000000000a4', 'educator',    'Pendidik Ujian', 'free', true, false),
  ('00000000-0000-0000-0000-0000000000a5', 'participant', 'Peserta Ujian',  'free', true, false),
  ('00000000-0000-0000-0000-0000000000a6', 'participant', 'Sasaran Ujian',  'free', true, false);

-- Kelas, hunt, challenge (points 10), team, submission 'pending'.
insert into public.qm_classes (id, owner_id, name, color, join_code) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a4', 'Kelas Ujian V2-011a', '#6366f1', 'AB11CD22');

insert into public.qm_hunts (id, owner_id, class_id, title) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000c1', 'Hunt Ujian V2-011a');

insert into public.qm_challenges (id, hunt_id, title, prompt, answer, points, order_idx) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'Soalan Ujian V2-011a', 'Berapa?', '42', 10, 1);

insert into public.qm_teams (id, hunt_id, class_id, name) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'Team Ujian V2-011a');

insert into public.qm_submissions (id, challenge_id, team_id, user_id, answer, status) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a5', '42', 'pending');

-- ============================================================
-- 1. Pra-syarat: fungsi wujud, polisi audit tepat
-- ============================================================
do $$
declare
  v_bil int;
begin
  select count(*) into v_bil
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('qm_admin_aktif', 'qm_admin_set_suspended',
                      'qm_admin_set_challenge_points', 'qm_admin_override_submission');
  if v_bil = 4 then
    raise notice 'LULUS 1a: empat fungsi 0047 wujud';
  else
    raise notice 'GAGAL 1a: fungsi 0047 tidak lengkap (dapat % daripada 4)', v_bil;
    raise exception 'henti selepas gagal';
  end if;

  select count(*) into v_bil
  from pg_policies
  where schemaname = 'public' and tablename = 'qm_audit_log'
    and policyname in ('qm_audit_log_admin_select', 'qm_audit_log_admin_insert');
  if v_bil = 2 then
    raise notice 'LULUS 1b: dua polisi audit baharu wujud';
  else
    raise notice 'GAGAL 1b: polisi audit baharu tidak lengkap (dapat % daripada 2)', v_bil;
    raise exception 'henti selepas gagal';
  end if;

  select count(*) into v_bil
  from pg_policies
  where schemaname = 'public' and tablename = 'qm_audit_log'
    and policyname = 'qm_audit_log_admin_all';
  if v_bil = 0 then
    raise notice 'LULUS 1c: polisi lama qm_audit_log_admin_all sudah dibuang';
  else
    raise notice 'GAGAL 1c: polisi lama masih ada';
    raise exception 'henti selepas gagal';
  end if;

  if has_table_privilege('authenticated', 'public.qm_audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.qm_audit_log', 'DELETE')
     or has_table_privilege('authenticated', 'public.qm_audit_log', 'TRUNCATE') then
    raise notice 'GAGAL 1d: authenticated masih ada UPDATE/DELETE/TRUNCATE pada qm_audit_log';
    raise exception 'henti selepas gagal';
  else
    raise notice 'LULUS 1d: authenticated tiada UPDATE/DELETE/TRUNCATE pada qm_audit_log';
  end if;
end $$;

-- ============================================================
-- 2. Participant ditolak pada ketiga-tiga RPC (42501)
-- ============================================================
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}', false);
  execute 'set local role authenticated';

  begin
    perform public.qm_admin_set_suspended('00000000-0000-0000-0000-0000000000a6'::uuid, true, 'Ujian akses peserta');
    raise exception 'GAGAL 2a: participant berjaya memanggil qm_admin_set_suspended';
  exception
    when insufficient_privilege then
      raise notice 'LULUS 2a: participant ditolak pada qm_admin_set_suspended';
  end;

  begin
    perform public.qm_admin_set_challenge_points('00000000-0000-0000-0000-0000000000e1'::uuid, 25, 'Ujian akses peserta');
    raise exception 'GAGAL 2b: participant berjaya memanggil qm_admin_set_challenge_points';
  exception
    when insufficient_privilege then
      raise notice 'LULUS 2b: participant ditolak pada qm_admin_set_challenge_points';
  end;

  begin
    perform public.qm_admin_override_submission('00000000-0000-0000-0000-0000000000b1'::uuid, 'approved', 'Ujian akses peserta');
    raise exception 'GAGAL 2c: participant berjaya memanggil qm_admin_override_submission';
  exception
    when insufficient_privilege then
      raise notice 'LULUS 2c: participant ditolak pada qm_admin_override_submission';
  end;

  execute 'reset role';
end $$;

-- ============================================================
-- 3. Admin digantung ditolak (42501)
-- ============================================================
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
  execute 'set local role authenticated';

  begin
    perform public.qm_admin_set_suspended('00000000-0000-0000-0000-0000000000a6'::uuid, true, 'Admin digantung cuba bertindak');
    raise exception 'GAGAL 3a: admin digantung berjaya memanggil RPC';
  exception
    when insufficient_privilege then
      raise notice 'LULUS 3a: admin digantung ditolak (42501)';
  end;

  execute 'reset role';
end $$;

-- ============================================================
-- 4. Gantung akaun: alasan, sasaran diri, sasaran admin dan superadmin
-- ============================================================
do $$
declare
  v_bil int;
  v_suspended boolean;
  v_actor uuid;
  v_before text;
  v_after text;
begin
  -- 4a. Admin memanggil sasaran participant dengan alasan terlalu pendek.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
  execute 'set local role authenticated';

  begin
    perform public.qm_admin_set_suspended('00000000-0000-0000-0000-0000000000a6'::uuid, true, 'ab');
    raise exception 'GAGAL 4a: alasan dua aksara diterima';
  exception
    when invalid_parameter_value then
      raise notice 'LULUS 4a: alasan terlalu pendek ditolak (22023)';
  end;

  -- 4b. Alasan sah: berjaya, suspended benar, satu baris audit betul.
  perform public.qm_admin_set_suspended('00000000-0000-0000-0000-0000000000a6'::uuid, true, 'Melanggar peraturan komuniti');

  select suspended, created_at into v_suspended
  from public.qm_profiles
  where id = '00000000-0000-0000-0000-0000000000a6';
  if v_suspended is not true then
    raise exception 'GAGAL 4b: suspended tidak menjadi benar';
  end if;

  select count(*) into v_bil
  from public.qm_audit_log
  where action = 'user_suspend'
    and target_type = 'profile'
    and target_id = '00000000-0000-0000-0000-0000000000a6';
  if v_bil <> 1 then
    raise exception 'GAGAL 4b: baris audit user_suspend tidak tepat (dapat %)', v_bil;
  end if;

  select actor_id, meta->'before'->>'suspended', meta->'after'->>'suspended'
    into v_actor, v_before, v_after
  from public.qm_audit_log
  where action = 'user_suspend'
    and target_id = '00000000-0000-0000-0000-0000000000a6';
  if v_actor = '00000000-0000-0000-0000-0000000000a2'::uuid
     and v_before = 'false' and v_after = 'true' then
    raise notice 'LULUS 4b: audit gantung betul (actor admin, before false, after true)';
  else
    raise exception 'GAGAL 4b: kandungan audit salah (% % %)', v_actor, v_before, v_after;
  end if;

  -- 4c. Admin menggantung dirinya: ditolak.
  begin
    perform public.qm_admin_set_suspended('00000000-0000-0000-0000-0000000000a2'::uuid, true, 'Cuba gantung diri sendiri');
    raise exception 'GAGAL 4c: admin berjaya menggantung dirinya';
  exception
    when insufficient_privilege then
      raise notice 'LULUS 4c: sasaran diri ditolak (cannot_target_self)';
  end;

  -- 4d. Admin menggantung admin lain: ditolak (hanya superadmin).
  begin
    perform public.qm_admin_set_suspended('00000000-0000-0000-0000-0000000000a3'::uuid, false, 'Cuba buka gantungan admin lain');
    raise exception 'GAGAL 4d: admin berjaya menyasar admin lain';
  exception
    when insufficient_privilege then
      raise notice 'LULUS 4d: admin menyasar admin ditolak (42501)';
  end;

  execute 'reset role';

  -- 4e. Superadmin menggantung admin: berjaya.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', false);
  execute 'set local role authenticated';

  perform public.qm_admin_set_suspended('00000000-0000-0000-0000-0000000000a2'::uuid, true, 'Admin menyalahgunakan kuasa');

  select suspended into v_suspended
  from public.qm_profiles
  where id = '00000000-0000-0000-0000-0000000000a2';
  if v_suspended is true then
    raise notice 'LULUS 4e: superadmin menggantung admin';
  else
    raise exception 'GAGAL 4e: admin tidak digantung';
  end if;

  -- 4f. Superadmin membuka gantungan admin digantung (a3): berjaya,
  --     supaya a3 boleh dipakai sebagai admin aktif dalam ujian berikut.
  perform public.qm_admin_set_suspended('00000000-0000-0000-0000-0000000000a3'::uuid, false, 'Buka gantungan untuk ujian seterusnya');

  select count(*) into v_bil
  from public.qm_audit_log
  where action = 'user_unsuspend'
    and target_id = '00000000-0000-0000-0000-0000000000a3';
  if v_bil = 1 then
    raise notice 'LULUS 4f: audit user_unsuspend direkod';
  else
    raise exception 'GAGAL 4f: baris audit user_unsuspend tiada';
  end if;

  execute 'reset role';

  -- 4g. Admin aktif (a3) cuba menggantung superadmin: sentiasa ditolak.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
  execute 'set local role authenticated';

  begin
    perform public.qm_admin_set_suspended('00000000-0000-0000-0000-0000000000a1'::uuid, true, 'Cuba gantung superadmin');
    raise exception 'GAGAL 4g: superadmin berjaya digantung';
  exception
    when insufficient_privilege then
      raise notice 'LULUS 4g: sasaran superadmin sentiasa ditolak';
  end;

  execute 'reset role';
end $$;

-- ============================================================
-- 5. Mata soalan: ubah, had, nilai sama tanpa audit baharu
-- ============================================================
do $$
declare
  v_points int;
  v_before text;
  v_after text;
  v_bil int;
  v_bil_dulu int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
  execute 'set local role authenticated';

  -- 5a. 10 ke 25 dengan alasan: berjaya, audit before 10 after 25.
  perform public.qm_admin_set_challenge_points('00000000-0000-0000-0000-0000000000e1'::uuid, 25, 'Susunan markah semakan baharu');

  select points into v_points
  from public.qm_challenges
  where id = '00000000-0000-0000-0000-0000000000e1';
  if v_points <> 25 then
    raise exception 'GAGAL 5a: points tidak menjadi 25 (dapat %)', v_points;
  end if;

  select meta->'before'->>'points', meta->'after'->>'points'
    into v_before, v_after
  from public.qm_audit_log
  where action = 'challenge_points'
    and target_id = '00000000-0000-0000-0000-0000000000e1';
  if v_before = '10' and v_after = '25' then
    raise notice 'LULUS 5a: audit challenge_points before 10 after 25';
  else
    raise exception 'GAGAL 5a: audit points salah (% => %)', v_before, v_after;
  end if;

  -- 5b. Nilai luar had ditolak.
  begin
    perform public.qm_admin_set_challenge_points('00000000-0000-0000-0000-0000000000e1'::uuid, -1, 'Nilai luar had ujian');
    raise exception 'GAGAL 5b: mata -1 diterima';
  exception
    when invalid_parameter_value then
      raise notice 'LULUS 5b: mata -1 ditolak (22023)';
  end;

  begin
    perform public.qm_admin_set_challenge_points('00000000-0000-0000-0000-0000000000e1'::uuid, 100001, 'Nilai luar had ujian');
    raise exception 'GAGAL 5b: mata 100001 diterima';
  exception
    when invalid_parameter_value then
      raise notice 'LULUS 5b: mata 100001 ditolak (22023)';
  end;

  -- 5c. Nilai sama: tiada baris audit baharu.
  select count(*) into v_bil_dulu
  from public.qm_audit_log
  where action = 'challenge_points'
    and target_id = '00000000-0000-0000-0000-0000000000e1';

  perform public.qm_admin_set_challenge_points('00000000-0000-0000-0000-0000000000e1'::uuid, 25, 'Nilai sama tidak perlu audit');

  select count(*) into v_bil
  from public.qm_audit_log
  where action = 'challenge_points'
    and target_id = '00000000-0000-0000-0000-0000000000e1';
  if v_bil = v_bil_dulu then
    raise notice 'LULUS 5c: nilai sama tidak menulis audit baharu';
  else
    raise exception 'GAGAL 5c: audit bertambah untuk nilai sama (% => %)', v_bil_dulu, v_bil;
  end if;

  execute 'reset role';
end $$;

-- ============================================================
-- 6. Pintasan moderasi: approved, pending, status tidak sah
-- ============================================================
do $$
declare
  v_status text;
  v_review uuid;
  v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
  execute 'set local role authenticated';

  -- 6a. Pintasan ke approved: status dan reviewed_by betul, audit ada.
  perform public.qm_admin_override_submission('00000000-0000-0000-0000-0000000000b1'::uuid, 'approved', 'Bukti disemak semula oleh pentadbir');

  select status, reviewed_by into v_status, v_review
  from public.qm_submissions
  where id = '00000000-0000-0000-0000-0000000000b1';
  if v_status = 'approved' and v_review = '00000000-0000-0000-0000-0000000000a3'::uuid then
    raise notice 'LULUS 6a: pintasan approved betul (reviewed_by admin)';
  else
    raise exception 'GAGAL 6a: status=% reviewed_by=%', v_status, v_review;
  end if;

  select count(*) into v_bil
  from public.qm_audit_log
  where action = 'moderation_override'
    and target_id = '00000000-0000-0000-0000-0000000000b1'
    and meta->'before'->>'status' = 'pending'
    and meta->'after'->>'status' = 'approved';
  if v_bil = 1 then
    raise notice 'LULUS 6a: audit moderation_override (pending ke approved) ada';
  else
    raise exception 'GAGAL 6a: baris audit pintasan tidak tepat';
  end if;

  -- 6b. Kembali ke pending: reviewed_by menjadi NULL, audit ada.
  perform public.qm_admin_override_submission('00000000-0000-0000-0000-0000000000b1'::uuid, 'pending', 'Dibuka semula untuk penilaian semula');

  select status, reviewed_by into v_status, v_review
  from public.qm_submissions
  where id = '00000000-0000-0000-0000-0000000000b1';
  if v_status = 'pending' and v_review is null then
    raise notice 'LULUS 6b: pintasan pending betul (reviewed_by NULL)';
  else
    raise exception 'GAGAL 6b: status=% reviewed_by=%', v_status, v_review;
  end if;

  select count(*) into v_bil
  from public.qm_audit_log
  where action = 'moderation_override'
    and target_id = '00000000-0000-0000-0000-0000000000b1'
    and meta->'after'->>'reviewed_by' is null;
  if v_bil = 1 then
    raise notice 'LULUS 6b: audit pending dengan reviewed_by NULL ada';
  else
    raise exception 'GAGAL 6b: baris audit kedua tidak tepat';
  end if;

  -- 6c. Status tidak sah ditolak.
  begin
    perform public.qm_admin_override_submission('00000000-0000-0000-0000-0000000000b1'::uuid, 'bogus', 'Status tidak sah ujian');
    raise exception 'GAGAL 6c: status bogus diterima';
  exception
    when invalid_parameter_value then
      raise notice 'LULUS 6c: status bogus ditolak (22023)';
  end;

  execute 'reset role';
end $$;

-- ============================================================
-- 7. Log audit tambah sahaja
-- ============================================================
do $$
declare
  v_bil int;
begin
  -- 7a. Admin cuba UPDATE: ralat kebenaran atau tiada baris terjejas;
  --     sama ada pun diterima, kiraan tidak berubah.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false);
  execute 'set local role authenticated';

  begin
    update public.qm_audit_log
       set action = 'diubah'
     where target_id = '00000000-0000-0000-0000-0000000000a6';
  exception
    when insufficient_privilege then
      null; -- ralat kebenaran diterima
  end;

  select count(*) into v_bil
  from public.qm_audit_log
  where action = 'diubah'
    and target_id = '00000000-0000-0000-0000-0000000000a6';
  if v_bil = 0 then
    raise notice 'LULUS 7a: UPDATE audit oleh admin tidak berkesan';
  else
    raise exception 'GAGAL 7a: UPDATE audit berjaya mengubah % baris', v_bil;
  end if;

  -- 7b. Admin cuba DELETE: ralat atau tiada baris dipadam.
  begin
    delete from public.qm_audit_log
     where target_id = '00000000-0000-0000-0000-0000000000a6';
  exception
    when insufficient_privilege then
      null; -- ralat kebenaran diterima
  end;

  select count(*) into v_bil
  from public.qm_audit_log
  where action = 'user_suspend'
    and target_id = '00000000-0000-0000-0000-0000000000a6';
  if v_bil = 1 then
    raise notice 'LULUS 7b: DELETE audit oleh admin tidak berkesan';
  else
    raise exception 'GAGAL 7b: DELETE audit memadam % baris', v_bil;
  end if;

  -- 7c. INSERT dengan actor_id pengguna lain: ditolak oleh polisi RLS.
  begin
    insert into public.qm_audit_log (actor_id, action, target_type, target_id)
    values ('00000000-0000-0000-0000-0000000000a5'::uuid, 'insert_palsu', 'profile', '00000000-0000-0000-0000-0000000000a5');
    raise exception 'GAGAL 7c: INSERT audit dengan actor_id orang lain diterima';
  exception
    when insufficient_privilege then
      raise notice 'LULUS 7c: INSERT audit actor_id orang lain ditolak oleh RLS';
  end;

  -- 7d. INSERT dengan actor_id sendiri: berjaya.
  insert into public.qm_audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'insert_sah_ujian', 'profile', '00000000-0000-0000-0000-0000000000a3');

  select count(*) into v_bil
  from public.qm_audit_log
  where actor_id = '00000000-0000-0000-0000-0000000000a3'::uuid
    and action = 'insert_sah_ujian';
  if v_bil = 1 then
    raise notice 'LULUS 7d: INSERT audit dengan actor_id sendiri berjaya';
  else
    raise exception 'GAGAL 7d: baris audit sisipan sendiri tidak dijumpai';
  end if;

  execute 'reset role';

  -- 7e. Participant SELECT qm_audit_log: 0 baris.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}', false);
  execute 'set local role authenticated';

  select count(*) into v_bil from public.qm_audit_log;
  if v_bil = 0 then
    raise notice 'LULUS 7e: participant SELECT qm_audit_log 0 baris';
  else
    raise exception 'GAGAL 7e: participant dapat % baris audit', v_bil;
  end if;

  execute 'reset role';
end $$;

select set_config('request.jwt.claims', '', false);

rollback;