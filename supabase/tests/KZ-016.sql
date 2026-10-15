-- KZ-016.sql: ujian bonus kumpulan tanpa aktiviti.
--
-- Prasyarat: migrasi 0063 sudah dijalankan dalam sesi psql yang sama:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 -1 -f - < supabase/migrations/0063_bonus_kumpulan_tanpa_aktiviti.sql
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 -1 -f - < supabase/tests/KZ-016.sql
--
-- Semua perubahan dibalik dengan ROLLBACK di akhir. Setiap semakan yang
-- gagal memanggil raise exception supaya kegagalan jelas pada output psql.

begin;

-- ============================================================
-- Persediaan (sebagai superuser)
-- ============================================================

-- 3 pengguna auth: pendidik X, pendidik Y, pelajar. Sisipan auth.users dan
-- qm_profiles perlu session_replication_role = replica (lumpuhkan FK dan
-- pencetus qm_handle_new_user), kemudian dikembalikan kepada origin.
set local session_replication_role = replica;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at) values
  ('11111111-1111-4111-8111-111111111111', 'kz016-edu-x@example.test', 'x', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'kz016-edu-y@example.test', 'x', now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'kz016-student@example.test', 'x', now(), now());

insert into public.qm_profiles (id, role, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'educator', 'Pendidik X'),
  ('22222222-2222-4222-8222-222222222222', 'educator', 'Pendidik Y'),
  ('33333333-3333-4333-8333-333333333333', 'participant', 'Pelajar');

set local session_replication_role = origin;

-- 2 kelas: X dimiliki pendidik X, Y dimiliki pendidik Y.
insert into public.qm_classes (id, owner_id, name) values
  ('aaaaaaa1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Kelas X'),
  ('aaaaaaa2-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Kelas Y');

-- Rekod pendidik diterima (accepted_at tidak null; qm_is_class_educator
-- menuntutnya). Role mesti 'owner' atau 'co_creator' (CHECK jadual).
insert into public.qm_class_educators (class_id, educator_id, role, accepted_at) values
  ('aaaaaaa1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'owner', now()),
  ('aaaaaaa2-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'owner', now());

-- Satu aktiviti dalam kelas X untuk ujian hunt_id sah.
insert into public.qm_hunts (id, owner_id, title, class_id) values
  ('ccccccc1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Aktiviti X', 'aaaaaaa1-0000-4000-8000-000000000001');

-- 2 kumpulan: A dalam kelas X (tanpa hunt), B dalam kelas Y (tanpa hunt).
insert into public.qm_teams (id, name, class_id) values
  ('bbbbbbb1-0000-4000-8000-000000000001', 'Kumpulan A', 'aaaaaaa1-0000-4000-8000-000000000001'),
  ('bbbbbbb2-0000-4000-8000-000000000002', 'Kumpulan B', 'aaaaaaa2-0000-4000-8000-000000000002');

-- Ahli pelajar dalam kumpulan A sahaja.
insert into public.qm_team_members (team_id, user_id) values
  ('bbbbbbb1-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333');

-- Satu pelarasan sedia ada untuk A dan satu untuk B (untuk ujian bacaan).
insert into public.qm_score_adjustments (team_id, hunt_id, delta, reason) values
  ('bbbbbbb1-0000-4000-8000-000000000001', null, 10, 'Persediaan A'),
  ('bbbbbbb2-0000-4000-8000-000000000002', null, 20, 'Persediaan B');

-- ============================================================
-- Ujian 1: pendidik kelas boleh insert bonus hunt_id = null untuk
-- kumpulan dalam kelasnya, dan adjustment_score view bertambah.
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $u$
begin
  insert into public.qm_score_adjustments (team_id, hunt_id, delta, reason, created_by)
  values ('bbbbbbb1-0000-4000-8000-000000000001', null, 50, 'Bonus kelas',
          '11111111-1111-4111-8111-111111111111');
exception
  when others then
    raise exception 'UJIAN 1 GAGAL: pendidik kelas tidak dapat insert bonus hunt_id null: %', sqlerrm;
end $u$;

do $u$
declare
  v_adj bigint;
begin
  select adjustment_score into v_adj
    from public.qm_class_team_scores
   where team_id = 'bbbbbbb1-0000-4000-8000-000000000001';
  if v_adj is distinct from 60 then
    raise exception 'UJIAN 1 GAGAL: adjustment_score jangkaan 60, sebenar %', v_adj;
  end if;
end $u$;

-- ============================================================
-- Ujian 2: pendidik kelas LAIN tidak boleh insert bonus
-- hunt_id = null untuk kumpulan itu (RLS menolak).
-- ============================================================
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

do $u$
begin
  insert into public.qm_score_adjustments (team_id, hunt_id, delta, reason, created_by)
  values ('bbbbbbb1-0000-4000-8000-000000000001', null, 99, 'Jangan berjaya',
          '22222222-2222-4222-8222-222222222222');
  raise exception 'UJIAN 2 GAGAL: pendidik kelas lain berjaya insert bonus untuk kumpulan kelas lain';
exception
  when others then
    if sqlerrm like 'UJIAN 2 GAGAL%' then
      raise;
    end if;
    -- ditolak seperti dijangka
end $u$;

-- ============================================================
-- Ujian 3: bonus dengan hunt_id sah masih berfungsi untuk
-- pendidik kelas itu (tingkah laku lama terpelihara).
-- ============================================================
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $u$
begin
  insert into public.qm_score_adjustments (team_id, hunt_id, delta, reason, created_by)
  values ('bbbbbbb1-0000-4000-8000-000000000001',
          'ccccccc1-0000-4000-8000-000000000001', 5, 'Bonus aktiviti',
          '11111111-1111-4111-8111-111111111111');
exception
  when others then
    raise exception 'UJIAN 3 GAGAL: bonus dengan hunt_id sah ditolak: %', sqlerrm;
end $u$;

-- Pendidik kelas lain tidak boleh insert dengan hunt_id sah pun untuk
-- kumpulan kelas lain (WITH CHECK menahan silang kelas).
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

do $u$
begin
  insert into public.qm_score_adjustments (team_id, hunt_id, delta, reason, created_by)
  values ('bbbbbbb1-0000-4000-8000-000000000001',
          'ccccccc1-0000-4000-8000-000000000001', 7, 'Silang kelas',
          '22222222-2222-4222-8222-222222222222');
  raise exception 'UJIAN 3 GAGAL: pendidik kelas lain berjaya insert bonus dengan hunt kelas lain';
exception
  when others then
    if sqlerrm like 'UJIAN 3 GAGAL%' then
      raise;
    end if;
end $u$;

-- Bonus tambahan: UPDATE menukar team_id kepada kumpulan kelas lain mesti
-- ditolak oleh WITH CHECK (risiko keselamatan dalam tiket).
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $u$
begin
  update public.qm_score_adjustments
     set team_id = 'bbbbbbb2-0000-4000-8000-000000000002'
   where team_id = 'bbbbbbb1-0000-4000-8000-000000000001';
  raise exception 'UJIAN 3 GAGAL: pendidik berjaya menukar team_id kepada kumpulan kelas lain';
exception
  when others then
    if sqlerrm like 'UJIAN 3 GAGAL%' then
      raise;
    end if;
end $u$;

-- Pembetulan CTO: pendidik X tidak boleh mengikat kumpulan B (kelas Y) pada
-- aktiviti kelas X sendiri.
do $u$
begin
  insert into public.qm_score_adjustments (team_id, hunt_id, delta, reason, created_by)
  values ('bbbbbbb2-0000-4000-8000-000000000002',
          'ccccccc1-0000-4000-8000-000000000001', 8, 'Kumpulan kelas lain',
          '11111111-1111-4111-8111-111111111111');
  raise exception 'UJIAN 3 GAGAL: pendidik berjaya ikat kumpulan kelas lain pada aktiviti sendiri';
exception
  when others then
    if sqlerrm like 'UJIAN 3 GAGAL%' then
      raise;
    end if;
end $u$;
-- ============================================================
-- Ujian 4: ahli kumpulan A boleh membaca pelarasan kumpulan A
-- tetapi TIDAK kumpulan B.
-- ============================================================
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

do $u$
declare
  v_a int;
  v_b int;
begin
  select count(*) into v_a from public.qm_score_adjustments
   where team_id = 'bbbbbbb1-0000-4000-8000-000000000001';
  select count(*) into v_b from public.qm_score_adjustments
   where team_id = 'bbbbbbb2-0000-4000-8000-000000000002';
  -- 3 baris kumpulan A: persediaan + bonus kelas (ujian 1) + bonus aktiviti (ujian 3).
  if v_a is distinct from 3 then
    raise exception 'UJIAN 4 GAGAL: ahli kumpulan A sepatutnya nampak 3 pelarasan A, nampak %', v_a;
  end if;
  if v_b is distinct from 0 then
    raise exception 'UJIAN 4 GAGAL: ahli kumpulan A tidak sepatutnya nampak pelarasan kumpulan B (nampak %)', v_b;
  end if;
end $u$;

-- Semua semakan lulus.
reset role;
do $u$
begin
  raise notice 'KZ-016: semua ujian lulus';
end $u$;

rollback;
