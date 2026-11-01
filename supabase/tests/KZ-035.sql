-- Ujian KZ-035: Learning Needs Analysis (migrasi 0070_lna.sql).
-- Dijalankan SELEPAS migrasi 0070 dipasang, dalam SATU transaksi yang
-- digulung semula sepenuhnya. Tiada data kekal.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/KZ-035.sql
-- Output akhir "KZ-035: SEMUA UJIAN LULUS" bermakna lulus.
--
-- Ikut pengajaran v2 dalam _umum.md: UUID heksadesimal sahaja,
-- lajur NOT NULL qm_profiles dihormati (role, plan, approved,
-- suspended), raise notice hanya dalam blok do.

begin;

-- Pengguna ujian. Pencetus qm_handle_new_user dimatikan sementara
-- supaya qm_profiles dikawal sepenuhnya di bawah (corak KZ-033).
set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000350e1', 'kz035-guru@ujian.invalid',    'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000350a1', 'kz035-pelajar@ujian.invalid', 'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000350e1', 'educator',    'Guru KZ-035',    'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000350a1', 'participant', 'Pelajar KZ-035', 'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000350c1', '00000000-0000-0000-0000-0000000350e1', 'Kelas Ujian KZ-035');

-- Tiga Outcomes ujian (lajur ikut skema: code boleh null, created_by
-- boleh null).
insert into public.qm_learning_outcomes (id, class_id, code, label) values
  ('00000000-0000-0000-0000-0000000350o1', '00000000-0000-0000-0000-0000000350c1', 'K1', 'Saya boleh membuat analisis keperluan'),
  ('00000000-0000-0000-0000-0000000350o2', '00000000-0000-0000-0000-0000000350c1', 'K2', 'Saya boleh mengira Borich'),
  ('00000000-0000-0000-0000-0000000350o3', '00000000-0000-0000-0000-0000000350c1', 'K3', 'Saya boleh membina laporan');

-- Satu LNA dengan tiga item.
insert into public.qm_lna (id, class_id, title, created_by) values
  ('00000000-0000-0000-0000-0000000350l1',
   '00000000-0000-0000-0000-0000000350c1',
   'LNA Ujian KZ-035',
   '00000000-0000-0000-0000-0000000350e1');

insert into public.qm_lna_items (lna_id, outcome_id, position) values
  ('00000000-0000-0000-0000-0000000350l1', '00000000-0000-0000-0000-0000000350o1', 1),
  ('00000000-0000-0000-0000-0000000350l1', '00000000-0000-0000-0000-0000000350o2', 2),
  ('00000000-0000-0000-0000-0000000350l1', '00000000-0000-0000-0000-0000000350o3', 3);

-- Ujian 1: CHECK skala 1 hingga 5 pada qm_lna_responses. Nilai 0 dan 6
-- ditolak pada kedua-dua lajur; 1 dan 5 diterima.
do $u$
declare
  v_lna     uuid := '00000000-0000-0000-0000-0000000350l1';
  v_p       uuid := '00000000-0000-0000-0000-0000000350a1';
  v_o1      uuid := '00000000-0000-0000-0000-0000000350o1';
  v_pusing  uuid;
begin
  insert into public.qm_lna_rounds (id, lna_id, kind) values
    ('00000000-0000-0000-0000-0000000350r1', v_lna, 'pre')
    returning id into v_pusing;

  begin
    insert into public.qm_lna_responses (round_id, user_id, outcome_id, importance, current_level)
      values (v_pusing, v_p, v_o1, 0, 3);
    raise exception 'UJIAN 1 GAGAL: importance 0 diterima';
  exception when check_violation then
    raise notice 'Ujian 1: importance 0 ditolak (betul)';
  end;
  begin
    insert into public.qm_lna_responses (round_id, user_id, outcome_id, importance, current_level)
      values (v_pusing, v_p, v_o1, 6, 3);
    raise exception 'UJIAN 1 GAGAL: importance 6 diterima';
  exception when check_violation then
    raise notice 'Ujian 1: importance 6 ditolak (betul)';
  end;
  begin
    insert into public.qm_lna_responses (round_id, user_id, outcome_id, importance, current_level)
      values (v_pusing, v_p, v_o1, 3, 0);
    raise exception 'UJIAN 1 GAGAL: current_level 0 diterima';
  exception when check_violation then
    raise notice 'Ujian 1: current_level 0 ditolak (betul)';
  end;
  begin
    insert into public.qm_lna_responses (round_id, user_id, outcome_id, importance, current_level)
      values (v_pusing, v_p, v_o1, 3, 6);
    raise exception 'UJIAN 1 GAGAL: current_level 6 diterima';
  exception when check_violation then
    raise notice 'Ujian 1: current_level 6 ditolak (betul)';
  end;

  -- Hujung julat 1 dan 5 sah, dan bebas didiskriminasi (kanak-kanak
  -- nombor bulat sahaja masuk).
  insert into public.qm_lna_responses (round_id, user_id, outcome_id, importance, current_level)
    values (v_pusing, v_p, v_o1, 1, 5);
  raise notice 'Ujian 1: hujung julat 1 dan 5 diterima (betul)';
end $u$;

-- Ujian 2: CHECK kind dan status pada qm_lna_rounds.
do $u$
declare
  v_lna  uuid := '00000000-0000-0000-0000-0000000350l1';
  v_guru uuid := '00000000-0000-0000-0000-0000000350e1';
begin
  begin
    insert into public.qm_lna_rounds (lna_id, kind) values (v_lna, 'pra');
    raise exception 'UJIAN 2 GAGAL: kind pra diterima';
  exception when check_violation then
    raise notice 'Ujian 2: kind luar senarai ditolak (betul)';
  end;
  begin
    insert into public.qm_lna_rounds (lna_id, kind, status) values (v_lna, 'post', 'buka');
    raise exception 'UJIAN 2 GAGAL: status buka diterima';
  exception when check_violation then
    raise notice 'Ujian 2: status luar senarai ditolak (betul)';
  end;
  -- Pasangan sah diterima.
  insert into public.qm_lna_rounds (lna_id, kind, status) values (v_lna, 'post', 'closed');
  raise notice 'Ujian 2: kind dan status sah diterima (betul)';
end $u$;

-- Ujian 3: unique (lna_id, kind). Pusingan pra kedua ditolak.
do $u$
declare
  v_lna uuid := '00000000-0000-0000-0000-0000000350l1';
begin
  begin
    insert into public.qm_lna_rounds (lna_id, kind) values (v_lna, 'pre');
    raise exception 'UJIAN 3 GAGAL: pusingan pra kedua diterima';
  exception when unique_violation then
    raise notice 'Ujian 3: pusingan pra kedua ditolak oleh unique (lna_id, kind) (betul)';
  end;
end $u$;

-- Ujian 4: padam kelas bermaksud padam LNA + item + pusingan + jawapan
-- (cascade berantai tiga aras).
do $u$
declare
  v_kelas   uuid := '00000000-0000-0000-0000-0000000350c1';
  v_lna     uuid := '00000000-0000-0000-0000-0000000350l1';
  v_jawapan int;
  v_pusing  int;
  v_item    int;
begin
  -- Pastikan ada sekurang-kurangnya satu jawapan sebelum padam.
  select count(*) into v_jawapan from public.qm_lna_responses
    where round_id in (select id from public.qm_lna_rounds where lna_id = v_lna);
  if v_jawapan < 1 then
    raise exception 'UJIAN 4 GAGAL: persediaan jawapan % (< 1)', v_jawapan;
  end if;

  delete from public.qm_classes where id = v_kelas;

  select count(*) into v_jawapan from public.qm_lna_responses
    where round_id in (select id from public.qm_lna_rounds where lna_id = v_lna);
  if v_jawapan <> 0 then
    raise exception 'UJIAN 4 GAGAL: % jawapan masih wujud selepas cascade', v_jawapan;
  end if;
  select count(*) into v_pusing from public.qm_lna_rounds where lna_id = v_lna;
  if v_pusing <> 0 then
    raise exception 'UJIAN 4 GAGAL: % pusingan masih wujud selepas cascade', v_pusing;
  end if;
  select count(*) into v_item from public.qm_lna_items where lna_id = v_lna;
  if v_item <> 0 then
    raise exception 'UJIAN 4 GAGAL: % item masih wujud selepas cascade', v_item;
  end if;
  raise notice 'Ujian 4: padam kelas merentap LNA, pusingan dan jawapan (betul)';
end $u$;

-- Ujian 5: keizinan. anon dan authenticated tidak boleh baca mana-mana
-- jadual qm_lna_* (REVOKE dalam migrasi 0070).
do $u$
begin
  if has_table_privilege('anon', 'public.qm_lna', 'select')
     or has_table_privilege('authenticated', 'public.qm_lna', 'select') then
    raise exception 'UJIAN 5 GAGAL: anon/authenticated boleh baca qm_lna';
  end if;
  if has_table_privilege('anon', 'public.qm_lna_items', 'select')
     or has_table_privilege('authenticated', 'public.qm_lna_items', 'select') then
    raise exception 'UJIAN 5 GAGAL: anon/authenticated boleh baca qm_lna_items';
  end if;
  if has_table_privilege('anon', 'public.qm_lna_rounds', 'select')
     or has_table_privilege('authenticated', 'public.qm_lna_rounds', 'select') then
    raise exception 'UJIAN 5 GAGAL: anon/authenticated boleh baca qm_lna_rounds';
  end if;
  if has_table_privilege('anon', 'public.qm_lna_responses', 'select')
     or has_table_privilege('authenticated', 'public.qm_lna_responses', 'select') then
    raise exception 'UJIAN 5 GAGAL: anon/authenticated boleh baca qm_lna_responses';
  end if;
  raise notice 'Ujian 5: keizinan anon/authenticated ditutup pada semua jadual (betul)';
end $u$;

-- Ujian 6: CHECK panjang tajuk LNA (1 hingga 120 aksara). Kelas dibina
-- semula kerana Ujian 4 memadamnya melalui cascade.
do $u$
declare
  v_kelas uuid := '00000000-0000-0000-0000-0000000350c1';
  v_guru  uuid := '00000000-0000-0000-0000-0000000350e1';
begin
  insert into public.qm_classes (id, owner_id, name) values
    (v_kelas, v_guru, 'Kelas Ujian KZ-035 (kedua)');
  begin
    insert into public.qm_lna (class_id, title, created_by) values (v_kelas, '', v_guru);
    raise exception 'UJIAN 6 GAGAL: tajuk kosong diterima';
  exception when check_violation then
    raise notice 'Ujian 6: tajuk kosong ditolak (betul)';
  end;
  begin
    insert into public.qm_lna (class_id, title, created_by)
      values (v_kelas, repeat('x', 121), v_guru);
    raise exception 'UJIAN 6 GAGAL: tajuk 121 aksara diterima';
  exception when check_violation then
    raise notice 'Ujian 6: tajuk 121 aksara ditolak (betul)';
  end;
end $u$;

do $$ begin raise notice 'KZ-035: SEMUA UJIAN LULUS'; end $$;

rollback;
