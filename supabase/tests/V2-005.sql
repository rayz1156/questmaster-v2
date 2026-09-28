-- V2-005.sql: ujian penerimaan pin kelas dan aktiviti.
--
-- Jalankan pada pelayan (CTO):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/tests/V2-005.sql
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya (ROLLBACK), jadi tiada data ujian kekal. Setiap semakan
-- memaparkan LULUS atau GAGAL melalui RAISE NOTICE; GAGAL menghentikan
-- skrip dengan pengecualian 'henti selepas gagal'.
--
-- Disemak di sini:
--   1. Pin keempat ditolak oleh pencetus had 3 pin dengan mesej tepat.
--   2. Pengguna bukan pemilik/pendidik/ahli tidak boleh pin kelas itu.
--   2B. Ahli kelas boleh pin kelas itu.
--   3. Pengguna A tidak nampak pin pengguna C (RLS SELECT) dan pin
--      sendirinya kekal tiga baris.
--   4. UPDATE pin tidak mengubah apa-apa (tiada polisi UPDATE).
--   5. qm_my_class_activity hanya memulangkan kelas pengguna sendiri,
--      status pin betul, dan GREATEST mengambil aktiviti terkini.
--   6. anon tidak boleh memanggil qm_my_class_activity (revoke/RLS).

begin;

-- ============================================================
-- 0. Data asas (semua ID hex sah supaya UUID sah)
-- ============================================================
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000a001', 'v2-005-a@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000b001', 'v2-005-b@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000c001', 'v2-005-c@ujian.invalid', 'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended) values
  ('00000000-0000-0000-0000-00000000a001', 'educator',    'Educator A', 'pro',  true, false),
  ('00000000-0000-0000-0000-00000000b001', 'educator',    'Educator B', 'free', true, false),
  ('00000000-0000-0000-0000-00000000c001', 'participant', 'Peserta C',  'free', true, false);

-- Kelas: tiga milik A, satu milik B. Tarikh ciptaan 7 hari lampau supaya
-- hunt (1 hari lampau) lebih baharu daripada kelas dan GREATEST dapat
-- disahkan pada UJIAN 5.
insert into public.qm_classes (id, owner_id, name, created_at) values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000a001', 'Kelas A', now() - interval '7 days'),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000b001', 'Kelas B', now() - interval '7 days'),
  ('00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000a001', 'Kelas A dua', now() - interval '7 days'),
  ('00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000a001', 'Kelas A tiga', now() - interval '7 days');

insert into public.qm_class_educators (class_id, educator_id, role, invited_by, invited_at, accepted_at)
values ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000a001', 'owner',
        '00000000-0000-0000-0000-00000000a001', now(), now());

-- C ialah ahli Kelas A; B langsung tidak terlibat dengan Kelas A.
insert into public.qm_class_members (class_id, user_id)
values ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c001');

-- Aktiviti dalam Kelas A supaya last_activity_at lebih baharu daripada
-- tarikh ciptaan kelas (membuktikan GREATEST berfungsi).
insert into public.qm_hunts (id, owner_id, class_id, title, created_at) values
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-00000000c101', 'Hunt A', now() - interval '1 day');

set local role authenticated;

-- ============================================================
-- 1. Pin keempat ditolak (A sudah ada tiga pin; pin keempat menyasarkan
--    c102 milik B tetapi pencetus had menyala sebelum semakan polisi,
--    jadi mesej yang dijangka ialah had pin, bukan RLS)
-- ============================================================
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000a001", "role": "authenticated"}';

do $$
declare
  v_ralat text;
begin
  -- Tiga pin pertama berjaya.
  insert into public.qm_class_pins (user_id, class_id) values
    ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c101'),
    ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c103'),
    ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c104');
  -- Struktur: ralat ditangkap dan disimpan dahulu, keputusan dibuat selepas
  -- blok dalaman supaya 'henti selepas gagal' tidak ditangkap oleh pengendali
  -- yang sama dan mencipta lulus palsu.
  begin
    insert into public.qm_class_pins (user_id, class_id)
    values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c102');
    v_ralat := null;
  exception
    when others then
      v_ralat := sqlerrm;
  end;
  if v_ralat = 'Pin limit reached (3)' then
    raise notice 'LULUS UJIAN 1: pin keempat ditolak dengan mesej tepat';
  else
    raise notice 'GAGAL UJIAN 1: pin keempat tidak ditolak atau mesej tidak tepat: %',
      coalesce(v_ralat, 'tiada ralat');
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 2. B (bukan pemilik/pendidik/ahli Kelas A) tidak boleh pin Kelas A
-- ============================================================
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000b001", "role": "authenticated"}';

-- Struktur: ralat ditangkap dan disimpan dahulu, keputusan dibuat selepas
-- blok dalaman supaya 'henti selepas gagal' tidak ditangkap oleh pengendali
-- yang sama dan mencipta lulus palsu.
do $$
declare
  v_ralat text;
begin
  begin
    insert into public.qm_class_pins (user_id, class_id)
    values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c101');
    v_ralat := null;
  exception
    when others then
      v_ralat := sqlerrm;
  end;
  if v_ralat is not null and v_ralat <> 'Pin limit reached (3)' then
    raise notice 'LULUS UJIAN 2: pin B terhadap kelas A ditolak (%)', v_ralat;
  else
    raise notice 'GAGAL UJIAN 2: B tidak ditolak atau mesej salah: %', coalesce(v_ralat, 'tiada ralat');
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 2B. Peserta C (ahli) boleh pin Kelas A (kiraan pin A disemak di UJIAN 3)
-- ============================================================
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000c001", "role": "authenticated"}';

do $$
declare
  v_bil_c int;
begin
  insert into public.qm_class_pins (user_id, class_id)
  values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c101');
  -- RLS hanya membenarkan C melihat pin sendiri, jadi kiraan pin A
  -- disemak dalam UJIAN 3 yang berjalan sebagai A.
  select count(*) into v_bil_c from public.qm_class_pins
   where user_id = '00000000-0000-0000-0000-00000000c001';
  if v_bil_c = 1 then
    raise notice 'LULUS UJIAN 2B: ahli boleh pin kelas itu';
  else
    raise notice 'GAGAL UJIAN 2B: pin C=% (jangka 1)', v_bil_c;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 3. A tidak nampak pin C melalui RLS SELECT
-- ============================================================
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000a001", "role": "authenticated"}';

do $$
declare
  v_bil_c int;
  v_bil_a int;
begin
  select count(*) into v_bil_c from public.qm_class_pins
   where user_id = '00000000-0000-0000-0000-00000000c001';
  -- Pin sendiri masih kelihatan: tiga pin A daripada UJIAN 1.
  select count(*) into v_bil_a from public.qm_class_pins
   where user_id = '00000000-0000-0000-0000-00000000a001';
  if v_bil_c = 0 and v_bil_a = 3 then
    raise notice 'LULUS UJIAN 3: pin pengguna lain tersembunyi, pin sendiri kekal 3';
  else
    raise notice 'GAGAL UJIAN 3: pin C kelihatan=% (jangka 0), pin A=% (jangka 3)',
      v_bil_c, v_bil_a;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 4. UPDATE pin tidak mengubah apa-apa (tiada polisi UPDATE)
--    RLS tanpa polisi UPDATE membatalkan baris secara senyap, jadi
--    semakan menggunakan FOUND, bukan pengecualian.
-- ============================================================
do $$
begin
  update public.qm_class_pins
     set pinned_at = now() + interval '1 day'
   where user_id = '00000000-0000-0000-0000-00000000a001'
     and class_id = '00000000-0000-0000-0000-00000000c101';
  -- Kalau UPDATE sampai ke sini (contoh kebenaran UPDATE diberi kelak),
  -- tiada polisi UPDATE bermakna baris dibatalkan secara senyap.
  if not found then
    raise notice 'LULUS UJIAN 4: UPDATE pin tidak mengubah apa-apa (tiada polisi UPDATE)';
  else
    raise notice 'GAGAL UJIAN 4: UPDATE pin berjaya (sepatutnya ditolak)';
    raise exception 'henti selepas gagal';
  end if;
exception
  when insufficient_privilege then
    -- Keadaan sebenar hari ini: authenticated langsung tiada kebenaran
    -- UPDATE pada qm_class_pins (migrasi 0039 grant select, insert, delete sahaja).
    raise notice 'LULUS UJIAN 4: UPDATE pin ditolak (kebenaran tiada): %', sqlerrm;
end $$;

-- ============================================================
-- 5. qm_my_class_activity: hanya kelas sendiri, pin dan GREATEST betul
-- ============================================================
do $$
declare
  r record;
  v_bil_lain int := 0;
  v_bil_sendiri int := 0;
  v_pin_kelas_a boolean := null;
  v_aktiviti_kelas_a timestamptz := null;
  v_dicipta_kelas_a timestamptz;
begin
  select created_at into v_dicipta_kelas_a from public.qm_classes
   where id = '00000000-0000-0000-0000-00000000c101';
  for r in select * from public.qm_my_class_activity() loop
    if r.class_id = '00000000-0000-0000-0000-00000000c102' then
      v_bil_lain := v_bil_lain + 1; -- kelas milik B, bukan A
    else
      v_bil_sendiri := v_bil_sendiri + 1;
    end if;
    if r.class_id = '00000000-0000-0000-0000-00000000c101' then
      v_pin_kelas_a := r.pinned;
      v_aktiviti_kelas_a := r.last_activity_at;
    end if;
  end loop;
  if v_bil_lain = 0 and v_bil_sendiri = 3 and v_pin_kelas_a
     and v_aktiviti_kelas_a > v_dicipta_kelas_a then
    raise notice 'LULUS UJIAN 5: aktiviti hanya kelas sendiri (3), pin dan GREATEST betul';
  else
    raise notice 'GAGAL UJIAN 5: lain=% (jangka 0), sendiri=% (jangka 3), pin=%, aktiviti=%',
      v_bil_lain, v_bil_sendiri, v_pin_kelas_a, v_aktiviti_kelas_a;
    raise exception 'henti selepas gagal';
  end if;
end $$;

-- ============================================================
-- 6. anon tidak boleh memanggil qm_my_class_activity
-- ============================================================
set local role anon;

-- Struktur sama seperti UJIAN 2: ralat disimpan dahulu, keputusan selepas
-- blok dalaman supaya tiada lulus palsu.
do $$
declare
  v_ralat text;
begin
  begin
    perform * from public.qm_my_class_activity();
    v_ralat := null;
  exception
    when others then
      v_ralat := sqlerrm;
  end;
  if v_ralat is not null then
    raise notice 'LULUS UJIAN 6: anon ditolak (%)', v_ralat;
  else
    raise notice 'GAGAL UJIAN 6: anon berjaya memanggil fungsi';
    raise exception 'henti selepas gagal';
  end if;
end $$;

rollback;