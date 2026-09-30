-- V2-014.sql: Insights markah kelas (migrasi 0051).
--
-- PERLU DIJALANKAN OLEH CTO PADA VPS (agen tiada akses pangkalan data):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/tests/V2-014.sql
--
-- PERLU MIGRASI 0051 DAHULU (fungsi qm_boleh_urus_insights,
-- qm_aktiviti_terakhir_ahli, qm_engagement_summary dan qm_at_risk_summary
-- baharu, serta qm_insights_kelas).
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya (ROLLBACK), jadi tiada data ujian kekal. Semua semakan
-- dihadkan kepada data ujian sendiri (ID unik) kerana pangkalan data
-- sebenar sudah memuat data produksi. Setiap semakan memaparkan LULUS
-- atau GAGAL melalui RAISE NOTICE; GAGAL menghentikan skrip.
--
-- Disemak di sini:
--   1. Pra-syarat: lima fungsi wujud, ditarik daripada anon/PUBLIC,
--      diberi kepada authenticated dan service_role.
--   2. Kebenaran: ahli kelas, educator belum diterima dan pengguna lain
--      ditolak (Forbidden) bagi insights, engagement dan at_risk; admin
--      aktif dan educator diterima berjaya.
--   3. qm_aktiviti_terakhir_ahli: kosong tanpa kebenaran, 6 baris bagi
--      educator, aktiviti gabungan (acara tanpa class_id).
--   4. engagement kelas A: unique_users = 6 (ahli, bukan acara),
--      active_30d termasuk ahli yang hanya aktif melalui jawapan Live
--      Quiz, at_risk_inactive_7d betul.
--   5. engagement NULL: educator A hanya nampak 6 ahli kelasnya (bukan
--      pengguna kelas B), pemilik A dan B nampak 7, pengguna lain 0.
--   6. at_risk kelas A: ahli aktif melalui acara tanpa class_id ada
--      days_since_event < 999.
--   7. insights kelas A: pulse (members, live_participation_pct,
--      accuracy_pct, pending_reviews), rank seri, flags never_live dan
--      bottom_20, trend pct, agihan, hard_questions susunan dan
--      top_wrong_choice, hard_challenges, teams top_member_share_pct
--      dan flag_unbalanced.

begin;

-- ============================================================
-- 0. Data asas (semua ID hex sah supaya UUID sah)
-- ============================================================
-- b1 pemilik kelas A dan B, b2 educator A diterima, b3 educator A belum
-- diterima, b4 Ali (ahli A, aktif), b5 Siti (ahli A, acara tanpa class_id),
-- b6 Budi (ahli B sahaja), b7 admin, b8 pengguna lain, b9 Abu (ahli A,
-- hanya aktif melalui Live Quiz), ba Bakar (ahli A, ditolak 10 hari),
-- bb Chik (ahli A, tidak aktif), bc Daud (ahli A, tidak aktif).
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'v2-014-pemilik@ujian.invalid',   'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', 'v2-014-edu-ya@ujian.invalid',    'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b3', 'v2-014-edu-tidak@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b4', 'v2-014-ali@ujian.invalid',       'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b5', 'v2-014-siti@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b6', 'v2-014-budi@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b7', 'v2-014-admin@ujian.invalid',     'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b8', 'v2-014-luar@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b9', 'v2-014-abu@ujian.invalid',       'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000ba', 'v2-014-bakar@ujian.invalid',     'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000bb', 'v2-014-chik@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000bc', 'v2-014-daud@ujian.invalid',      'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

-- Buang profil auto (pencetus qm_handle_new_user) supaya sisipan eksplisit
-- di bawah tidak berlanggar pada kunci utama.
delete from public.qm_profiles
 where id in ('00000000-0000-0000-0000-0000000000b1'::uuid,
              '00000000-0000-0000-0000-0000000000b2'::uuid,
              '00000000-0000-0000-0000-0000000000b3'::uuid,
              '00000000-0000-0000-0000-0000000000b4'::uuid,
              '00000000-0000-0000-0000-0000000000b5'::uuid,
              '00000000-0000-0000-0000-0000000000b6'::uuid,
              '00000000-0000-0000-0000-0000000000b7'::uuid,
              '00000000-0000-0000-0000-0000000000b8'::uuid,
              '00000000-0000-0000-0000-0000000000b9'::uuid,
              '00000000-0000-0000-0000-0000000000ba'::uuid,
              '00000000-0000-0000-0000-0000000000bb'::uuid,
              '00000000-0000-0000-0000-0000000000bc'::uuid);

-- plan NOT NULL (skema-production.sql baris 5257), diberi jelas di sini.
insert into public.qm_profiles (id, role, display_name, plan, approved, suspended) values
  ('00000000-0000-0000-0000-0000000000b1', 'educator',    'Pemilik Ujian',  'free', true, false),
  ('00000000-0000-0000-0000-0000000000b2', 'educator',    'Educator Ya',    'free', true, false),
  ('00000000-0000-0000-0000-0000000000b3', 'educator',    'Educator Belum', 'free', true, false),
  ('00000000-0000-0000-0000-0000000000b4', 'participant', 'Ali Ahmad',      'free', true, false),
  ('00000000-0000-0000-0000-0000000000b5', 'participant', 'Siti Aminah',    'free', true, false),
  ('00000000-0000-0000-0000-0000000000b6', 'participant', 'Budi',           'free', true, false),
  ('00000000-0000-0000-0000-0000000000b7', 'admin',       'Admin Ujian',    'free', true, false),
  ('00000000-0000-0000-0000-0000000000b8', 'participant', 'Orang Luar',     'free', true, false),
  ('00000000-0000-0000-0000-0000000000b9', 'participant', 'Abu Bakar',      'free', true, false),
  ('00000000-0000-0000-0000-0000000000ba', 'participant', 'Bakar',          'free', true, false),
  ('00000000-0000-0000-0000-0000000000bb', 'participant', 'Chik',           'free', true, false),
  ('00000000-0000-0000-0000-0000000000bc', 'participant', 'Daud',           'free', true, false);

-- ca kelas A (6 ahli), cb kelas B (1 ahli).
insert into public.qm_classes (id, owner_id, name, color, join_code) values
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b1', 'Kelas A Ujian V2-014', '#6366f1', 'V214AABB'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000b1', 'Kelas B Ujian V2-014', '#22c55e', 'V214BBCC');

-- Ahli A: b4, b5, b9, ba, bb, bc. Budi (b6) dalam kelas B sahaja.
-- b4 baru sertai; lima lagi sudah 10 hari supaya at_risk bermakna.
insert into public.qm_class_members (class_id, user_id, joined_at) values
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b4', now()),
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b5', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b9', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000ba', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000bb', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000bc', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000b6', now());

insert into public.qm_class_educators (class_id, educator_id, role, invited_by, accepted_at) values
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b2', 'co_creator', '00000000-0000-0000-0000-0000000000b1', now()),
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b3', 'co_creator', '00000000-0000-0000-0000-0000000000b1', null);

-- Dua pasukan kelas A: Alpha (b4, b5), Beta (b9, ba).
insert into public.qm_teams (id, class_id, name, score) values
  ('00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-0000000000ca', 'Pasukan Alpha', 0),
  ('00000000-0000-0000-0000-0000000000db', '00000000-0000-0000-0000-0000000000ca', 'Pasukan Beta', 0);

insert into public.qm_team_members (team_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-0000000000b4', 'member'),
  ('00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-0000000000b5', 'member'),
  ('00000000-0000-0000-0000-0000000000db', '00000000-0000-0000-0000-0000000000b9', 'leader'),
  ('00000000-0000-0000-0000-0000000000db', '00000000-0000-0000-0000-0000000000ba', 'member');

-- Hunt kelas A dengan dua cabaran 10 mata.
insert into public.qm_hunts (id, owner_id, class_id, title) values
  ('00000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000ca', 'Hunt Ujian V2-014');

insert into public.qm_challenges (id, hunt_id, title, prompt, answer, points, order_idx) values
  ('00000000-0000-0000-0000-0000000000cd', '00000000-0000-0000-0000-0000000000cc', 'Cabaran Satu', 'Berapa?', '42', 10, 1),
  ('00000000-0000-0000-0000-0000000000ce', '00000000-0000-0000-0000-0000000000cc', 'Cabaran Dua', 'Siapa?', 'Ku', 10, 2);

-- Submission: c1 ada 1 approved + 2 pending; c2 ada 1 approved + 1 rejected.
insert into public.qm_submissions (challenge_id, team_id, user_id, answer, status, created_at) values
  ('00000000-0000-0000-0000-0000000000cd', null, '00000000-0000-0000-0000-0000000000b4', '42', 'approved', now()),
  ('00000000-0000-0000-0000-0000000000cd', null, '00000000-0000-0000-0000-0000000000b9', 'x',  'pending',  now() - interval '45 days'),
  ('00000000-0000-0000-0000-0000000000cd', null, '00000000-0000-0000-0000-0000000000b5', 'y',  'pending',  now() - interval '4 days'),
  ('00000000-0000-0000-0000-0000000000ce', null, '00000000-0000-0000-0000-0000000000b4', 'Ku', 'approved', now()),
  ('00000000-0000-0000-0000-0000000000ce', null, '00000000-0000-0000-0000-0000000000ba', 'z',  'rejected', now() - interval '10 days');

-- Kuiz langsung kelas A: 2 soalan 1000 mata, 2 sesi ended.
insert into public.qm_live_quizzes (id, class_id, owner_id, title) values
  ('00000000-0000-0000-0000-0000000000cf', '00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000b1', 'Kuiz Kelas A Ujian V2-014');

insert into public.qm_live_questions (id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000cf', 1, 'Ibu negara Perancis?',
   '[{"key":"A","text":"Paris"},{"key":"B","text":"Lyon"},{"key":"C","text":"Nice"}]'::jsonb, 'A', 1000, 20),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000cf', 2, 'Dua darab tiga?',
   '[{"key":"A","text":"Lima"},{"key":"B","text":"Enam"},{"key":"C","text":"Tujuh"}]'::jsonb, 'B', 1000, 20);

insert into public.qm_live_sessions (id, quiz_id, host_id, code, status, created_at, ended_at) values
  ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000000cf', '00000000-0000-0000-0000-0000000000b1', 'TKAA23', 'ended', now() - interval '3 days', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000cf', '00000000-0000-0000-0000-0000000000b1', 'TKBB34', 'ended', now() - interval '1 day', now() - interval '1 day');

-- Pemain: b4 main kedua-dua sesi (1500, 800), b9 sesi pertama sahaja (500).
insert into public.qm_live_players (id, session_id, nickname, user_id, player_token, score, joined_at) values
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d0', 'Ali Ahmad', '00000000-0000-0000-0000-0000000000b4', lpad('d4', 32, 'a'), 1500, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d0', 'Abu Bakar', '00000000-0000-0000-0000-0000000000b9', lpad('d5', 32, 'a'), 500, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000d1', 'Ali Ahmad', '00000000-0000-0000-0000-0000000000b4', lpad('d6', 32, 'a'), 800, now() - interval '1 day');

-- Jawapan: q1 2 betul 1 salah, q2 1 betul 2 salah (dua salah pilih A).
insert into public.qm_live_answers (session_id, player_id, question_id, choice_key, is_correct, ms_taken, points_awarded, created_at) values
  ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d2', 'A', true,  3000, 900, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d3', 'B', true,  4000, 800, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d2', 'A', true,  5000, 900, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d3', 'A', false, 6000, 0,   now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000d2', 'C', false, 2000, 0,   now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000d3', 'A', false, 3000, 0,   now() - interval '1 day');

-- Acara analitik: Siti (b5) ada satu page_view TANPA class_id 2 hari lepas
-- (corak sebenar produksi), Budi (b6 kelas B) juga tanpa class_id hari ini.
insert into public.qm_analytics_events (user_id, event_type, path, class_id, created_at) values
  ('00000000-0000-0000-0000-0000000000b5', 'page_view', '/dashboard', null, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000b6', 'page_view', '/dashboard', null, now());

-- ============================================================
-- 1. Pra-syarat migrasi 0051
-- ============================================================
do $$
declare
  v_bil int;
begin
  select count(*) into v_bil
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('qm_boleh_urus_insights', 'qm_aktiviti_terakhir_ahli',
                      'qm_engagement_summary', 'qm_at_risk_summary',
                      'qm_insights_kelas');
  if v_bil = 5 then
    raise notice 'LULUS 1a: lima fungsi insights wujud';
  else
    raise exception 'GAGAL 1a: % daripada 5 fungsi wujud (migrasi 0051 belum dijalankan?)', v_bil;
  end if;

  if has_function_privilege('anon', 'public.qm_boleh_urus_insights(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.qm_aktiviti_terakhir_ahli(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.qm_engagement_summary(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.qm_at_risk_summary(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.qm_insights_kelas(uuid)', 'EXECUTE') then
    raise exception 'GAGAL 1b: anon masih boleh melaksanakan salah satu fungsi';
  else
    raise notice 'LULUS 1b: anon tidak boleh melaksanakan kelima-lima fungsi';
  end if;

  if has_function_privilege('authenticated', 'public.qm_boleh_urus_insights(uuid)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.qm_boleh_urus_insights(uuid)', 'EXECUTE')
     and has_function_privilege('authenticated', 'public.qm_aktiviti_terakhir_ahli(uuid)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.qm_aktiviti_terakhir_ahli(uuid)', 'EXECUTE')
     and has_function_privilege('authenticated', 'public.qm_engagement_summary(uuid)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.qm_engagement_summary(uuid)', 'EXECUTE')
     and has_function_privilege('authenticated', 'public.qm_at_risk_summary(uuid)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.qm_at_risk_summary(uuid)', 'EXECUTE')
     and has_function_privilege('authenticated', 'public.qm_insights_kelas(uuid)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.qm_insights_kelas(uuid)', 'EXECUTE') then
    raise notice 'LULUS 1c: authenticated dan service_role boleh melaksanakan kelima-lima fungsi';
  else
    raise exception 'GAGAL 1c: geran EXECUTE hilang pada salah satu fungsi';
  end if;
end $$;

-- ============================================================
-- 2. Kebenaran: Forbidden bagi yang tidak berhak
-- ============================================================
do $$
declare
  v_res jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', false);
  execute 'set local role authenticated';
  begin
    v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
    raise exception 'GAGAL 2a: ahli kelas A sepatutnya Forbidden bagi insights';
  exception when others then
    if sqlerrm <> 'Forbidden' then
      raise exception 'GAGAL 2a: ralat tidak dijangka: %', sqlerrm;
    end if;
  end;
  begin
    v_res := public.qm_engagement_summary('00000000-0000-0000-0000-0000000000ca');
    raise exception 'GAGAL 2a: ahli kelas A sepatutnya Forbidden bagi engagement';
  exception when others then
    if sqlerrm <> 'Forbidden' then
      raise exception 'GAGAL 2a: ralat engagement tidak dijangka: %', sqlerrm;
    end if;
  end;
  begin
    v_res := public.qm_at_risk_summary('00000000-0000-0000-0000-0000000000ca');
    raise exception 'GAGAL 2a: ahli kelas A sepatutnya Forbidden bagi at_risk';
  exception when others then
    if sqlerrm <> 'Forbidden' then
      raise exception 'GAGAL 2a: ralat at_risk tidak dijangka: %', sqlerrm;
    end if;
  end;
  execute 'reset role';
  raise notice 'LULUS 2a: ahli kelas A ditolak bagi insights, engagement dan at_risk';
end $$;

do $$
declare
  v_res jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', false);
  execute 'set local role authenticated';
  begin
    v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
    raise exception 'GAGAL 2b: educator belum diterima sepatutnya Forbidden';
  exception when others then
    if sqlerrm <> 'Forbidden' then
      raise exception 'GAGAL 2b: ralat tidak dijangka: %', sqlerrm;
    end if;
  end;
  execute 'reset role';
  raise notice 'LULUS 2b: educator jemputan belum diterima ditolak';
end $$;

do $$
declare
  v_res jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated"}', false);
  execute 'set local role authenticated';
  begin
    v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
    raise exception 'GAGAL 2c: pengguna lain sepatutnya Forbidden';
  exception when others then
    if sqlerrm <> 'Forbidden' then
      raise exception 'GAGAL 2c: ralat tidak dijangka: %', sqlerrm;
    end if;
  end;
  execute 'reset role';
  raise notice 'LULUS 2c: pengguna lain ditolak';
end $$;

-- Admin aktif dan educator diterima berjaya.
do $$
declare
  v_res jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';
  if (v_res -> 'pulse' ->> 'members')::int = 6 then
    raise notice 'LULUS 2d: admin aktif boleh memanggil insights';
  else
    raise exception 'GAGAL 2d: insights admin memulangkan members=%', v_res -> 'pulse' ->> 'members';
  end if;
end $$;

do $$
declare
  v_res jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';
  if (v_res -> 'pulse' ->> 'members')::int = 6 then
    raise notice 'LULUS 2e: educator diterima boleh memanggil insights';
  else
    raise exception 'GAGAL 2e: insights educator memulangkan members=%', v_res -> 'pulse' ->> 'members';
  end if;
end $$;

-- ============================================================
-- 3. qm_aktiviti_terakhir_ahli
-- ============================================================
do $$
declare
  v_bil int;
  v_aktif timestamptz;
begin
  -- Ahli kelas (b4) tidak dibenarkan: kosong.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_aktiviti_terakhir_ahli('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';
  if v_bil = 0 then
    raise notice 'LULUS 3a: ahli tanpa kebenaran dapat 0 baris';
  else
    raise exception 'GAGAL 3a: ahli dapat % baris (jangka 0)', v_bil;
  end if;

  -- Educator diterima: 6 ahli, aktiviti Siti = acara 2 hari lepas.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_aktiviti_terakhir_ahli('00000000-0000-0000-0000-0000000000ca');
  select t.last_active into v_aktif
    from public.qm_aktiviti_terakhir_ahli('00000000-0000-0000-0000-0000000000ca') t
   where t.user_id = '00000000-0000-0000-0000-0000000000b5';
  execute 'reset role';
  if v_bil = 6 then
    raise notice 'LULUS 3b: educator diterima dapat 6 baris';
  else
    raise exception 'GAGAL 3b: educator diterima dapat % baris (jangka 6)', v_bil;
  end if;
  if v_aktif > now() - interval '3 days' and v_aktif < now() - interval '1 day' then
    raise notice 'LULUS 3c: aktiviti Siti dari acara tanpa class_id (2 hari lepas)';
  else
    raise exception 'GAGAL 3c: aktiviti Siti = % (jangka 2 hari lepas)', v_aktif;
  end if;
end $$;

-- ============================================================
-- 4. engagement kelas A sebagai pemilik
-- ============================================================
do $$
declare
  v_res jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_engagement_summary('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';

  -- Bentuk JSON kekal sama.
  if v_res ? 'class_id' and v_res ? 'totals' and v_res ? 'inactivity'
     and v_res ? 'daily' and v_res ? 'hourly'
     and (v_res -> 'totals') ? 'total_events' and (v_res -> 'totals') ? 'unique_users'
     and (v_res -> 'inactivity') ? 'active_30d'
     and (v_res -> 'inactivity') ? 'at_risk_inactive_7d' then
    raise notice 'LULUS 4a: bentuk JSON engagement kekal';
  else
    raise exception 'GAGAL 4a: kunci JSON hilang: %', v_res;
  end if;

  if (v_res -> 'totals' ->> 'unique_users')::int = 6 then
    raise notice 'LULUS 4b: unique_users = 6 (bilangan ahli, bukan 0)';
  else
    raise exception 'GAGAL 4b: unique_users = % (jangka 6)', v_res -> 'totals' ->> 'unique_users';
  end if;

  -- Siti aktif 2 hari, Abu 3 hari (hanya melalui jawapan Live Quiz),
  -- Ali hari ini. ba ada submission ditolak 10 hari lepas (aktiviti nyata,
  -- jadi dikira dalam 30 hari). bb dan bc hanya sertai 10 hari lepas; sertai
  -- BUKAN aktiviti (pembetulan CTO: jangkaan asal 3 terlepas submission ba).
  if (v_res -> 'inactivity' ->> 'active_30d')::int = 4 then
    raise notice 'LULUS 4c: active_30d = 4 (termasuk ahli aktif melalui Live Quiz sahaja, sertai tidak dikira)';
  else
    raise exception 'GAGAL 4c: active_30d = % (jangka 4)', v_res -> 'inactivity' ->> 'active_30d';
  end if;

  if (v_res -> 'inactivity' ->> 'active_7d')::int = 3
     and (v_res -> 'inactivity' ->> 'active_1d')::int = 1 then
    raise notice 'LULUS 4d: active_7d = 3 dan active_1d = 1';
  else
    raise exception 'GAGAL 4d: active_7d = %, active_1d = % (jangka 3, 1)',
      v_res -> 'inactivity' ->> 'active_7d', v_res -> 'inactivity' ->> 'active_1d';
  end if;

  if (v_res -> 'inactivity' ->> 'at_risk_inactive_7d')::int = 3 then
    raise notice 'LULUS 4e: at_risk_inactive_7d = 3';
  else
    raise exception 'GAGAL 4e: at_risk_inactive_7d = % (jangka 3)',
      v_res -> 'inactivity' ->> 'at_risk_inactive_7d';
  end if;

  -- Hanya acara Siti dikira (acara Budi kelas B tidak); tiada tapis class_id.
  if (v_res -> 'totals' ->> 'total_events')::int = 1
     and (v_res -> 'totals' ->> 'page_views')::int = 1 then
    raise notice 'LULUS 4f: total_events = 1 (acara ahli tanpa tapis class)';
  else
    raise exception 'GAGAL 4f: total_events = % (jangka 1)', v_res -> 'totals' ->> 'total_events';
  end if;

  -- daily dan hourly menggabungkan submission dan jawapan Live Quiz.
  if jsonb_array_length(v_res -> 'daily') >= 1
     and jsonb_array_length(v_res -> 'hourly') >= 1 then
    raise notice 'LULUS 4g: daily dan hourly tidak kosong';
  else
    raise exception 'GAGAL 4g: daily atau hourly kosong';
  end if;
end $$;

-- ============================================================
-- 5. engagement NULL: kebocoran merentas kelas ditutup
-- ============================================================
do $$
declare
  v_res jsonb;
begin
  -- Educator A (b2): hanya kelas A. Budi (b6) ada acara hari ini tetapi
  -- bukan ahli kelas yang educator A urus.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_engagement_summary(null);
  execute 'reset role';
  if (v_res -> 'totals' ->> 'unique_users')::int = 6 then
    raise notice 'LULUS 5a: engagement NULL educator A = 6 ahli (tiada kebocoran kelas B)';
  else
    raise exception 'GAGAL 5a: engagement NULL educator A = % ahli (jangka 6)',
      v_res -> 'totals' ->> 'unique_users';
  end if;

  -- Pemilik A dan B (b1): gabungan 6 + 1 ahli.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_engagement_summary(null);
  execute 'reset role';
  if (v_res -> 'totals' ->> 'unique_users')::int = 7 then
    raise notice 'LULUS 5b: engagement NULL pemilik A dan B = 7 ahli';
  else
    raise exception 'GAGAL 5b: engagement NULL pemilik = % ahli (jangka 7)',
      v_res -> 'totals' ->> 'unique_users';
  end if;

  -- Pengguna tanpa kelas (b8): 0, tanpa ralat.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_engagement_summary(null);
  execute 'reset role';
  if (v_res -> 'totals' ->> 'unique_users')::int = 0 then
    raise notice 'LULUS 5c: engagement NULL pengguna luar = 0 ahli';
  else
    raise exception 'GAGAL 5c: engagement NULL pengguna luar = % ahli (jangka 0)',
      v_res -> 'totals' ->> 'unique_users';
  end if;
end $$;

-- ============================================================
-- 6. at_risk kelas A sebagai educator diterima
-- ============================================================
do $$
declare
  v_res jsonb;
  v_siti jsonb;
  v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_at_risk_summary('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';

  select jsonb_array_length(v_res -> 'students') into v_bil;
  if v_bil = 6 then
    raise notice 'LULUS 6a: at_risk memulangkan 6 pelajar';
  else
    raise exception 'GAGAL 6a: at_risk memulangkan % pelajar (jangka 6)', v_bil;
  end if;

  select to_jsonb(e) into v_siti
    from jsonb_array_elements(v_res -> 'students') e
   where e ->> 'user_id' = '00000000-0000-0000-0000-0000000000b5';
  if v_siti is null then
    raise exception 'GAGAL 6b: Siti tiada dalam at_risk';
  end if;
  if (v_siti ->> 'days_since_event')::int < 999 then
    raise notice 'LULUS 6b: Siti aktif melalui acara tanpa class_id, days_since_event = %',
      v_siti ->> 'days_since_event';
  else
    raise exception 'GAGAL 6b: days_since_event Siti = % (sepatutnya < 999)',
      v_siti ->> 'days_since_event';
  end if;
  if v_siti ->> 'last_event_at' is not null then
    raise notice 'LULUS 6c: last_event_at Siti daripada aktiviti gabungan';
  else
    raise exception 'GAGAL 6c: last_event_at Siti kosong';
  end if;
end $$;

-- ============================================================
-- 7. insights kelas A: pulse
-- ============================================================
do $$
declare
  v_res jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';

  if (v_res -> 'pulse' ->> 'members')::int = 6 then
    raise notice 'LULUS 7a: pulse.members = 6';
  else
    raise exception 'GAGAL 7a: pulse.members = %', v_res -> 'pulse' ->> 'members';
  end if;

  -- b4 (1500+800) dan b9 (500) pernah main: 2/6.
  if (v_res -> 'pulse' ->> 'live_participation_pct')::numeric = 33.3 then
    raise notice 'LULUS 7b: live_participation_pct = 33.3';
  else
    raise exception 'GAGAL 7b: live_participation_pct = % (jangka 33.3)',
      v_res -> 'pulse' ->> 'live_participation_pct';
  end if;

  -- 3 betul daripada 6 jawapan.
  if (v_res -> 'pulse' ->> 'accuracy_pct')::numeric = 50.0 then
    raise notice 'LULUS 7c: accuracy_pct = 50.0';
  else
    raise exception 'GAGAL 7c: accuracy_pct = % (jangka 50.0)',
      v_res -> 'pulse' ->> 'accuracy_pct';
  end if;

  -- b9 dan Siti pending pada cabaran kelas.
  if (v_res -> 'pulse' ->> 'pending_reviews')::int = 2 then
    raise notice 'LULUS 7d: pending_reviews = 2';
  else
    raise exception 'GAGAL 7d: pending_reviews = % (jangka 2)',
      v_res -> 'pulse' ->> 'pending_reviews';
  end if;

  if (v_res -> 'pulse' ->> 'live_sessions')::int = 2 then
    raise notice 'LULUS 7e: live_sessions = 2';
  else
    raise exception 'GAGAL 7e: live_sessions = % (jangka 2)',
      v_res -> 'pulse' ->> 'live_sessions';
  end if;

  -- Purata (2320+500)/6 dan median 0 (empat ahli kosong).
  if (v_res -> 'pulse' ->> 'avg_total')::numeric = 470
     and (v_res -> 'pulse' ->> 'median_total')::numeric = 0 then
    raise notice 'LULUS 7f: avg_total = 470.0 dan median_total = 0';
  else
    raise exception 'GAGAL 7f: avg_total = %, median_total = % (jangka 470.0, 0)',
      v_res -> 'pulse' ->> 'avg_total', v_res -> 'pulse' ->> 'median_total';
  end if;
end $$;

-- ============================================================
-- 8. insights kelas A: students, rank, flags, trend
-- ============================================================
do $$
declare
  v_res jsonb;
  v_ali jsonb;
  v_siti jsonb;
  v_abu jsonb;
  v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';

  select to_jsonb(e) into v_ali
    from jsonb_array_elements(v_res -> 'students') e
   where e ->> 'user_id' = '00000000-0000-0000-0000-0000000000b4';
  if v_ali is null then
    raise exception 'GAGAL 8a: Ali tiada dalam students';
  end if;

  -- Ali: task 20, live 2300, total 2320, kedudukan 1.
  if (v_ali ->> 'task_score')::int = 20
     and (v_ali ->> 'live_score')::int = 2300
     and (v_ali ->> 'total_score')::int = 2320
     and (v_ali ->> 'rank')::int = 1
     and (v_ali ->> 'live_sessions')::int = 2 then
    raise notice 'LULUS 8a: markah Ali betul (2320, kedudukan 1)';
  else
    raise exception 'GAGAL 8a: Ali task=% live=% total=% rank=% sesi=%',
      v_ali ->> 'task_score', v_ali ->> 'live_score', v_ali ->> 'total_score',
      v_ali ->> 'rank', v_ali ->> 'live_sessions';
  end if;

  if (v_ali ->> 'answered')::int = 4
     and (v_ali ->> 'correct')::int = 2
     and (v_ali ->> 'accuracy_pct')::numeric = 50.0
     and (v_ali ->> 'avg_ms')::numeric = 3000 then
    raise notice 'LULUS 8b: jawapan Ali 4/2, ketepatan 50.0, purata 3000.0 ms';
  else
    raise exception 'GAGAL 8b: Ali answered=% correct=% acc=% avg=%',
      v_ali ->> 'answered', v_ali ->> 'correct', v_ali ->> 'accuracy_pct', v_ali ->> 'avg_ms';
  end if;

  if (v_ali ->> 'approved')::int = 2
     and (v_ali ->> 'pending')::int = 0
     and (v_ali ->> 'rejected')::int = 0
     and v_ali ->> 'team_name' = 'Pasukan Alpha'
     and v_ali ->> 'last_active' is not null then
    raise notice 'LULUS 8c: submission dan pasukan Ali betul';
  else
    raise exception 'GAGAL 8c: Ali approved=% pending=% rejected=% pasukan=%',
      v_ali ->> 'approved', v_ali ->> 'pending', v_ali ->> 'rejected', v_ali ->> 'team_name';
  end if;

  -- Trend Ali: sesi pertama pct 75.0 (1500/2000), kedua 40.0 (800/2000).
  if jsonb_array_length(v_ali -> 'trend') = 2
     and (v_ali -> 'trend' -> 0 ->> 'session_id') = '00000000-0000-0000-0000-0000000000d0'
     and (v_ali -> 'trend' -> 0 ->> 'pct')::numeric = 75.0
     and (v_ali -> 'trend' -> 1 ->> 'pct')::numeric = 40.0 then
    raise notice 'LULUS 8d: trend Ali dua sesi, pct 75.0 kemudian 40.0';
  else
    raise exception 'GAGAL 8d: trend Ali = %', v_ali -> 'trend';
  end if;

  -- Ali tidak ada bendera (aktif, bukan bawah 20%, pernah main).
  if v_ali -> 'flags' = '[]'::jsonb then
    raise notice 'LULUS 8e: Ali tiada bendera';
  else
    raise exception 'GAGAL 8e: Ali ada bendera %', v_ali -> 'flags';
  end if;

  -- Seri berkongsi kedudukan: empat ahli kosong berkongsi kedudukan 3.
  select count(*) into v_bil
    from jsonb_array_elements(v_res -> 'students') e
   where (e ->> 'rank')::int = 3;
  if v_bil = 4 then
    raise notice 'LULUS 8f: empat ahli berkongsi kedudukan 3';
  else
    raise exception 'GAGAL 8f: % ahli pada kedudukan 3 (jangka 4)', v_bil;
  end if;

  -- Siti: bottom_20, never_live, pending_old; TIDAK inactive_7d.
  select to_jsonb(e) into v_siti
    from jsonb_array_elements(v_res -> 'students') e
   where e ->> 'user_id' = '00000000-0000-0000-0000-0000000000b5';
  if v_siti is null then
    raise exception 'GAGAL 8g: Siti tiada dalam students';
  end if;
  if (v_siti -> 'flags') ? 'bottom_20'
     and (v_siti -> 'flags') ? 'never_live'
     and (v_siti -> 'flags') ? 'pending_old'
     and not ((v_siti -> 'flags') ? 'inactive_7d') then
    raise notice 'LULUS 8g: bendera Siti bottom_20, never_live, pending_old (bukan inactive)';
  else
    raise exception 'GAGAL 8g: bendera Siti = %', v_siti -> 'flags';
  end if;

  -- Abu (total 500, pernah main): bukan bottom_20, tetapi pending lama.
  select to_jsonb(e) into v_abu
    from jsonb_array_elements(v_res -> 'students') e
   where e ->> 'user_id' = '00000000-0000-0000-0000-0000000000b9';
  if v_abu is null then
    raise exception 'GAGAL 8h: Abu tiada dalam students';
  end if;
  if (v_abu ->> 'rank')::int = 2
     and not ((v_abu -> 'flags') ? 'bottom_20')
     and not ((v_abu -> 'flags') ? 'never_live')
     and (v_abu -> 'flags') ? 'pending_old' then
    raise notice 'LULUS 8h: Abu kedudukan 2, bukan bottom_20, pending_old';
  else
    raise exception 'GAGAL 8h: Abu rank=% bendera=%',
      v_abu ->> 'rank', v_abu -> 'flags';
  end if;

  -- Chik: tidak aktif dan tidak pernah main.
  select count(*) into v_bil
    from jsonb_array_elements(v_res -> 'students') e
   where e ->> 'user_id' = '00000000-0000-0000-0000-0000000000bb'
     and (e -> 'flags') ? 'inactive_7d'
     and (e -> 'flags') ? 'never_live'
     and (e -> 'flags') ? 'bottom_20';
  if v_bil = 1 then
    raise notice 'LULUS 8i: Chik inactive_7d, never_live, bottom_20';
  else
    raise exception 'GAGAL 8i: Chik tidak mendapat tiga bendera';
  end if;
end $$;

-- ============================================================
-- 9. insights kelas A: agihan
-- ============================================================
do $$
declare
  v_res jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';

  -- Total [0,0,0,0,500,2320]: lebar 232; bin 0 empat, bin 9 satu.
  if jsonb_array_length(v_res -> 'distribution' -> 'total') = 10
     and (v_res -> 'distribution' -> 'total' -> 0 ->> 'count')::int = 4
     and (v_res -> 'distribution' -> 'total' -> 9 ->> 'count')::int = 1
     and (v_res -> 'distribution' -> 'total' -> 9 ->> 'to')::numeric = 2320 then
    raise notice 'LULUS 9a: agihan total 10 bin, jumlah bin pertama 4, bin akhir 1';
  else
    raise exception 'GAGAL 9a: agihan total = %', v_res -> 'distribution' -> 'total';
  end if;

  -- Task [0,0,0,0,0,20]: bin pertama 5, bin akhir 1.
  if (v_res -> 'distribution' -> 'task' -> 0 ->> 'count')::int = 5
     and (v_res -> 'distribution' -> 'task' -> 9 ->> 'count')::int = 1 then
    raise notice 'LULUS 9b: agihan task betul';
  else
    raise exception 'GAGAL 9b: agihan task = %', v_res -> 'distribution' -> 'task';
  end if;

  -- Live [0,0,0,0,500,2300].
  if (v_res -> 'distribution' -> 'live' -> 0 ->> 'count')::int = 4
     and (v_res -> 'distribution' -> 'live' -> 2 ->> 'count')::int = 1 then
    raise notice 'LULUS 9c: agihan live betul';
  else
    raise exception 'GAGAL 9c: agihan live = %', v_res -> 'distribution' -> 'live';
  end if;
end $$;

-- ============================================================
-- 10. insights kelas A: hard_questions
-- ============================================================
do $$
declare
  v_res jsonb;
  v_q jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';

  -- Kedua-dua soalan dijawab 3 kali, jadi dua baris.
  if jsonb_array_length(v_res -> 'hard_questions') = 2 then
    raise notice 'LULUS 10a: dua soalan susar (>= 3 jawapan)';
  else
    raise exception 'GAGAL 10a: % soalan susar (jangka 2)',
      jsonb_array_length(v_res -> 'hard_questions');
  end if;

  -- Susunan correct_pct menaik: soalan kedua (33.3) dahulu.
  if (v_res -> 'hard_questions' -> 0 ->> 'question_id') = '00000000-0000-0000-0000-0000000000d3'
     and (v_res -> 'hard_questions' -> 0 ->> 'correct_pct')::numeric = 33.3
     and (v_res -> 'hard_questions' -> 1 ->> 'question_id') = '00000000-0000-0000-0000-0000000000d2'
     and (v_res -> 'hard_questions' -> 1 ->> 'correct_pct')::numeric = 66.7 then
    raise notice 'LULUS 10b: susunan correct_pct menaik';
  else
    raise exception 'GAGAL 10b: susunan hard_questions salah: %', v_res -> 'hard_questions';
  end if;

  -- Soalan kedua: salah paling kerap ialah A (Lima) dua kali; kunci betul
  -- tidak bocor, hanya label Beta.
  select to_jsonb(e) into v_q
    from jsonb_array_elements(v_res -> 'hard_questions') e
   where e ->> 'question_id' = '00000000-0000-0000-0000-0000000000d3';
  if v_q is null then
    raise exception 'GAGAL 10c: soalan kedua tiada';
  end if;
  if (v_q -> 'top_wrong_choice' ->> 'key') = 'A'
     and (v_q -> 'top_wrong_choice' ->> 'label') = 'Lima'
     and (v_q -> 'top_wrong_choice' ->> 'count')::int = 2
     and v_q ->> 'correct_label' = 'Beta'
     and v_q ->> 'correct_key' is null
     and (v_q ->> 'answered')::int = 3
     and (v_q ->> 'avg_ms')::numeric = 4333.3 then
    raise notice 'LULUS 10c: top_wrong_choice A (Lima) dua kali, correct_label Beta, tiada correct_key';
  else
    raise exception 'GAGAL 10c: soalan kedua = %', v_q;
  end if;
end $$;

-- ============================================================
-- 11. insights kelas A: hard_challenges
-- ============================================================
do $$
declare
  v_res jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';

  -- Kedua-dua cabaran ada >= 2 submission.
  if jsonb_array_length(v_res -> 'hard_challenges') = 2 then
    raise notice 'LULUS 11a: dua cabaran susar';
  else
    raise exception 'GAGAL 11a: % cabaran susar (jangka 2)',
      jsonb_array_length(v_res -> 'hard_challenges');
  end if;

  -- Cabaran Dua (1 approved 1 rejected, 50%) dahulu, susunan menurun.
  if (v_res -> 'hard_challenges' -> 0 ->> 'challenge_id') = '00000000-0000-0000-0000-0000000000ce'
     and (v_res -> 'hard_challenges' -> 0 ->> 'rejected_pct')::numeric = 50.0
     and (v_res -> 'hard_challenges' -> 0 ->> 'pending')::int = 0
     and (v_res -> 'hard_challenges' -> 1 ->> 'challenge_id') = '00000000-0000-0000-0000-0000000000cd'
     and (v_res -> 'hard_challenges' -> 1 ->> 'rejected_pct') is null
     and (v_res -> 'hard_challenges' -> 1 ->> 'pending')::int = 2 then
    raise notice 'LULUS 11b: susunan rejected_pct menurun dan pending betul';
  else
    raise exception 'GAGAL 11b: hard_challenges = %', v_res -> 'hard_challenges';
  end if;
end $$;

-- ============================================================
-- 12. insights kelas A: teams
-- ============================================================
do $$
declare
  v_res jsonb;
  v_alpha jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000ca');
  execute 'reset role';

  if jsonb_array_length(v_res -> 'teams') = 2 then
    raise notice 'LULUS 12a: dua pasukan kelas A';
  else
    raise exception 'GAGAL 12a: % pasukan (jangka 2)', jsonb_array_length(v_res -> 'teams');
  end if;

  select to_jsonb(e) into v_alpha
    from jsonb_array_elements(v_res -> 'teams') e
   where e ->> 'name' = 'Pasukan Alpha';
  if v_alpha is null then
    raise exception 'GAGAL 12b: Pasukan Alpha tiada';
  end if;

  -- Ali 2320 berbanding jumlah 2320: 100% oleh seorang, tidak seimbang.
  if (v_alpha ->> 'members')::int = 2
     and (v_alpha ->> 'top_member_share_pct')::numeric = 100.0
     and (v_alpha ->> 'zero_members')::int = 1
     and (v_alpha -> 'flag_unbalanced')::boolean is true
     and jsonb_array_length(v_alpha -> 'member_ids') = 2 then
    raise notice 'LULUS 12b: share 100.0, satu ahli kosong, tidak seimbang';
  else
    raise exception 'GAGAL 12b: Pasukan Alpha = %', v_alpha;
  end if;
end $$;

-- ============================================================
-- 13. insights: kelas tanpa pasukan (kelas B) dan kunci wajib
-- ============================================================
do $$
declare
  v_res jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  v_res := public.qm_insights_kelas('00000000-0000-0000-0000-0000000000cb');
  execute 'reset role';

  -- Kelas B tiada pasukan: teams kosong, bukan null.
  if v_res -> 'teams' = '[]'::jsonb
     and (v_res -> 'pulse' ->> 'members')::int = 1 then
    raise notice 'LULUS 13a: kelas B tanpa pasukan memulangkan teams kosong';
  else
    raise exception 'GAGAL 13a: teams kelas B = %', v_res -> 'teams';
  end if;

  -- Semua kunci atas tahap wajib ada.
  if v_res ? 'pulse' and v_res ? 'students' and v_res ? 'distribution'
     and v_res ? 'hard_questions' and v_res ? 'hard_challenges'
     and v_res ? 'teams' and v_res ? 'generated_at' then
    raise notice 'LULUS 13b: semua kunci insights wajib ada';
  else
    raise exception 'GAGAL 13b: kunci hilang pada %', v_res;
  end if;
end $$;

select set_config('request.jwt.claims', '', false);
select set_config('request.jwt.role', '', false);

rollback;
