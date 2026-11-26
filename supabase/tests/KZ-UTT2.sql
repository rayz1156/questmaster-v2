-- KZ-UTT2.sql: ujian penerimaan migrasi 0084 (item tinjauan Lumba Solo).
-- Memerlukan 0083 sudah diterap. Jalankan dengan 0084 DI DALAM transaksi:
--   { echo 'begin;'; cat supabase/migrations/0084_tinjauan_solo.sql; sed '1,/^begin;$/d' supabase/tests/KZ-UTT2.sql; } \
--     | docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
-- Berakhir dengan rollback. "KZ-UTT2: SEMUA UJIAN LULUS" bermakna semua lulus.

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000b0e1', 'kzutt2-pensyarah@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000b0a1', 'kzutt2-p1@ujian.invalid',        'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-00000000b0e1', 'educator',    'Pensyarah KZ-UTT2', 'pro',  true, false, now()),
  ('00000000-0000-0000-0000-00000000b0a1', 'participant', 'P1 KZ-UTT2',        'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000bc01', '00000000-0000-0000-0000-00000000b0e1', 'Kelas KZ-UTT2');

insert into public.qm_live_quizzes (id, class_id, owner_id, title, solo_test_mode, solo_measure_point) values
  ('00000000-0000-0000-0000-00000000ba01', '00000000-0000-0000-0000-00000000bc01',
   '00000000-0000-0000-0000-00000000b0e1', 'Ujian KZ-UTT2', true, 'T1');

do $$
declare
  q uuid := '00000000-0000-0000-0000-00000000ba01';
  u uuid := '00000000-0000-0000-0000-00000000b0a1';
  i1 uuid; i2 uuid; r uuid;
  ok boolean;
begin
  -- 1. Item sah: MAILS 0 hingga 10 (T1, T2) dan pemindahan 1 hingga 5 (T3).
  insert into public.qm_solo_survey_items (quiz_id, position, code, construct, prompt, scale_min, scale_max, points)
  values (q, 0, 'MAILS_01', 'MAILS', 'Saya boleh mengendalikan aplikasi AI.', 0, 10, array['T1','T2'])
  returning id into i1;
  insert into public.qm_solo_survey_items (quiz_id, position, code, construct, prompt, scale_min, scale_max, points)
  values (q, 1, 'PIND_01', 'PEMINDAHAN', 'Saya telah menggunakan AI dalam kerja saya.', 1, 5, array['T3'])
  returning id into i2;

  -- 2. Skala tidak sah ditolak.
  ok := false;
  begin
    insert into public.qm_solo_survey_items (quiz_id, prompt, scale_min, scale_max) values (q, 'x', 2, 5);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 2: scale_min 2 diterima'; end if;
  ok := false;
  begin
    insert into public.qm_solo_survey_items (quiz_id, prompt, scale_min, scale_max) values (q, 'x', 1, 1);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 2b: scale_max = scale_min diterima'; end if;

  -- 3. Titik tidak sah dan senarai kosong ditolak.
  ok := false;
  begin
    insert into public.qm_solo_survey_items (quiz_id, prompt, scale_min, scale_max, points) values (q, 'x', 1, 5, array['T4']);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 3: titik T4 diterima'; end if;
  ok := false;
  begin
    insert into public.qm_solo_survey_items (quiz_id, prompt, scale_min, scale_max, points) values (q, 'x', 1, 5, array[]::text[]);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 3b: titik kosong diterima'; end if;

  -- 4. Penapis titik (pertanyaan API: points @> {T1}).
  if (select count(*) from public.qm_solo_survey_items where quiz_id = q and points @> array['T1']) <> 1 then
    raise exception 'GAGAL 4: penapis T1 bukan 1 item';
  end if;

  -- 5. Jawapan disimpan; satu nilai bagi setiap larian dan item (upsert).
  insert into public.qm_solo_runs (quiz_id, user_id, nickname, token_hash, question_ids, test_mode, measure_point)
  values (q, u, 'P1', 'h-utt2-t1', '{}', true, 'T1') returning id into r;
  insert into public.qm_solo_survey_answers (run_id, item_id, value) values (r, i1, 7);
  insert into public.qm_solo_survey_answers (run_id, item_id, value) values (r, i1, 8)
    on conflict (run_id, item_id) do update set value = excluded.value;
  if (select value from public.qm_solo_survey_answers where run_id = r and item_id = i1) <> 8 then
    raise exception 'GAGAL 5: upsert tidak mengemas kini nilai';
  end if;

  -- 6. Item yang sudah dijawab tidak boleh dipadam (data kajian dilindungi).
  ok := false;
  begin
    delete from public.qm_solo_survey_items where id = i1;
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 6: item berjawapan dapat dipadam'; end if;

  -- 7. Item tanpa jawapan boleh dipadam.
  delete from public.qm_solo_survey_items where id = i2;

  -- 8. Padam larian membuang jawapannya (cascade), kemudian item boleh dipadam.
  delete from public.qm_solo_runs where id = r;
  if exists (select 1 from public.qm_solo_survey_answers where run_id = r) then
    raise exception 'GAGAL 8: jawapan kekal selepas larian dipadam';
  end if;
  delete from public.qm_solo_survey_items where id = i1;

  -- 9. Kuiz dengan item berjawapan masih boleh dipadam (lata penuh).
  insert into public.qm_solo_survey_items (quiz_id, prompt, scale_min, scale_max) values (q, 'y', 1, 5) returning id into i2;
  insert into public.qm_solo_runs (quiz_id, user_id, nickname, token_hash, question_ids, test_mode, measure_point)
  values (q, u, 'P1', 'h-utt2-t1b', '{}', true, 'T1') returning id into r;
  insert into public.qm_solo_survey_answers (run_id, item_id, value) values (r, i2, 3);
  delete from public.qm_live_quizzes where id = q;
  if exists (select 1 from public.qm_solo_survey_items where quiz_id = q) then
    raise exception 'GAGAL 9: item kekal selepas kuiz dipadam';
  end if;

  raise notice 'KZ-UTT2: SEMUA UJIAN LULUS';
end $$;

rollback;
