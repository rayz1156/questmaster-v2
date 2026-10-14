-- KZ-014.sql: ujian penerimaan import kumpulan berulang (migrasi 0061).
--
-- Jalankan pada pelayan (CTO), SELEPAS 0061 dipasang dalam transaksi yang
-- sama atau sebelumnya:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/tests/KZ-014.sql
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya, jadi tiada data ujian kekal. Sebarang ketidaksepadan
-- memaparkan "UJIAN N GAGAL: ..." dan menghentikan skrip; output terakhir
-- "KZ-014: SEMUA UJIAN LULUS" bermakna semua ujian lulus.
--
-- Pepijat yang diuji: import KEDUA ke kelas yang sudah mempunyai ahli
-- kumpulan gagal dengan "invalid input syntax for type json" kerana gelung
-- ahli sedia ada memakai pemboleh ubah jsonb. Dengan fungsi 0033 asal,
-- Ujian 2 di bawah gagal.

begin;

-- ============================================================
-- 0. Data asas
-- ============================================================
-- auth.users disisip dengan pencetus dilumpuhkan (sama seperti KZ-001)
-- supaya qm_handle_new_user tidak mencipta profil atau menuntut jemputan.
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000140e1', 'kz014-pensyarah@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000140a1', 'kz014-d1@ujian.invalid',        'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000140a2', 'kz014-d2@ujian.invalid',        'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000140a3', 'kz014-d3@ujian.invalid',        'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000140a4', 'kz014-d4@ujian.invalid',        'authenticated', 'authenticated', now(), now()),
  -- Dua pelajar yang mendaftar dengan emel peribadi, bukan emel siswa.
  ('00000000-0000-0000-0000-0000000140b1', 'kz014-auni@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000140b2', 'kz014-aina@ujian.invalid',      'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000140e1', 'educator',    'Pensyarah KZ-014', 'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000140a1', 'participant', 'D1',               'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000140a2', 'participant', 'D2',               'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000140a3', 'participant', 'D3',               'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000140a4', 'participant', 'D4',               'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000140b1', 'participant', 'Auni',             'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000140b2', 'participant', 'Aina',             'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-000000014c01', '00000000-0000-0000-0000-0000000140e1', 'Kelas Ujian KZ-014');

-- Semua panggilan import dibuat sebagai pemilik kelas.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000140e1"}', true);
set local role authenticated;

-- ============================================================
-- Ujian 1: import pertama ke kelas kosong (perlakuan asal kekal)
-- ============================================================
do $u$
declare v jsonb;
begin
  v := public.qm_import_class_teams('00000000-0000-0000-0000-000000014c01'::uuid, $j$[
    {"row":2,"group":"IRIS","name":"D1","email":"kz014-d1@ujian.invalid","leader":true},
    {"row":3,"group":"IRIS","name":"D2","email":"kz014-d2@ujian.invalid","leader":false},
    {"row":4,"group":"LUMINA","name":"Auni (emel siswa)","email":"kz014-auni-siswa@ujian.invalid","leader":false},
    {"row":5,"group":"LUMINA","name":"Aina (emel siswa)","email":"kz014-aina-siswa@ujian.invalid","leader":true},
    {"row":6,"group":"LUMINA","name":"D4","email":"kz014-d4@ujian.invalid","leader":false}
  ]$j$::jsonb, false, false);
  if (v->>'ok')::boolean is not true or (v->>'teams_created')::int <> 2
     or (v->>'joined_now')::int <> 3 or (v->>'pending')::int <> 2 then
    raise exception 'UJIAN 1 GAGAL: %', v;
  end if;
end $u$;

-- ============================================================
-- Ujian 2: PRATONTON import kemas kini bila kelas sudah ada ahli.
-- Inilah yang gagal dengan "invalid input syntax for type json".
-- ============================================================
do $u$
declare v jsonb;
begin
  v := public.qm_import_class_teams('00000000-0000-0000-0000-000000014c01'::uuid, $j$[
    {"row":2,"group":"IRIS","name":"D3","email":"kz014-d3@ujian.invalid","leader":false},
    {"row":3,"group":"IRIS","name":"Belum daftar","email":"kz014-d5@ujian.invalid","leader":false},
    {"row":4,"group":"LUMINA","name":"Auni","email":"kz014-auni@ujian.invalid","leader":false},
    {"row":5,"group":"LUMINA","name":"Aina","email":"kz014-aina@ujian.invalid","leader":true}
  ]$j$::jsonb, false, true);
  if (v->>'ok')::boolean is not true or (v->>'dry_run')::boolean is not true
     or (v->>'teams_reused')::int <> 2 or (v->>'joined_now')::int <> 3 or (v->>'pending')::int <> 1 then
    raise exception 'UJIAN 2 GAGAL: %', v;
  end if;
end $u$;

-- ============================================================
-- Ujian 3: COMMIT import kemas kini yang sama
-- ============================================================
do $u$
declare v jsonb;
begin
  v := public.qm_import_class_teams('00000000-0000-0000-0000-000000014c01'::uuid, $j$[
    {"row":2,"group":"IRIS","name":"D3","email":"kz014-d3@ujian.invalid","leader":false},
    {"row":3,"group":"IRIS","name":"Belum daftar","email":"kz014-d5@ujian.invalid","leader":false},
    {"row":4,"group":"LUMINA","name":"Auni","email":"kz014-auni@ujian.invalid","leader":false},
    {"row":5,"group":"LUMINA","name":"Aina","email":"kz014-aina@ujian.invalid","leader":true}
  ]$j$::jsonb, false, false);
  if (v->>'ok')::boolean is not true or (v->>'dry_run')::boolean is not false then
    raise exception 'UJIAN 3 GAGAL: %', v;
  end if;
end $u$;

-- ============================================================
-- Ujian 4: pindah ahli tanpa "replace" ditolak dengan mesej yang betul.
-- Ini membuktikan peta ahli sedia ada (v_uid_team) kini terisi.
-- ============================================================
do $u$
declare v jsonb;
begin
  v := public.qm_import_class_teams('00000000-0000-0000-0000-000000014c01'::uuid, $j$[
    {"row":2,"group":"LUMINA","name":"D2","email":"kz014-d2@ujian.invalid","leader":false}
  ]$j$::jsonb, false, true);
  if (v->>'ok')::boolean is not false
     or position('already a member of team "IRIS"' in (v->'errors'->0->>'message')) = 0 then
    raise exception 'UJIAN 4 GAGAL: %', v;
  end if;
end $u$;

-- ============================================================
-- Ujian 5: konflik ketua masih menolak keseluruhan import.
-- ============================================================
do $u$
declare v_ok boolean := false;
begin
  begin
    perform public.qm_import_class_teams('00000000-0000-0000-0000-000000014c01'::uuid, $j$[
      {"row":2,"group":"IRIS","name":"D3","email":"kz014-d3@ujian.invalid","leader":true}
    ]$j$::jsonb, false, false);
  exception when others then
    v_ok := sqlerrm like 'QM_LEADER_CONFLICT:%';
    if not v_ok then
      raise exception 'UJIAN 5 GAGAL: ralat tidak dijangka: %', sqlerrm;
    end if;
  end;
  if not v_ok then
    raise exception 'UJIAN 5 GAGAL: import dengan dua ketua tidak ditolak';
  end if;
end $u$;

reset role;

-- ============================================================
-- Ujian 6: keadaan akhir kumpulan (dibaca sebagai pentadbir)
-- ============================================================
do $u$
declare
  v_iris uuid;
  v_lumina uuid;
  n int;
  m int;
begin
  select id into v_iris   from public.qm_teams where class_id = '00000000-0000-0000-0000-000000014c01' and name = 'IRIS';
  select id into v_lumina from public.qm_teams where class_id = '00000000-0000-0000-0000-000000014c01' and name = 'LUMINA';

  -- IRIS: D1 (ketua), D2, D3 + seorang menunggu (kz014-d5).
  select count(*) into n from public.qm_team_members where team_id = v_iris;
  if n <> 3 then raise exception 'UJIAN 6 GAGAL: IRIS ada % ahli, dijangka 3', n; end if;
  if not exists (select 1 from public.qm_team_members
                  where team_id = v_iris and user_id = '00000000-0000-0000-0000-0000000140a1' and role = 'leader') then
    raise exception 'UJIAN 6 GAGAL: D1 bukan lagi ketua IRIS';
  end if;
  select count(*) into m from public.qm_team_invites where team_id = v_iris and claimed_at is null;
  if m <> 1 then raise exception 'UJIAN 6 GAGAL: IRIS ada % jemputan menunggu, dijangka 1', m; end if;

  -- LUMINA: D4, Auni, Aina (ketua, emel peribadi) + dua jemputan siswa lama.
  select count(*) into n from public.qm_team_members where team_id = v_lumina;
  if n <> 3 then raise exception 'UJIAN 6 GAGAL: LUMINA ada % ahli, dijangka 3', n; end if;
  if not exists (select 1 from public.qm_team_members
                  where team_id = v_lumina and user_id = '00000000-0000-0000-0000-0000000140b2' and role = 'leader') then
    raise exception 'UJIAN 6 GAGAL: Aina tidak menjadi ketua LUMINA';
  end if;

  -- D2 kekal dalam IRIS (Ujian 4 ditolak), D3 kekal ahli biasa (Ujian 5 digulung).
  if not exists (select 1 from public.qm_team_members where team_id = v_iris and user_id = '00000000-0000-0000-0000-0000000140a2') then
    raise exception 'UJIAN 6 GAGAL: D2 terkeluar daripada IRIS';
  end if;
  if exists (select 1 from public.qm_team_members where team_id = v_iris and user_id = '00000000-0000-0000-0000-0000000140a3' and role = 'leader') then
    raise exception 'UJIAN 6 GAGAL: D3 menjadi ketua walaupun import ditolak';
  end if;

  -- max_members = ahli + jemputan menunggu (bukan bilangan baris fail).
  if (select max_members from public.qm_teams where id = v_iris) <> 4 then
    raise exception 'UJIAN 6 GAGAL: max_members IRIS = %, dijangka 4', (select max_members from public.qm_teams where id = v_iris);
  end if;
  if (select max_members from public.qm_teams where id = v_lumina) <> 5 then
    raise exception 'UJIAN 6 GAGAL: max_members LUMINA = %, dijangka 5', (select max_members from public.qm_teams where id = v_lumina);
  end if;

  -- Semua ahli kumpulan juga ahli kelas.
  select count(*) into n from public.qm_class_members where class_id = '00000000-0000-0000-0000-000000014c01';
  if n <> 6 then raise exception 'UJIAN 6 GAGAL: % ahli kelas, dijangka 6', n; end if;

  raise notice 'KZ-014: SEMUA UJIAN LULUS';
end $u$;

-- ============================================================
-- Hujung: tiada data ujian kekal.
-- ============================================================
rollback;
