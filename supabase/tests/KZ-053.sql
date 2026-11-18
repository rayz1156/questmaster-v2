-- KZ-053.sql: ujian migrasi 0077 (lumba solo).
--
-- Jalankan pada pelayan (CTO) DARI AKAR REPO:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/tests/KZ-053.sql
--
-- Bahagian 0 menjalankan migrasi 0077 DUA KALI di luar transaksi (ujian
-- idempotensi); bahagian selebihnya berjalan dalam satu transaksi yang
-- digulung semula pada hujungnya, jadi tiada data ujian kekal. Sebarang
-- ketidaksepadan memaparkan "UJIAN n GAGAL: ..." dan menghentikan skrip;
-- mesej "KZ-053 SEMUA LULUS" bermakna semua lulus.

-- ============================================================ 0. Migrasi dua kali
\i supabase/migrations/0077_lumba_solo.sql
\i supabase/migrations/0077_lumba_solo.sql

begin;

-- ============================================================ 1. Data asas
-- qm_profiles.id ialah FK ke auth.users; session_replication_role = replica
-- melumpuhkan pencetus supaya sisipan tanpa kata laluan diterima.
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000053a1', 'kz053-guru@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000053b1', 'kz053-murid@ujian.invalid', 'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000053a1', 'educator',    'Guru Ujian KZ-053',  'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000053b1', 'participant', 'Murid KZ-053',       'free', true, false, now());

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000053c1', '00000000-0000-0000-0000-0000000053a1', 'Kelas Ujian KZ-053');

insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-0000000053c1', '00000000-0000-0000-0000-0000000053b1');

-- Kuiz 1: tanpa kelas (tetamu dibenarkan). Kuiz 2: berkelas.
insert into public.qm_live_quizzes (id, class_id, owner_id, title) values
  ('00000000-0000-0000-0000-0000000053d1', null, '00000000-0000-0000-0000-0000000053a1', 'Kuiz Solo Terbuka KZ-053'),
  ('00000000-0000-0000-0000-0000000053d2', '00000000-0000-0000-0000-0000000053c1', '00000000-0000-0000-0000-0000000053a1', 'Kuiz Solo Kelas KZ-053');

-- 3 soalan serasi Live (multiple) + 1 soalan tidak serasi (essay) bagi
-- setiap kuiz; Lumba Solo hanya memainkan yang serasi.
insert into public.qm_live_questions (id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec) values
  ('00000000-0000-0000-0000-0000000053e1', '00000000-0000-0000-0000-0000000053d1', 0,
   'Dua tambah dua?', '[{"key":"A","text":"3"},{"key":"B","text":"4"},{"key":"C","text":"5"}]'::jsonb, 'B', 1000, 30),
  ('00000000-0000-0000-0000-0000000053e2', '00000000-0000-0000-0000-0000000053d1', 1,
   'Warna langit?', '[{"key":"A","text":"Biru"},{"key":"B","text":"Merah"}]'::jsonb, 'A', 1000, 30),
  ('00000000-0000-0000-0000-0000000053e3', '00000000-0000-0000-0000-0000000053d1', 2,
   'Air mendidih pada?', '[{"key":"A","text":"90C"},{"key":"B","text":"100C"}]'::jsonb, 'B', 1000, 30),
  ('00000000-0000-0000-0000-0000000053e4', '00000000-0000-0000-0000-0000000053d1', 3,
   'Tulis esei.', '[]'::jsonb, '', 100, 60),
  ('00000000-0000-0000-0000-0000000053e5', '00000000-0000-0000-0000-0000000053d2', 0,
   'Ibu negara?', '[{"key":"A","text":"KL"},{"key":"B","text":"JB"}]'::jsonb, 'A', 1000, 30),
  ('00000000-0000-0000-0000-0000000053e6', '00000000-0000-0000-0000-0000000053d2', 1,
   'Dua darab tiga?', '[{"key":"A","text":"5"},{"key":"B","text":"6"}]'::jsonb, 'B', 1000, 30),
  ('00000000-0000-0000-0000-0000000053e7', '00000000-0000-0000-0000-0000000053d2', 2,
   'Bumi bentuk?', '[{"key":"A","text":"Bumi"},{"key":"B","text":"Kubus"}]'::jsonb, 'A', 1000, 30);

-- ============================================================ 2. Medan kuiz
-- U1: suis dan kod solo wujud; lalai mati dan kod null; unique ditolak.
update public.qm_live_quizzes
   set solo_enabled = true, solo_code = 'KZ53AA'
 where id = '00000000-0000-0000-0000-0000000053d1';

do $$
declare
  v_on boolean;
  v_kod text;
begin
  select solo_enabled, solo_code into v_on, v_kod
    from public.qm_live_quizzes where id = '00000000-0000-0000-0000-0000000053d1';
  if v_on is not true or v_kod <> 'KZ53AA' then
    raise exception 'UJIAN 1 GAGAL: suis/kod solo tidak disimpan (%, %)', v_on, v_kod;
  end if;
  select solo_enabled, solo_code into v_on, v_kod
    from public.qm_live_quizzes where id = '00000000-0000-0000-0000-0000000053d2';
  if v_on is not false or v_kod is not null then
    raise exception 'UJIAN 1b GAGAL: lalai sepatutnya mati dan kod null (%, %)', v_on, v_kod;
  end if;
end $$;

do $$
begin
  begin
    update public.qm_live_quizzes set solo_code = 'KZ53AA'
     where id = '00000000-0000-0000-0000-0000000053d2';
    raise exception 'UJIAN 1c GAGAL: kod solo berulang sepatutnya ditolak';
  exception when unique_violation then null;
  end;
end $$;

-- ============================================================ 3. Larian
-- U2: larian tetamu (user_id null, nickname bebas) dan larian pengguna
-- berdaftar (user_id murid). question_ids ialah susunan dikocok pelayan.
insert into public.qm_solo_runs (id, quiz_id, user_id, nickname, token_hash, question_ids, ip_hash) values
  ('00000000-0000-0000-0000-0000000053f1', '00000000-0000-0000-0000-0000000053d1', null,
   'Tetamu Kilat', repeat('a', 64),
   array['00000000-0000-0000-0000-0000000053e2','00000000-0000-0000-0000-0000000053e1','00000000-0000-0000-0000-0000000053e3']::uuid[],
   repeat('9', 64)),
  ('00000000-0000-0000-0000-0000000053f2', '00000000-0000-0000-0000-0000000053d2',
   '00000000-0000-0000-0000-0000000053b1', 'Murid KZ-053', repeat('b', 64),
   array['00000000-0000-0000-0000-0000000053e5','00000000-0000-0000-0000-0000000053e6','00000000-0000-0000-0000-0000000053e7']::uuid[],
   null);

do $$
declare
  v_n int; v_idx int; v_st text;
begin
  select count(*), next_idx, status into v_n, v_idx, v_st from public.qm_solo_runs
   where id = '00000000-0000-0000-0000-0000000053f1';
  if v_n <> 1 or v_idx <> 0 or v_st <> 'playing' then
    raise exception 'UJIAN 2 GAGAL: larian tetamu tidak berkelakuan lalai (idx=%, st=%)', v_idx, v_st;
  end if;
end $$;

-- U3: kekangan nickname 1-24 aksara.
do $$
begin
  begin
    insert into public.qm_solo_runs (quiz_id, nickname, token_hash, question_ids)
    values ('00000000-0000-0000-0000-0000000053d1', '', repeat('c', 64), '{}'::uuid[]);
    raise exception 'UJIAN 3 GAGAL: nickname kosong sepatutnya ditolak';
  exception when check_violation then null;
  end;
  begin
    insert into public.qm_solo_runs (quiz_id, nickname, token_hash, question_ids)
    values ('00000000-0000-0000-0000-0000000053d1', repeat('p', 25), repeat('c', 64), '{}'::uuid[]);
    raise exception 'UJIAN 3b GAGAL: nickname 25 aksara sepatutnya ditolak';
  exception when check_violation then null;
  end;
end $$;

-- U4: status tidak dalam senarai ditolak.
do $$
begin
  begin
    insert into public.qm_solo_runs (quiz_id, nickname, token_hash, question_ids, status)
    values ('00000000-0000-0000-0000-0000000053d1', 'Larian Baru', repeat('c', 64), '{}'::uuid[], 'batal');
    raise exception 'UJIAN 4 GAGAL: status tidak sah sepatutnya ditolak';
  exception when check_violation then null;
  end;
end $$;

-- ============================================================ 4. Jawapan
-- U5: satu jawapan bagi setiap soal dalam satu larian.
insert into public.qm_solo_answers (run_id, question_id, choice, is_correct, ms, points) values
  ('00000000-0000-0000-0000-0000000053f1', '00000000-0000-0000-0000-0000000053e2', 'A', true, 4200, 1500);

do $$
begin
  begin
    insert into public.qm_solo_answers (run_id, question_id, choice, is_correct, ms, points)
    values ('00000000-0000-0000-0000-0000000053f1', '00000000-0000-0000-0000-0000000053e2', 'B', false, 5000, 0);
    raise exception 'UJIAN 5 GAGAL: jawapan berulang sepatutnya ditolak';
  exception when unique_violation then null;
  end;
end $$;

-- U6: padam larian memadam jawapannya (cascade); padam kuiz memadam larian.
delete from public.qm_solo_answers where run_id = '00000000-0000-0000-0000-0000000053f1';
do $$
declare v_n int;
begin
  select count(*) into v_n from public.qm_solo_answers where run_id = '00000000-0000-0000-0000-0000000053f1';
  if v_n <> 0 then raise exception 'UJIAN 6 GAGAL: jawapan tidak dipadam bersama larian'; end if;
end $$;

delete from public.qm_solo_runs where id = '00000000-0000-0000-0000-0000000053f1';
insert into public.qm_solo_runs (id, quiz_id, nickname, token_hash, question_ids)
values ('00000000-0000-0000-0000-0000000053f3', '00000000-0000-0000-0000-0000000053d1', 'Tetamu Kedua', repeat('d', 64), '{}'::uuid[]);
delete from public.qm_live_quizzes where id = '00000000-0000-0000-0000-0000000053d1';
do $$
declare v_n int;
begin
  select count(*) into v_n from public.qm_solo_runs where quiz_id = '00000000-0000-0000-0000-0000000053d1';
  if v_n <> 0 then raise exception 'UJIAN 6b GAGAL: larian tidak dipadam bersama kuiz'; end if;
end $$;

-- U6c: pengguna berdaftar dipadam -> user_id menjadi null (set null), baris
-- larian kekal untuk papan.
delete from auth.users where id = '00000000-0000-0000-0000-0000000053b1';
do $$
declare v_uid uuid; v_n int;
begin
  select user_id into v_uid from public.qm_solo_runs where id = '00000000-0000-0000-0000-0000000053f2';
  if v_uid is not null then raise exception 'UJIAN 6c GAGAL: user_id sepatutnya null (dapat %)', v_uid; end if;
  select count(*) into v_n from public.qm_solo_runs where id = '00000000-0000-0000-0000-0000000053f2';
  if v_n <> 1 then raise exception 'UJIAN 6c GAGAL: larian sepatutnya kekal'; end if;
end $$;

-- ============================================================ 5. RLS dan revoke
-- U7: authenticated dan anon TIDAK boleh membaca jadual baharu sama
-- sekali (revoke + RLS tanpa polisi).
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.qm_solo_runs limit 1;
    raise exception 'UJIAN 7 GAGAL: authenticated dapat membaca qm_solo_runs';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.qm_solo_answers limit 1;
    raise exception 'UJIAN 7 GAGAL: authenticated dapat membaca qm_solo_answers';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.qm_solo_runs limit 1;
    raise exception 'UJIAN 7b GAGAL: anon dapat membaca qm_solo_runs';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.qm_solo_answers limit 1;
    raise exception 'UJIAN 7b GAGAL: anon dapat membaca qm_solo_answers';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ============================================================ 6. Selesai
do $$
begin
  raise notice 'KZ-053 SEMUA LULUS';
end $$;

rollback;
