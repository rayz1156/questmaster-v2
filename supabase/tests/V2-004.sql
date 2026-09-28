-- V2-004.sql: ujian penerimaan aliran sertai kelas (normalisasi kod, pratonton, RPC).
--
-- Jalankan pada pelayan (CTO):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/tests/V2-004.sql
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya, jadi tiada data ujian kekal. Setiap semakan mencetak
-- "UJIAN N LULUS" atau "UJIAN N GAGAL" melalui RAISE NOTICE; jika ada
-- kegagalan, ralat dibangkitkan pada hujung blok supaya exit code mengambil
-- kira kegagalan. Corak pengguna palsu ikut supabase/tests/KZ-001.sql.
--
-- Nota pembaikan 29 Sep: dalam plpgsql, `select set_config(...)` tanpa INTO
-- gagal dengan "query has no destination for result data" kerana set_config
-- memulangkan text. Di dalam blok DO guna PERFORM; di peringkat psql biasa
-- select set_config masih dibenarkan.

\set ON_ERROR_STOP on

begin;

-- ============================================================
-- 0. Data asas: dua pengguna pelajar, satu pendidik, tiga kelas
-- ============================================================
-- session_replication_role = replica melumpuhkan pencetus auth.users supaya
-- sisipan tanpa kata laluan diterima (corak sama seperti KZ-001.sql:26).
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'v2-004-e1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a1', 'v2-004-a1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b1', 'v2-004-b1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000c1', 'v2-004-c1@ujian.invalid', 'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'educator',    'Pensyarah Sertai', 'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000000a1', 'participant', 'Aisyah Sertai',    'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000000b1', 'participant', 'Baharu Sertai',    'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000000c1', 'participant', 'Chong Sertai',     'free', true, false, now());

-- Kelas aktif: kod hex sah lapan aksara, warna terkenal.
insert into public.qm_classes (id, owner_id, name, color, join_code) values
  ('00000000-0000-0000-0000-000000004c01', '00000000-0000-0000-0000-0000000000e1', 'Kelas Sertai Aktif', '#6366f1', 'AB01CD34');

-- Kelas tamat: kod berbeza, ended_at diisi selepas sisipan.
insert into public.qm_classes (id, owner_id, name, color, join_code) values
  ('00000000-0000-0000-0000-000000004c02', '00000000-0000-0000-0000-0000000000e1', 'Kelas Sertai Tamat', '#f59e0b', 'FFFF0000');
update public.qm_classes set ended_at = now() where id = '00000000-0000-0000-0000-000000004c02';

-- Kelas diarkib.
insert into public.qm_classes (id, owner_id, name, color, join_code, is_archived) values
  ('00000000-0000-0000-0000-000000004c03', '00000000-0000-0000-0000-0000000000e1', 'Kelas Sertai Arkib', '#94a3b8', 'DEADBEEF', true);

-- ============================================================
-- UJIAN 1: normalisasi kod (unit, sebagai pentadbir)
-- ============================================================
do $u$
declare
  v_gagal int := 0;
  v text;
begin
  -- Contoh daripada tiket: " ab-cd 12o1 " -> ABCD1201
  v := public.qm_normalize_class_code(' ab-cd 12o1 ');
  if v = 'ABCD1201' then
    raise notice 'UJIAN 1a LULUS: jarak dan sengkang dibuang, O jadi 0 (%)', v;
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 1a GAGAL: jangka ABCD1201, dapat %', v;
  end if;

  -- Contoh daripada tiket: "il0o" -> 1100
  v := public.qm_normalize_class_code('il0o');
  if v = '1100' then
    raise notice 'UJIAN 1b LULUS: I dan L jadi 1 (%)', v;
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 1b GAGAL: jangka 1100, dapat %', v;
  end if;

  -- NULL masuk, NULL keluar.
  if public.qm_normalize_class_code(null) is null then
    raise notice 'UJIAN 1c LULUS: NULL masuk NULL keluar';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 1c GAGAL: NULL tidak dipulangkan';
  end if;

  -- Rentetan kosong: nullif menjadikannya NULL.
  if public.qm_normalize_class_code('') is null then
    raise notice 'UJIAN 1d LULUS: rentetan kosong menjadi NULL';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 1d GAGAL: rentetan kosong tidak NULL';
  end if;

  -- Garis bawah dibuang, huruf kecil dinaikkan.
  v := public.qm_normalize_class_code('ab_cd34');
  if v = 'ABCD34' then
    raise notice 'UJIAN 1e LULUS: garis bawah dibuang (%)', v;
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 1e GAGAL: jangka ABCD34, dapat %', v;
  end if;

  if v_gagal > 0 then raise exception 'UJIAN 1: % semakan gagal', v_gagal; end if;
end $u$;

-- ============================================================
-- UJIAN 2: sertai dengan kod huruf kecil bersambung sengkang
-- Aisyah belum ahli; kod 'ab01-cd34' menemui kelas AB01CD34.
-- ============================================================
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1"}', true);
set local role authenticated;

do $u$
declare
  v_id uuid;
begin
  v_id := public.qm_join_class_by_code('ab01-cd34');
  if v_id = '00000000-0000-0000-0000-000000004c01' then
    raise notice 'UJIAN 2 LULUS: kod huruf kecil dengan sengkang berjaya sertai';
  else
    raise exception 'UJIAN 2 GAGAL: jangka kelas c01, dapat %', coalesce(v_id::text, 'NULL');
  end if;
end $u$;

-- ============================================================
-- UJIAN 3: sertai dengan O menggantikan 0
-- Baharu menaip ABO1CD34 (huruf O, bukan digit 0).
-- ============================================================
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000b1"}', true);

do $u$
declare
  v_id uuid;
begin
  v_id := public.qm_join_class_by_code('ABO1CD34');
  if v_id = '00000000-0000-0000-0000-000000004c01' then
    raise notice 'UJIAN 3 LULUS: kod dengan huruf O berjaya sertai kelas yang betul';
  else
    raise exception 'UJIAN 3 GAGAL: jangka kelas c01, dapat %', coalesce(v_id::text, 'NULL');
  end if;
end $u$;

-- ============================================================
-- UJIAN 4: kelas tamat ditolak dengan mesej tepat
-- ============================================================
do $u$
begin
  begin
    perform public.qm_join_class_by_code('FFFF0000');
    raise exception 'UJIAN 4 GAGAL: kelas tamat diterima';
  exception when others then
    if sqlerrm like 'UJIAN 4 GAGAL%' then raise; end if;
    if sqlerrm not like 'This class has ended and is no longer accepting new members' then
      raise exception 'UJIAN 4 GAGAL: mesej salah: %', sqlerrm;
    end if;
    raise notice 'UJIAN 4 LULUS: kelas tamat ditolak dengan mesej yang betul';
  end;
end $u$;

-- ============================================================
-- UJIAN 5: kelas diarkib tiada pratonton dan tidak boleh disertai
-- ============================================================
do $u$
declare
  v int;
  v_gagal int := 0;
begin
  select count(*) into v from public.qm_class_preview_by_code('DEADBEEF');
  if v = 0 then
    raise notice 'UJIAN 5a LULUS: kelas diarkib tiada baris pratonton';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 5a GAGAL: pratonton kelas diarkib pulangkan % baris', v;
  end if;

  begin
    perform public.qm_join_class_by_code('DEADBEEF');
    raise exception 'UJIAN 5b GAGAL: kelas diarkib diterima';
  exception when others then
    if sqlerrm like 'UJIAN 5b GAGAL%' then raise; end if;
    if sqlerrm not like 'Invalid class code' then
      raise exception 'UJIAN 5b GAGAL: mesej salah: %', sqlerrm;
    end if;
    raise notice 'UJIAN 5b LULUS: kelas diarkib ditolak dengan Invalid class code';
  end;

  if v_gagal > 0 then raise exception 'UJIAN 5: % semakan gagal', v_gagal; end if;
end $u$;

-- ============================================================
-- UJIAN 6: anon tidak boleh panggil pratonton
-- ============================================================
set local role anon;

do $u$
begin
  begin
    perform * from public.qm_class_preview_by_code('AB01CD34');
    raise exception 'UJIAN 6 GAGAL: anon berjaya panggil pratonton';
  exception when others then
    if sqlerrm like 'UJIAN 6 GAGAL%' then raise; end if;
    if sqlerrm not like 'permission denied%' then
      raise exception 'UJIAN 6 GAGAL: ralat yang salah: %', sqlerrm;
    end if;
    raise notice 'UJIAN 6 LULUS: anon ditolak (permission denied)';
  end;
end $u$;

-- Kembali ke authenticated sebagai Chong (belum ahli) untuk pratonton.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1"}', true);

-- ============================================================
-- UJIAN 7: already_member betul selepas sertai
-- Aisyah dan Baharu sudah ahli (Ujian 2 dan 3); Chong belum.
-- ============================================================
do $u$
declare
  r record;
  v int;
  v_gagal int := 0;
begin
  -- Chong: belum ahli, false.
  select * into r from public.qm_class_preview_by_code('ab01 cd34');
  if r.already_member = false then
    raise notice 'UJIAN 7a LULUS: bukan ahli already_member false';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 7a GAGAL: already_member jangka false, dapat %', r.already_member;
  end if;

  -- Aisyah: sudah ahli selepas Ujian 2, true. Guna kod dengan O juga.
  -- PERFORM, bukan select: set_config memulangkan nilai dan plpgsql
  -- menuntut destination (punca ralat asal "query has no destination").
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1"}', true);
  select * into r from public.qm_class_preview_by_code('abo1cd34');
  if r.already_member = true then
    raise notice 'UJIAN 7b LULUS: ahli sedia ada already_member true';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 7b GAGAL: already_member jangka true, dapat %', r.already_member;
  end if;

  -- Kelas tamat: is_ended true, already_member false.
  select * into r from public.qm_class_preview_by_code('FFFF0000');
  if r.is_ended = true and r.already_member = false then
    raise notice 'UJIAN 7c LULUS: is_ended true untuk kelas tamat';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 7c GAGAL: is_ended %, already_member % (jangka true, false)', r.is_ended, r.already_member;
  end if;

  -- Kod tidak ditemui: tiada baris.
  select count(*) into v from public.qm_class_preview_by_code('00000000');
  if v = 0 then
    raise notice 'UJIAN 7d LULUS: kod tidak wujud tiada baris';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 7d GAGAL: kod tidak wujud pulangkan % baris', v;
  end if;

  if v_gagal > 0 then raise exception 'UJIAN 7: % semakan gagal', v_gagal; end if;
end $u$;

-- ============================================================
-- UJIAN 8: pratonton tidak mendedahkan lajur lain
-- 8a hingga 8f menyemak nilai enam lajur mengikut nama. Untuk bilangan
-- lajur, UJIAN 8g mengira lajur hasil secara eksplisit: target record
-- menerima sebarang bilangan lajur tanpa ralat, jadi kiraan itu satu
-- satunya cara sebenar mengesan lajur bocor (emel, owner_id dan sebagainya).
-- ============================================================
do $u$
declare
  r record;
  v int;
  v_gagal int := 0;
begin
  select * into r from public.qm_class_preview_by_code('AB01CD34');
  if r.class_id = '00000000-0000-0000-0000-000000004c01' then
    raise notice 'UJIAN 8a LULUS: class_id betul';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 8a GAGAL: class_id %', r.class_id;
  end if;

  if r.class_name = 'Kelas Sertai Aktif' then
    raise notice 'UJIAN 8b LULUS: class_name betul';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 8b GAGAL: class_name %', r.class_name;
  end if;

  if r.educator_name = 'Pensyarah Sertai' then
    raise notice 'UJIAN 8c LULUS: educator_name betul (display_name pemilik)';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 8c GAGAL: educator_name %', r.educator_name;
  end if;

  if r.class_color = '#6366f1' then
    raise notice 'UJIAN 8d LULUS: class_color betul';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 8d GAGAL: class_color %', r.class_color;
  end if;

  if r.is_ended = false then
    raise notice 'UJIAN 8e LULUS: is_ended false untuk kelas aktif';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 8e GAGAL: is_ended jangka false, dapat %', r.is_ended;
  end if;

  -- Tiada nilai seperti emel dalam mana mana lajur teks yang dipulangkan.
  if coalesce(r.class_name, '') || coalesce(r.educator_name, '') || coalesce(r.class_color, '') not like '%@%' then
    raise notice 'UJIAN 8f LULUS: tiada nilai berbentuk emel dalam pratonton';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 8f GAGAL: nilai berbentuk emel ditemui dalam pratonton';
  end if;

  -- Kiraan lajur hasil mesti tepat enam. Temp table dibuang pada commit,
  -- dan transaksi ini digulung semula pada hujung fail.
  create temp table ujian8_pratonton on commit drop as
    select * from public.qm_class_preview_by_code('AB01CD34');
  select count(*) into v
    from pg_attribute
   where attrelid = 'ujian8_pratonton'::regclass
     and attnum > 0
     and not attisdropped;
  if v = 6 then
    raise notice 'UJIAN 8g LULUS: hasil pratonton tepat enam lajur';
  else
    v_gagal := v_gagal + 1;
    raise notice 'UJIAN 8g GAGAL: hasil pratonton ada % lajur (jangka 6)', v;
  end if;

  if v_gagal > 0 then raise exception 'UJIAN 8: % semakan gagal', v_gagal; end if;
end $u$;

-- Kembali ke pentadbir: sisipan langsung tidak tertakluk RLS, sama seperti
-- penyediaan data di bahagian 0.
reset role;

-- ============================================================
-- UJIAN 9: indeks unik atas kod ternormal (temuan kzsec P2, 0038 bahagian 1b)
-- Kelas kedua yang ternormal sama (ab-cd12o1 -> ABCD1201) mesti ditolak,
-- manakala kelas dengan kod ternormal berbeza mesti diterima.
-- ============================================================
do $u$
declare
  v_constraint text;
begin
  -- Kelas pertama dengan kod ABCD1201: mesti berjaya, tiada pertembungan
  -- dengan AB01CD34, FFFF0000 atau DEADBEEF.
  begin
    insert into public.qm_classes (id, owner_id, name, color, join_code) values
      ('00000000-0000-0000-0000-000000004c04', '00000000-0000-0000-0000-0000000000e1', 'Kelas Sertai ABCD1201', '#22c55e', 'ABCD1201');
  exception when others then
    raise exception 'UJIAN 9a GAGAL: kelas pertama ABCD1201 gagal: %', sqlerrm;
  end;
  raise notice 'UJIAN 9a LULUS: kelas dengan kod ternormal berbeza diterima';

  -- Kelas kedua ab-cd12o1 ternormal kepada ABCD1201: mesti ditolak oleh
  -- indeks unik qm_classes_join_code_norm_uidx (kod mentah berbeza, jadi
  -- kekangan unique join_code biasa tidak terganggu).
  begin
    insert into public.qm_classes (id, owner_id, name, color, join_code) values
      ('00000000-0000-0000-0000-000000004c05', '00000000-0000-0000-0000-0000000000e1', 'Kelas Sertai Duplikat', '#ef4444', 'ab-cd12o1');
    raise exception 'UJIAN 9b GAGAL: kelas kedua dengan kod ternormal sama diterima';
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = CONSTRAINT_NAME;
      if v_constraint = 'qm_classes_join_code_norm_uidx' then
        raise notice 'UJIAN 9b LULUS: kod ternormal sama ditolak oleh indeks unik';
      else
        raise exception 'UJIAN 9b GAGAL: ditolak oleh %, bukan indeks ternormal', v_constraint;
      end if;
    when others then
      if sqlerrm like 'UJIAN 9b GAGAL%' then raise; end if;
      raise exception 'UJIAN 9b GAGAL: ralat lain: %', sqlerrm;
  end;
end $u$;

-- ============================================================
-- Hujung: transaksi digulung semula, tiada data kekal.
-- ============================================================
select set_config('request.jwt.claims', '', true);
rollback;