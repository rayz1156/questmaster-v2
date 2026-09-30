-- V2-012.sql: markah Live Quiz disimpan pada akaun dan dikumpul dalam
-- kedudukan kelas.
--
-- PERLU DIJALANKAN OLEH CTO PADA VPS (agen tiada akses pangkalan data):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/tests/V2-012.sql
--
-- PERLU MIGRASI 0049 DAHULU (indeks unik qm_live_players_sesi_pengguna_uniq,
-- jadual sandaran qm_live_players_pautan_0049, fungsi qm_live_paut_pemain_lama
-- dan view qm_class_individual_scores lapan lajur).
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya (ROLLBACK), jadi tiada data ujian kekal. Setiap semakan
-- memaparkan LULUS atau GAGAL melalui RAISE NOTICE; GAGAL menghentikan
-- skrip dengan pengecualian.
--
-- Disemak di sini:
--   1. Pra-syarat: fungsi backfill wujud dan ditarik daripada anon dan
--      authenticated tetapi kekal untuk service_role; indeks unik separa
--      wujud; jadual sandaran wujud dengan RLS hidup tanpa polisi; view
--      mempunyai lapan lajur pada kedudukan betul; geran SELECT
--      authenticated pada view kekal.
--   2. Backfill memautkan Ali dalam S1, S2 dan S3; Amin tidak (dua ahli
--      bernama sama); Siti tidak (dua pemain sesi sama); Orang Luar tidak;
--      pemain kuiz tanpa kelas tidak dipaut.
--   3. Jadual sandaran mengandungi tepat baris yang dipaut; satu baris
--      audit ringkasan ada dengan meta linked dan skipped_ambiguous betul.
--   4. View: live_score Ali 800 (sesi lobby S3 tidak dikira), task 10,
--      adjustment 5, total 815, live_sessions 2; ahli lain kosong.
--   5. Indeks unik: sisipan pemain kedua dengan user_id sama dalam sesi
--      sama gagal dengan SQLSTATE 23505.
--   6. Backfill kali kedua idempoten: tiada pautan baharu, tiada baris
--      sandaran baharu, tiada baris audit baharu.
--   7. Peranan authenticated ditolak memanggil fungsi backfill.

begin;

-- ============================================================
-- 0. Data asas (semua ID hex sah supaya UUID sah)
-- ============================================================
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'v2-012-pendidik@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', 'v2-012-ali@ujian.invalid',     'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a3', 'v2-012-siti@ujian.invalid',     'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a4', 'v2-012-amin1@ujian.invalid',    'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a5', 'v2-012-amin2@ujian.invalid',    'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

-- Buang profil auto dahulu (jika pencetus penciptaan profil tetap berjalan
-- dalam tetapan ini), supaya sisipan eksplisit di bawah tidak berlanggar
-- pada kunci utama.
delete from public.qm_profiles
 where id in ('00000000-0000-0000-0000-0000000000a1'::uuid,
              '00000000-0000-0000-0000-0000000000a2'::uuid,
              '00000000-0000-0000-0000-0000000000a3'::uuid,
              '00000000-0000-0000-0000-0000000000a4'::uuid,
              '00000000-0000-0000-0000-0000000000a5'::uuid);

-- plan NOT NULL (skema-production.sql baris 5257), diberi jelas di sini.
insert into public.qm_profiles (id, role, display_name, plan, approved, suspended) values
  ('00000000-0000-0000-0000-0000000000a1', 'educator',    'Pendidik Ujian', 'free', true, false),
  ('00000000-0000-0000-0000-0000000000a2', 'participant', 'Ali Ahmad',      'free', true, false),
  ('00000000-0000-0000-0000-0000000000a3', 'participant', 'Siti',           'free', true, false),
  ('00000000-0000-0000-0000-0000000000a4', 'participant', 'Amin',           'free', true, false),
  ('00000000-0000-0000-0000-0000000000a5', 'participant', 'Amin',           'free', true, false);

-- Kelas A: pemilik pendidik; ahli Ali, Siti, dan dua Amin.
insert into public.qm_classes (id, owner_id, name, color, join_code) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Kelas Ujian V2-012', '#6366f1', 'AB12CD34');

insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a5');

-- Submission diluluskan 10 mata dan pelarasan +5 untuk Ali (untuk jumlah 815).
insert into public.qm_hunts (id, owner_id, class_id, title) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Hunt Ujian V2-012');

insert into public.qm_challenges (id, hunt_id, title, prompt, answer, points, order_idx) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'Soalan Ujian V2-012', 'Berapa?', '42', 10, 1);

insert into public.qm_submissions (challenge_id, team_id, user_id, answer, status) values
  ('00000000-0000-0000-0000-0000000000d2', null, '00000000-0000-0000-0000-0000000000a2', '42', 'approved');

insert into public.qm_student_score_adjustments (class_id, user_id, delta, reason) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', 5, 'Ujian V2-012');

-- Kuiz kelas A (c2) dan kuiz tanpa kelas (c3).
insert into public.qm_live_quizzes (id, class_id, owner_id, title) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Kuiz Kelas Ujian'),
  ('00000000-0000-0000-0000-0000000000c3', null, '00000000-0000-0000-0000-0000000000a1', 'Kuiz Tanpa Kelas Ujian');

-- S1 ended, S2 revealed, S3 lobby (semua kuiz kelas), S4 kuiz tanpa kelas.
insert into public.qm_live_sessions (id, quiz_id, host_id, code, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'UJAA22', 'ended'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'UJBB33', 'revealed'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'UJCC44', 'lobby'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', 'UJDD55', 'ended');

-- Pemain tetamu (user_id null). "ali ahmad " sengaja ada ruang hujung supaya
-- padanan btrim diuji dan indeks nama (session_id, lower(nickname)) tidak
-- berlanggar. "Siti" dua kali dalam S1 ("Siti" dan "Siti ") mesti
-- dilangkau kedua-duanya. f8 dalam S3 (lobby) menyimpan skor 400 seperti
-- sesi yang ditetapkan semula ke lobby oleh hos; view mesti
-- mengecualikannya.
insert into public.qm_live_players (id, session_id, nickname, user_id, player_token, score) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'ali ahmad ', null, lpad('f1', 32, 'a'), 500),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2', 'Ali Ahmad',  null, lpad('f2', 32, 'a'), 300),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e1', 'Amin',       null, lpad('f3', 32, 'a'), 100),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000e1', 'Siti',       null, lpad('f4', 32, 'a'), 200),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000e1', 'Siti ',      null, lpad('f5', 32, 'a'), 150),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000e1', 'Orang Luar', null, lpad('f6', 32, 'a'), 10),
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000e4', 'Ali Ahmad',  null, lpad('f7', 32, 'a'), 900),
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000e3', 'Ali Ahmad',  null, lpad('f8', 32, 'a'), 400);

-- ============================================================
-- 1. Pra-syarat migrasi 0049
-- ============================================================
do $$
declare
  v_bil int;
  v_rls boolean;
  v_kolum text;
begin
  select count(*) into v_bil
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'qm_live_paut_pemain_lama';
  if v_bil = 1 then
    raise notice 'LULUS 1a: fungsi qm_live_paut_pemain_lama wujud';
  else
    raise exception 'GAGAL 1a: fungsi backfill tidak wujud (migrasi 0049 belum dijalankan?)';
  end if;

  if has_function_privilege('anon', 'public.qm_live_paut_pemain_lama()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.qm_live_paut_pemain_lama()', 'EXECUTE') then
    raise exception 'GAGAL 1b: anon atau authenticated masih boleh melaksanakan fungsi backfill';
  else
    raise notice 'LULUS 1b: fungsi backfill ditarik daripada anon dan authenticated';
  end if;

  if not has_function_privilege('service_role', 'public.qm_live_paut_pemain_lama()', 'EXECUTE') then
    raise exception 'GAGAL 1c: service_role tidak boleh melaksanakan fungsi backfill';
  else
    raise notice 'LULUS 1c: service_role boleh melaksanakan fungsi backfill';
  end if;

  select count(*) into v_bil
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'qm_live_players'
    and indexname = 'qm_live_players_sesi_pengguna_uniq';
  if v_bil = 1 then
    raise notice 'LULUS 1d: indeks unik qm_live_players_sesi_pengguna_uniq wujud';
  else
    raise exception 'GAGAL 1d: indeks unik separa tidak wujud';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'qm_live_players_pautan_0049';
  select count(*) into v_bil
  from pg_policies
  where schemaname = 'public' and tablename = 'qm_live_players_pautan_0049';
  if v_rls is true and v_bil = 0 then
    raise notice 'LULUS 1e: jadual sandaran ada RLS hidup tanpa polisi';
  else
    raise exception 'GAGAL 1e: jadual sandaran RLS=% polisi=%', v_rls, v_bil;
  end if;

  -- Lapan lajur pada kedudukan tetap: empat asal tidak bergerak, empat
  -- baharu di hujung.
  select string_agg(column_name, ',' order by ordinal_position) into v_kolum
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'qm_class_individual_scores';
  if v_kolum = 'class_id,user_id,display_name,total_score,task_score,live_score,adjustment_score,live_sessions' then
    raise notice 'LULUS 1f: view lapan lajur pada kedudukan betul';
  else
    raise exception 'GAGAL 1f: lajur view salah: %', coalesce(v_kolum, 'tiada');
  end if;

  -- Geran sedia ada kekal (tingkah laku akses tidak berubah).
  if has_table_privilege('authenticated', 'public.qm_class_individual_scores', 'SELECT')
     and has_table_privilege('service_role', 'public.qm_class_individual_scores', 'SELECT') then
    raise notice 'LULUS 1g: geran SELECT view kekal untuk authenticated dan service_role';
  else
    raise exception 'GAGAL 1g: geran SELECT view hilang';
  end if;
end $$;

-- ============================================================
-- 2. Backfill: panggilan pertama
-- ============================================================
do $$
declare
  v_linked bigint;
  v_skipped bigint;
begin
  select linked, skipped_ambiguous into v_linked, v_skipped
  from public.qm_live_paut_pemain_lama();

  if v_linked = 3 and v_skipped = 3 then
    raise notice 'LULUS 2a: backfill memaut 3 dan melangkau 3 (samar)';
  else
    raise exception 'GAGAL 2a: linked=% skipped=% (jangka 3 dan 3)', v_linked, v_skipped;
  end if;
end $$;

-- ============================================================
-- 3. Pautan tepat dan jadual sandaran
-- ============================================================
do $$
declare
  v_bil int;
  v_user uuid;
begin
  -- Ali dipaut dalam S1, S2 dan S3.
  select user_id into v_user from public.qm_live_players
   where id = '00000000-0000-0000-0000-0000000000f1';
  if v_user = '00000000-0000-0000-0000-0000000000a2'::uuid then
    raise notice 'LULUS 3a: f1 (S1, "ali ahmad ") dipaut kepada Ali';
  else
    raise exception 'GAGAL 3a: f1 tidak dipaut kepada Ali (%)', v_user;
  end if;

  select user_id into v_user from public.qm_live_players
   where id = '00000000-0000-0000-0000-0000000000f2';
  if v_user = '00000000-0000-0000-0000-0000000000a2'::uuid then
    raise notice 'LULUS 3b: f2 (S2, "Ali Ahmad") dipaut kepada Ali';
  else
    raise exception 'GAGAL 3b: f2 tidak dipaut kepada Ali (%)', v_user;
  end if;

  select user_id into v_user from public.qm_live_players
   where id = '00000000-0000-0000-0000-0000000000f8';
  if v_user = '00000000-0000-0000-0000-0000000000a2'::uuid then
    raise notice 'LULUS 3c: f8 (S3 lobby) dipaut kepada Ali';
  else
    raise exception 'GAGAL 3c: f8 tidak dipaut kepada Ali (%)', v_user;
  end if;

  -- Amin (dua calon), Siti (dua pemain sesi sama) dan Orang Luar tidak.
  select count(*) into v_bil from public.qm_live_players
   where id in ('00000000-0000-0000-0000-0000000000f3'::uuid,
                '00000000-0000-0000-0000-0000000000f4'::uuid,
                '00000000-0000-0000-0000-0000000000f5'::uuid,
                '00000000-0000-0000-0000-0000000000f6'::uuid)
     and user_id is null;
  if v_bil = 4 then
    raise notice 'LULUS 3d: Amin, Siti (dua kali) dan Orang Luar tidak dipaut';
  else
    raise exception 'GAGAL 3d: % daripada 4 pemain sepatutnya tidak dipaut', v_bil;
  end if;

  -- Kuiz tanpa kelas: pemain S4 kekal tetamu walaupun nama sama.
  select user_id into v_user from public.qm_live_players
   where id = '00000000-0000-0000-0000-0000000000f7';
  if v_user is null then
    raise notice 'LULUS 3e: f7 (S4, kuiz tanpa kelas) tidak dipaut';
  else
    raise exception 'GAGAL 3e: f7 dipaut sedangkan kuiznya tiada kelas (%)', v_user;
  end if;
end $$;

-- Jadual sandaran: tepat baris yang dipaut, tiada yang lain.
do $$
declare
  v_bil int;
  v_betul int;
begin
  select count(*), count(*) filter (
    where user_id = '00000000-0000-0000-0000-0000000000a2'::uuid
      and class_id = '00000000-0000-0000-0000-0000000000c1'::uuid
  ) into v_bil, v_betul
  from public.qm_live_players_pautan_0049
  where player_id in ('00000000-0000-0000-0000-0000000000f1'::uuid,
                      '00000000-0000-0000-0000-0000000000f2'::uuid,
                      '00000000-0000-0000-0000-0000000000f8'::uuid);

  if v_bil = 3 and v_betul = 3 then
    raise notice 'LULUS 3f: jadual sandaran memuat tepat tiga baris yang dipaut';
  else
    raise exception 'GAGAL 3f: baris=% betul=% (jangka 3 dan 3)', v_bil, v_betul;
  end if;

  if not exists (select 1 from public.qm_live_players_pautan_0049
                 where player_id not in ('00000000-0000-0000-0000-0000000000f1'::uuid,
                                         '00000000-0000-0000-0000-0000000000f2'::uuid,
                                         '00000000-0000-0000-0000-0000000000f8'::uuid)) then
    raise notice 'LULUS 3g: tiada baris sandaran lain';
  else
    raise exception 'GAGAL 3g: jadual sandaran memuat baris yang tidak dipaut';
  end if;
end $$;

-- ============================================================
-- 3h. Audit ringkasan
-- ============================================================
do $$
declare
  v_bil int;
  v_linked text;
  v_skipped text;
  v_actor uuid;
begin
  select count(*), min(actor_id), min(meta->>'linked'), min(meta->>'skipped_ambiguous')
    into v_bil, v_actor, v_linked, v_skipped
  from public.qm_audit_log
  where action = 'live_scores_backfill'
    and target_type = 'system';

  if v_bil = 1 and v_actor is null and v_linked = '3' and v_skipped = '3' then
    raise notice 'LULUS 3h: satu baris audit ringkasan (actor null, linked 3, skipped 3)';
  else
    raise exception 'GAGAL 3h: audit bil=% actor=% linked=% skipped=%', v_bil, v_actor, v_linked, v_skipped;
  end if;
end $$;

-- ============================================================
-- 4. View: markah kumulatif Ali
-- ============================================================
do $$
declare
  v_total bigint;
  v_task bigint;
  v_live bigint;
  v_adj bigint;
  v_sesi bigint;
begin
  select total_score, task_score, live_score, adjustment_score, live_sessions
    into v_total, v_task, v_live, v_adj, v_sesi
  from public.qm_class_individual_scores
  where class_id = '00000000-0000-0000-0000-0000000000c1'
    and user_id = '00000000-0000-0000-0000-0000000000a2';

  -- 10 task + 800 live + 5 pelarasan = 815. Sesi lobby S3 (skor 400) tidak
  -- dikira, jadi live 800 bukan 1200 dan live_sessions 2 bukan 3.
  if v_task = 10 and v_live = 800 and v_adj = 5 and v_total = 815 and v_sesi = 2 then
    raise notice 'LULUS 4a: Ali task=% live=% adj=% total=% sesi=%', v_task, v_live, v_adj, v_total, v_sesi;
  else
    raise exception 'GAGAL 4a: task=% live=% adj=% total=% sesi=% (jangka 10, 800, 5, 815, 2)',
      v_task, v_live, v_adj, v_total, v_sesi;
  end if;
end $$;

do $$
declare
  v_bil int;
begin
  -- Ahli lain (Siti, dua Amin) tanpa markah langsung.
  select count(*) into v_bil
  from public.qm_class_individual_scores
  where class_id = '00000000-0000-0000-0000-0000000000c1'
    and user_id in ('00000000-0000-0000-0000-0000000000a3'::uuid,
                    '00000000-0000-0000-0000-0000000000a4'::uuid,
                    '00000000-0000-0000-0000-0000000000a5'::uuid)
    and total_score = 0 and live_score = 0 and live_sessions = 0;
  if v_bil = 3 then
    raise notice 'LULUS 4b: Siti dan kedua-dua Amin kosong markah';
  else
    raise exception 'GAGAL 4b: % daripada 3 ahli lain sepatutnya kosong', v_bil;
  end if;
end $$;

-- ============================================================
-- 5. Indeks unik: pendua (session_id, user_id) ditolak
-- ============================================================
do $$
declare
  v_state text;
begin
  begin
    insert into public.qm_live_players (id, session_id, nickname, user_id, player_token, score)
    values ('00000000-0000-0000-0000-0000000000f9'::uuid,
            '00000000-0000-0000-0000-0000000000e1'::uuid,
            'Ali Ahmad 2',
            '00000000-0000-0000-0000-0000000000a2'::uuid,
            lpad('f9', 32, 'a'),
            0);
    raise exception 'GAGAL 5: sisipan pemain kedua dengan user_id sama dalam sesi sama diterima';
  exception
    when unique_violation then
      get stacked diagnostics v_state = RETURNED_SQLSTATE;
      if v_state = '23505' then
        raise notice 'LULUS 5: pendua (session_id, user_id) ditolak dengan SQLSTATE 23505';
      else
        raise exception 'GAGAL 5: SQLSTATE tidak dijangka: %', v_state;
      end if;
  end;
end $$;

-- ============================================================
-- 6. Idempoten: panggilan kedua tidak mengubah apa-apa
-- ============================================================
do $$
declare
  v_linked bigint;
  v_skipped bigint;
  v_pemain int;
  v_sandaran int;
  v_audit int;
begin
  select count(*) into v_pemain from public.qm_live_players where user_id is not null;
  select count(*) into v_sandaran from public.qm_live_players_pautan_0049;
  select count(*) into v_audit from public.qm_audit_log where action = 'live_scores_backfill';

  select linked, skipped_ambiguous into v_linked, v_skipped
  from public.qm_live_paut_pemain_lama();

  if v_linked <> 0 then
    raise exception 'GAGAL 6a: kali kedua memaut % baris (sepatutnya 0)', v_linked;
  else
    raise notice 'LULUS 6a: kali kedua tidak memaut apa-apa';
  end if;

  if (select count(*) from public.qm_live_players where user_id is not null) = v_pemain
     and (select count(*) from public.qm_live_players_pautan_0049) = v_sandaran
     and (select count(*) from public.qm_audit_log where action = 'live_scores_backfill') = v_audit then
    raise notice 'LULUS 6b: pemain, jadual sandaran dan audit tidak berubah';
  else
    raise exception 'GAGAL 6b: data berubah selepas panggilan kedua';
  end if;
end $$;

-- ============================================================
-- 7. Peranan authenticated ditolak pada fungsi backfill
-- ============================================================
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
  execute 'set local role authenticated';

  begin
    perform public.qm_live_paut_pemain_lama();
    raise exception 'GAGAL 7: authenticated berjaya memanggil fungsi backfill';
  exception
    when insufficient_privilege then
      raise notice 'LULUS 7: authenticated ditolak pada fungsi backfill (42501)';
  end;

  execute 'reset role';
end $$;

select set_config('request.jwt.claims', '', false);

rollback;
