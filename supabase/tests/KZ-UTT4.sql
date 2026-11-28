-- KZ-UTT4.sql: ujian penerimaan migrasi 0085 (pelan pengukuran, persetujuan,
-- log susulan dan baris gilir research_followup). Memerlukan 0083 dan 0084.
-- Jalankan dengan 0085 DI DALAM transaksi:
--   { echo 'begin;'; cat supabase/migrations/0085_susulan_kajian_solo.sql; sed '1,/^begin;$/d' supabase/tests/KZ-UTT4.sql; } \
--     | docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
-- Berakhir dengan rollback. "KZ-UTT4: SEMUA UJIAN LULUS" bermakna semua lulus.

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000c0e1', 'kzutt4-pensyarah@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000c0a1', 'kzutt4-p1@ujian.invalid',        'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-00000000c0e1', 'educator',    'Pensyarah KZ-UTT4', 'pro',  true, false, now()),
  ('00000000-0000-0000-0000-00000000c0a1', 'participant', 'P1 KZ-UTT4',        'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-00000000c0e1', 'Kelas KZ-UTT4');
insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-00000000c0a1');

insert into public.qm_live_quizzes (id, class_id, owner_id, title, solo_test_mode, solo_measure_point) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000cc01',
   '00000000-0000-0000-0000-00000000c0e1', 'Ujian KZ-UTT4', true, 'T1');

do $$
declare
  q uuid := '00000000-0000-0000-0000-00000000ca01';
  u uuid := '00000000-0000-0000-0000-00000000c0a1';
  k uuid := '00000000-0000-0000-0000-00000000cc01';
  f1 uuid; f2 uuid; gq uuid;
  n int;
  ok boolean;
begin
  -- 1. Pelan sah; sehari 30 s dan teks persetujuan terlalu pendek ditolak.
  insert into public.qm_solo_measure_plans (quiz_id, class_id, course_end_at, emails_enabled, consent_text)
  values (q, k, now() - interval '2 days', true, 'Saya bersetuju menyertai kajian ini.');
  ok := false;
  begin
    update public.qm_solo_measure_plans set day_length_sec = 30 where quiz_id = q;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 1: day_length_sec 30 diterima'; end if;
  ok := false;
  begin
    update public.qm_solo_measure_plans set consent_text = 'pendek' where quiz_id = q;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 1b: teks persetujuan 6 aksara diterima'; end if;
  ok := false;
  begin
    update public.qm_solo_measure_plans set module1_start_at = now() where quiz_id = q;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 1c: Modul 1 selepas tamat kursus diterima'; end if;

  -- 2. Persetujuan: keputusan tidak sah ditolak; satu baris setiap (kuiz, pengguna).
  ok := false;
  begin
    insert into public.qm_research_consents (quiz_id, user_id, decision, consent_version) values (q, u, 'maybe', 1);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 2: keputusan maybe diterima'; end if;
  insert into public.qm_research_consents (quiz_id, user_id, decision, consent_version) values (q, u, 'agree', 1);
  ok := false;
  begin
    insert into public.qm_research_consents (quiz_id, user_id, decision, consent_version) values (q, u, 'decline', 1);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 2b: dua persetujuan bagi pengguna sama'; end if;

  -- 3. Enqueue: satu susulan dan satu baris gilir research_followup.
  f1 := public.qm_research_enqueue_followup(q, u, k, 'T2', 0, 'course_end',
          now() - interval '2 days', now() - interval '1 day', now() + interval '12 days');
  if f1 is null then raise exception 'GAGAL 3: enqueue memulangkan null'; end if;
  select count(*) into n from public.qm_certificate_email_queue
   where followup_id = f1 and kind = 'research_followup' and status = 'queued'
     and idempotency_key = 'rf:' || f1::text and participant_id = u and class_id = k and certificate_id is null;
  if n <> 1 then raise exception 'GAGAL 3b: baris gilir research_followup tidak tepat (%)', n; end if;

  -- 4. Enqueue berulang tidak berbahaya: null, tiada baris tambahan.
  f2 := public.qm_research_enqueue_followup(q, u, k, 'T2', 0, 'course_end',
          now() - interval '2 days', now() - interval '1 day', now() + interval '12 days');
  if f2 is not null then raise exception 'GAGAL 4: enqueue pendua memulangkan id'; end if;
  select count(*) into n from public.qm_research_followups where quiz_id = q and user_id = u;
  if n <> 1 then raise exception 'GAGAL 4b: % susulan selepas enqueue pendua', n; end if;
  select count(*) into n from public.qm_certificate_email_queue where kind = 'research_followup' and participant_id = u;
  if n <> 1 then raise exception 'GAGAL 4c: % baris gilir selepas enqueue pendua', n; end if;

  -- 5. Peringatan (seq 1) baris berasingan dan boleh wujud serentak.
  f2 := public.qm_research_enqueue_followup(q, u, k, 'T2', 1, 'course_end',
          now() - interval '2 days', now(), now() + interval '12 days');
  if f2 is null then raise exception 'GAGAL 5: peringatan seq 1 ditolak'; end if;

  -- 6. E-mel nama aktif (name_request) bagi peserta dan kelas sama tidak bertembung.
  insert into public.qm_certificate_email_queue (class_id, participant_id, kind, idempotency_key)
  values (k, u, 'name_request', 'kzutt4-nama-1');
  ok := false;
  begin
    insert into public.qm_certificate_email_queue (class_id, participant_id, kind, idempotency_key)
    values (k, u, 'name_request', 'kzutt4-nama-2');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 6: dua name_request aktif diterima (indeks 0082 hilang)'; end if;

  -- 7. Kekangan jenis: research_followup tanpa followup_id ditolak; jenis lain ditolak.
  ok := false;
  begin
    insert into public.qm_certificate_email_queue (class_id, participant_id, kind, idempotency_key)
    values (k, u, 'research_followup', 'kzutt4-tanpa-f');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 7: research_followup tanpa followup_id diterima'; end if;
  ok := false;
  begin
    insert into public.qm_certificate_email_queue (class_id, participant_id, kind, idempotency_key)
    values (k, u, 'spam', 'kzutt4-spam');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 7b: jenis spam diterima'; end if;

  -- 8. Titik dan urutan tidak sah ditolak.
  ok := false;
  begin
    insert into public.qm_research_followups (quiz_id, user_id, class_id, point, seq, ref_source, ref_at, due_at, closes_at)
    values (q, u, k, 'T1', 0, 'join', now(), now(), now() + interval '1 day');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 8: susulan T1 diterima'; end if;
  ok := false;
  begin
    insert into public.qm_research_followups (quiz_id, user_id, class_id, point, seq, ref_source, ref_at, due_at, closes_at)
    values (q, u, k, 'T3', 3, 'join', now(), now(), now() + interval '1 day');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'GAGAL 8b: seq 3 diterima'; end if;

  -- 9. Tanda dihantar: baris gilir dan susulan dalam satu panggilan.
  select id into gq from public.qm_certificate_email_queue where followup_id = f1;
  perform public.qm_research_mark_sent(gq);
  if not exists (select 1 from public.qm_certificate_email_queue where id = gq and status = 'sent' and sent_at is not null) then
    raise exception 'GAGAL 9: baris gilir tidak sent';
  end if;
  if not exists (select 1 from public.qm_research_followups where id = f1 and status = 'sent' and sent_at is not null) then
    raise exception 'GAGAL 9b: susulan tidak sent';
  end if;

  -- 10. Fungsi pelayan sahaja: authenticated tiada hak laksana.
  if has_function_privilege('authenticated', 'public.qm_research_enqueue_followup(uuid, uuid, uuid, text, int, text, timestamptz, timestamptz, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.qm_research_mark_sent(uuid)', 'execute') then
    raise exception 'GAGAL 10: authenticated boleh melaksana fungsi susulan';
  end if;
  if has_table_privilege('authenticated', 'public.qm_research_consents', 'select')
     or has_table_privilege('anon', 'public.qm_research_followups', 'select') then
    raise exception 'GAGAL 10b: jadual kajian boleh dibaca terus';
  end if;

  -- 11. Padam kuiz melata ke pelan, persetujuan, susulan dan baris gilirnya.
  delete from public.qm_live_quizzes where id = q;
  if exists (select 1 from public.qm_solo_measure_plans where quiz_id = q)
     or exists (select 1 from public.qm_research_consents where quiz_id = q)
     or exists (select 1 from public.qm_research_followups where quiz_id = q)
     or exists (select 1 from public.qm_certificate_email_queue where kind = 'research_followup' and participant_id = u) then
    raise exception 'GAGAL 11: data kajian kekal selepas kuiz dipadam';
  end if;

  raise notice 'KZ-UTT4: SEMUA UJIAN LULUS';
end $$;

rollback;
