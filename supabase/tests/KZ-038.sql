-- Ujian KZ-038: item LNA bebas (migrasi 0073_lna_item_bebas.sql).
-- Dijalankan SELEPAS migrasi 0073 dipasang, dalam SATU transaksi yang
-- digulung semula sepenuhnya. Tiada data kekal.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/KZ-038.sql
-- Output akhir "KZ-038: SEMUA UJIAN LULUS" bermakna lulus.
--
-- Ikut pengajaran v2: UUID heksadesimal sahaja; sisip auth.users dengan
-- session_replication_role = replica untuk sisipan itu sahaja supaya
-- pencetus qm_handle_new_user tidak mencipta profil automatik; lajur NOT
-- NULL qm_profiles dihormati; raise notice hanya dalam blok do.

begin;

-- Pengguna ujian (pencetus qm_handle_new_user dimatikan buat sementara,
-- corak KZ-035).
set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000038e1', 'kz038-guru@ujian.invalid',    'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000038a1', 'kz038-pelajar@ujian.invalid', 'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000038e1', 'educator',    'Guru KZ-038',    'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000038a1', 'participant', 'Pelajar KZ-038', 'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-0000000038e1', 'Kelas Ujian KZ-038');

-- Tiga Outcomes ujian.
insert into public.qm_learning_outcomes (id, class_id, code, label) values
  ('00000000-0000-0000-0000-0000000038d1', '00000000-0000-0000-0000-0000000038c1', 'K1', 'Saya boleh item Outcome 1'),
  ('00000000-0000-0000-0000-0000000038d2', '00000000-0000-0000-0000-0000000038c1', 'K2', 'Saya boleh item Outcome 2'),
  ('00000000-0000-0000-0000-0000000038d3', '00000000-0000-0000-0000-0000000038c1', 'K3', 'Saya boleh item Outcome 3');

-- Satu LNA.
insert into public.qm_lna (id, class_id, title, created_by) values
  ('00000000-0000-0000-0000-0000000038f1',
   '00000000-0000-0000-0000-0000000038c1',
   'LNA Ujian KZ-038',
   '00000000-0000-0000-0000-0000000038e1');

-- Ujian 1: LNA gaya lama (item Outcome + jawapan) selepas migrasi. Item
-- mendapat id automatik; jawapan mengisi item_id; PK baharu
-- (round_id, user_id, item_id) berfungsi: upsert ulangan tidak mencipta
-- pendua.
do $u$
declare
  v_lna    uuid := '00000000-0000-0000-0000-0000000038f1';
  v_pelajar uuid := '00000000-0000-0000-0000-0000000038a1';
  v_o1     uuid := '00000000-0000-0000-0000-0000000038d1';
  v_pusing uuid := '00000000-0000-0000-0000-0000000038b1';
  v_item   uuid;
  v_n      int;
  v_imp    int;
begin
  insert into public.qm_lna_rounds (id, lna_id, kind) values
    (v_pusing, v_lna, 'pre');

  -- Item gaya lama: outcome_id sahaja; id dijana oleh DEFAULT.
  insert into public.qm_lna_items (lna_id, outcome_id, position) values
    (v_lna, '00000000-0000-0000-0000-0000000038d1', 1),
    (v_lna, '00000000-0000-0000-0000-0000000038d2', 2),
    (v_lna, '00000000-0000-0000-0000-0000000038d3', 3);

  select id into v_item from public.qm_lna_items
    where lna_id = v_lna and outcome_id = v_o1;
  if v_item is null then
    raise exception 'UJIAN 1 GAGAL: id item tidak terisi';
  end if;

  -- Jawapan mengisi item_id dan outcome_id (item Outcome).
  insert into public.qm_lna_responses (round_id, user_id, item_id, outcome_id, importance, current_level)
    values (v_pusing, v_pelajar, v_item, v_o1, 4, 3);

  -- Upsert ulangan atas PK baharu: satu baris sahaja, nilai dikemas kini.
  insert into public.qm_lna_responses (round_id, user_id, item_id, outcome_id, importance, current_level)
    values (v_pusing, v_pelajar, v_item, v_o1, 5, 4)
    on conflict (round_id, user_id, item_id) do update
      set importance = excluded.importance,
          current_level = excluded.current_level;

  select count(*) into v_n from public.qm_lna_responses
    where round_id = v_pusing and user_id = v_pelajar and item_id = v_item;
  if v_n <> 1 then
    raise exception 'UJIAN 1 GAGAL: % baris selepas upsert ulangan (mesti 1)', v_n;
  end if;
  select importance into v_imp from public.qm_lna_responses
    where round_id = v_pusing and user_id = v_pelajar and item_id = v_item;
  if v_imp <> 5 then
    raise exception 'UJIAN 1 GAGAL: importance % selepas upsert (mesti 5)', v_imp;
  end if;
  raise notice 'Ujian 1: item_id terisi dan PK baharu menolak pendua upsert (betul)';
end $u$;

-- Ujian 2: item bebas. Item dengan label sahaja berjaya; item dengan
-- KEDUA-DUA label dan outcome_id, atau kedua-duanya null, ditolak oleh
-- CHECK qm_lna_items_tepat_satu.
do $u$
declare
  v_lna uuid := '00000000-0000-0000-0000-0000000038f1';
  v_o1  uuid := '00000000-0000-0000-0000-0000000038d1';
begin
  insert into public.qm_lna_items (lna_id, label, position)
    values (v_lna, 'Kemahiran insaniah', 4);
  raise notice 'Ujian 2: item label sahaja diterima (betul)';

  begin
    insert into public.qm_lna_items (lna_id, outcome_id, label, position)
      values (v_lna, v_o1, 'Hantu dua medan', 5);
    raise exception 'UJIAN 2 GAGAL: item dengan label dan outcome_id diterima';
  exception when check_violation then
    raise notice 'Ujian 2: item dengan kedua-dua label dan outcome_id ditolak (betul)';
  end;

  begin
    insert into public.qm_lna_items (lna_id, position) values (v_lna, 6);
    raise exception 'UJIAN 2 GAGAL: item tanpa label dan tanpa outcome_id diterima';
  exception when check_violation then
    raise notice 'Ujian 2: item kedua-duanya null ditolak (betul)';
  end;
end $u$;

-- Ujian 3: satu Outcome sekali sahaja dalam satu LNA (unique lna_id +
-- outcome_id); dua item bebas dalam satu LNA dibenarkan (NULL tidak
-- bertembung dalam unique).
do $u$
declare
  v_lna uuid := '00000000-0000-0000-0000-0000000038f1';
  v_o1  uuid := '00000000-0000-0000-0000-0000000038d1';
  v_n   int;
begin
  begin
    insert into public.qm_lna_items (lna_id, outcome_id, position)
      values (v_lna, v_o1, 7);
    raise exception 'UJIAN 3 GAGAL: Outcome sama dua kali diterima';
  exception when unique_violation then
    raise notice 'Ujian 3: Outcome sama dua kali ditolak oleh unique (lna_id, outcome_id) (betul)';
  end;

  insert into public.qm_lna_items (lna_id, label, position)
    values (v_lna, 'Guna alat makmal', 8);
  select count(*) into v_n from public.qm_lna_items
    where lna_id = v_lna and outcome_id is null;
  if v_n <> 2 then
    raise exception 'UJIAN 3 GAGAL: % item bebas (mesti 2)', v_n;
  end if;
  raise notice 'Ujian 3: dua item bebas dalam satu LNA dibenarkan (betul)';
end $u$;

-- Ujian 4: jawapan item bebas (outcome_id null) disimpan; padam item ->
-- jawapannya dipadam (cascade item_id); padam Outcome -> item Outcome dan
-- jawapannya dipadam (cascade berantai).
do $u$
declare
  v_lna     uuid := '00000000-0000-0000-0000-0000000038f1';
  v_o1      uuid := '00000000-0000-0000-0000-0000000038d1';
  v_pelajar uuid := '00000000-0000-0000-0000-0000000038a1';
  v_pusing  uuid := '00000000-0000-0000-0000-0000000038b1';
  v_bebas   uuid;
  v_n       int;
begin
  select id into v_bebas from public.qm_lna_items
    where lna_id = v_lna and label = 'Kemahiran insaniah';
  if v_bebas is null then
    raise exception 'UJIAN 4 GAGAL: item bebas tiada';
  end if;

  insert into public.qm_lna_responses (round_id, user_id, item_id, outcome_id, importance, current_level)
    values (v_pusing, v_pelajar, v_bebas, null, 5, 2);

  select count(*) into v_n from public.qm_lna_responses
    where item_id = v_bebas and outcome_id is null;
  if v_n <> 1 then
    raise exception 'UJIAN 4 GAGAL: jawapan item bebas tidak disimpan dengan outcome_id null';
  end if;
  raise notice 'Ujian 4: jawapan item bebas disimpan dengan outcome_id null (betul)';

  -- Padam item bebas: jawapannya turut padam (on delete cascade).
  delete from public.qm_lna_items where id = v_bebas;
  select count(*) into v_n from public.qm_lna_responses where item_id = v_bebas;
  if v_n <> 0 then
    raise exception 'UJIAN 4 GAGAL: % jawapan masih wujud selepas item dipadam', v_n;
  end if;
  raise notice 'Ujian 4: padam item memadam jawapannya melalui cascade (betul)';

  -- Padam Outcome: item Outcome dan jawapannya turut padam.
  select count(*) into v_n from public.qm_lna_items where lna_id = v_lna and outcome_id = v_o1;
  if v_n <> 1 then
    raise exception 'UJIAN 4 GAGAL: persediaan item Outcome % (mesti 1)', v_n;
  end if;
  delete from public.qm_learning_outcomes where id = v_o1;
  select count(*) into v_n from public.qm_lna_items
    where lna_id = v_lna and outcome_id = v_o1;
  if v_n <> 0 then
    raise exception 'UJIAN 4 GAGAL: item Outcome masih wujud selepas Outcome dipadam';
  end if;
  select count(*) into v_n from public.qm_lna_responses r
    where not exists (
      select 1 from public.qm_lna_items i where i.id = r.item_id
    );
  if v_n <> 0 then
    raise exception 'UJIAN 4 GAGAL: % jawapan yatim selepas cascade', v_n;
  end if;
  raise notice 'Ujian 4: padam Outcome memadam item Outcome dan jawapannya (betul)';
end $u$;

-- Ujian 5: label kosong atau lebih 200 aksara ditolak oleh CHECK
-- qm_lna_items_label_panjang (btrim diambil kira: ruang kosong sahaja
-- dikira kosong).
do $u$
declare
  v_lna uuid := '00000000-0000-0000-0000-0000000038f1';
begin
  begin
    insert into public.qm_lna_items (lna_id, label, position) values (v_lna, '', 9);
    raise exception 'UJIAN 5 GAGAL: label kosong diterima';
  exception when check_violation then
    raise notice 'Ujian 5: label kosong ditolak (betul)';
  end;
  begin
    insert into public.qm_lna_items (lna_id, label, position) values (v_lna, '   ', 10);
    raise exception 'UJIAN 5 GAGAL: label ruang kosong sahaja diterima';
  exception when check_violation then
    raise notice 'Ujian 5: label ruang kosong sahaja ditolak (betul)';
  end;
  begin
    insert into public.qm_lna_items (lna_id, label, position)
      values (v_lna, repeat('x', 201), 11);
    raise exception 'UJIAN 5 GAGAL: label 201 aksara diterima';
  exception when check_violation then
    raise notice 'Ujian 5: label 201 aksara ditolak (betul)';
  end;
  -- Hujung 200 aksara masih sah.
  insert into public.qm_lna_items (lna_id, label, position)
    values (v_lna, repeat('y', 200), 12);
  raise notice 'Ujian 5: label tepat 200 aksara diterima (betul)';
end $u$;

do $$ begin raise notice 'KZ-038: SEMUA UJIAN LULUS'; end $$;

rollback;
