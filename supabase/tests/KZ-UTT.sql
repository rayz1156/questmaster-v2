-- KZ-UTT.sql: ujian penerimaan migrasi 0083 (mod ujian Lumba Solo T1, T2, T3).
-- Jalankan dengan 0083 DI DALAM transaksi fail ini:
--   { echo 'begin;'; cat supabase/migrations/0083_mod_ujian_solo.sql; sed '1,/^begin;$/d' supabase/tests/KZ-UTT.sql; } \
--     | docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
-- Berakhir dengan rollback. "KZ-UTT: SEMUA UJIAN LULUS" bermakna semua lulus.

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000a0e1', 'kzutt-pensyarah@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000a0a1', 'kzutt-p1@ujian.invalid',        'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-00000000a0e1', 'educator',    'Pensyarah KZ-UTT', 'pro',  true, false, now()),
  ('00000000-0000-0000-0000-00000000a0a1', 'participant', 'P1 KZ-UTT',        'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000ac01', '00000000-0000-0000-0000-00000000a0e1', 'Kelas KZ-UTT');

insert into public.qm_live_quizzes (id, class_id, owner_id, title) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000ac01',
   '00000000-0000-0000-0000-00000000a0e1', 'Ujian Pra dan Pasca KZ-UTT');

do $$
declare
  q uuid := '00000000-0000-0000-0000-00000000aa01';
  u uuid := '00000000-0000-0000-0000-00000000a0a1';
  ok boolean;
begin
  -- 1. Lalai: mod ujian mati, titik null.
  if (select solo_test_mode from public.qm_live_quizzes where id = q) is distinct from false then
    raise exception 'GAGAL 1: solo_test_mode lalai bukan false';
  end if;
  if (select solo_measure_point from public.qm_live_quizzes where id = q) is not null then
    raise exception 'GAGAL 1b: solo_measure_point lalai bukan null';
  end if;

  -- 2. Titik sah diterima, titik tidak sah ditolak.
  update public.qm_live_quizzes set solo_test_mode = true, solo_measure_point = 'T1' where id = q;
  ok := false;
  begin
    update public.qm_live_quizzes set solo_measure_point = 'T4' where id = q;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 2: T4 diterima'; end if;

  -- 3. Larian biasa (test_mode false) tanpa titik masih sah; larian tetamu kekal sah.
  insert into public.qm_solo_runs (quiz_id, user_id, nickname, token_hash, question_ids)
  values (q, null, 'Tetamu', 'h-biasa-1', '{}');

  -- 4. Larian biasa dengan titik ditolak.
  ok := false;
  begin
    insert into public.qm_solo_runs (quiz_id, user_id, nickname, token_hash, question_ids, measure_point)
    values (q, u, 'P1', 'h-biasa-2', '{}', 'T1');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 4: larian biasa dengan titik diterima'; end if;

  -- 5. Larian ujian tanpa titik ditolak.
  ok := false;
  begin
    insert into public.qm_solo_runs (quiz_id, user_id, nickname, token_hash, question_ids, test_mode)
    values (q, u, 'P1', 'h-ujian-0', '{}', true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 5: larian ujian tanpa titik diterima'; end if;

  -- 6. Satu larian ujian T1 diterima; larian T1 kedua ditolak (unik).
  insert into public.qm_solo_runs (quiz_id, user_id, nickname, token_hash, question_ids, test_mode, measure_point)
  values (q, u, 'P1', 'h-ujian-t1', '{}', true, 'T1');
  ok := false;
  begin
    insert into public.qm_solo_runs (quiz_id, user_id, nickname, token_hash, question_ids, test_mode, measure_point)
    values (q, u, 'P1', 'h-ujian-t1b', '{}', true, 'T1');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 6: larian ujian T1 kedua diterima'; end if;

  -- 7. Larian expired pun masih menghalang larian baharu (API menyambung, bukan mengganti).
  update public.qm_solo_runs set status = 'expired' where token_hash = 'h-ujian-t1';
  ok := false;
  begin
    insert into public.qm_solo_runs (quiz_id, user_id, nickname, token_hash, question_ids, test_mode, measure_point)
    values (q, u, 'P1', 'h-ujian-t1c', '{}', true, 'T1');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 7: larian T1 baharu diterima walaupun ada larian expired'; end if;

  -- 8. T2 dan T3 bagi pengguna sama diterima.
  insert into public.qm_solo_runs (quiz_id, user_id, nickname, token_hash, question_ids, test_mode, measure_point)
  values (q, u, 'P1', 'h-ujian-t2', '{}', true, 'T2'),
         (q, u, 'P1', 'h-ujian-t3', '{}', true, 'T3');
  if (select count(*) from public.qm_solo_runs where quiz_id = q and test_mode) <> 3 then
    raise exception 'GAGAL 8: bilangan larian ujian bukan 3';
  end if;

  -- 9. Larian biasa berulang bagi pengguna sama masih dibenarkan (mod latihan tidak berubah).
  insert into public.qm_solo_runs (quiz_id, user_id, nickname, token_hash, question_ids)
  values (q, u, 'P1', 'h-latih-1', '{}'), (q, u, 'P1', 'h-latih-2', '{}');

  -- 10. Padam akaun pengguna (user_id set null) tidak dihalang kekangan.
  delete from auth.users where id = u;
  if exists (select 1 from public.qm_solo_runs where token_hash = 'h-ujian-t2' and user_id is not null) then
    raise exception 'GAGAL 10: user_id tidak menjadi null selepas akaun dipadam';
  end if;

  raise notice 'KZ-UTT: SEMUA UJIAN LULUS';
end $$;

rollback;
