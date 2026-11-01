-- Ujian KZ-033: Bilik AI fasa 1 (migrasi 0068_bilik_ai.sql).
-- Dijalankan SELEPAS migrasi 0068 dipasang, dalam SATU transaksi yang
-- digulung semula sepenuhnya. Tiada data kekal.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/KZ-033.sql
-- Output akhir "KZ-033: SEMUA UJIAN LULUS" bermakna lulus.
--
-- Ikut pengajaran v2 dalam _umum.md: UUID heksadesimal sahaja,
-- lajur NOT NULL qm_profiles dihormati (role, plan, approved, suspended),
-- kod bilik abjad ^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$.

begin;

-- Pengguna ujian. Pencetus qm_handle_new_user dimatikan sementara
-- supaya qm_profiles dikawal sepenuhnya di bawah (corak KZ-015).
set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000330e1', 'kz033-guru@ujian.invalid',    'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000330a1', 'kz033-pelajar@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000330a2', 'kz033-pelagi@ujian.invalid',  'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000330e1', 'educator',    'Guru KZ-033',    'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000330a1', 'participant', 'Pelajar KZ-033', 'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000330a2', 'participant', 'Pelagi KZ-033',  'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000330c1', '00000000-0000-0000-0000-0000000330e1', 'Kelas Ujian KZ-033');

-- Bilik ujian dengan kod 6 aksara daripada abjad betul (tiada 0, O, 1, I).
insert into public.qm_ai_rooms (id, class_id, created_by, title, join_code) values
  ('00000000-0000-0000-0000-0000000330r1',
   '00000000-0000-0000-0000-0000000330c1',
   '00000000-0000-0000-0000-0000000330e1',
   'Bilik ujian KZ-033', 'AB3CD4');

-- Ujian 1: CHECK join_code menolak semua kod salah.
do $u$
declare
  v_kelas uuid := '00000000-0000-0000-0000-0000000330c1';
  v_guru  uuid := '00000000-0000-0000-0000-0000000330e1';
begin
  -- 5 aksara sahaja (panjang salah).
  begin
    insert into public.qm_ai_rooms (class_id, created_by, title, join_code)
      values (v_kelas, v_guru, 'Pendek', 'ABC12');
    raise exception 'UJIAN 1 GAGAL: kod 5 aksara diterima';
  exception when check_violation then
    raise notice 'Ujian 1: kod pendek ditolak (betul)';
  end;
  -- 7 aksara (panjang salah).
  begin
    insert into public.qm_ai_rooms (class_id, created_by, title, join_code)
      values (v_kelas, v_guru, 'Panjang', 'ABC1234');
    raise exception 'UJIAN 1 GAGAL: kod 7 aksara diterima';
  exception when check_violation then
    raise notice 'Ujian 1: kod panjang ditolak (betul)';
  end;
  -- Huruf kecil dan aksara dilarang (0, O, 1, I bukan dalam abjad).
  begin
    insert into public.qm_ai_rooms (class_id, created_by, title, join_code)
      values (v_kelas, v_guru, 'Salah abjad', 'ab3cd4');
    raise exception 'UJIAN 1 GAGAL: kod huruf kecil diterima';
  exception when check_violation then
    raise notice 'Ujian 1: kod huruf kecil ditolak (betul)';
  end;
  begin
    insert into public.qm_ai_rooms (class_id, created_by, title, join_code)
      values (v_kelas, v_guru, 'Salah abjad', 'ABC0OI');
    raise exception 'UJIAN 1 GAGAL: kod ABC0OI diterima (0, O, I dilarang)';
  exception when check_violation then
    raise notice 'Ujian 1: kod dengan 0, O, I ditolak (betul)';
  end;
end $u$;

-- Ujian 2: CHECK ai_status ikut author_kind.
do $u$
declare
  v_bilik uuid := '00000000-0000-0000-0000-0000000330r1';
  v_guru  uuid := '00000000-0000-0000-0000-0000000330e1';
begin
  -- Mesej AI tanpa ai_status mesti ditolak.
  begin
    insert into public.qm_ai_messages (room_id, author_kind, author_id, body)
      values (v_bilik, 'ai', null, 'jawapan');
    raise exception 'UJIAN 2 GAGAL: mesej AI tanpa ai_status diterima';
  exception when check_violation then
    raise notice 'Ujian 2: mesej AI tanpa ai_status ditolak (betul)';
  end;
  -- Mesej manusia dengan ai_status mesti ditolak.
  begin
    insert into public.qm_ai_messages (room_id, author_kind, author_id, body, ai_status)
      values (v_bilik, 'human', v_guru, 'soalan', 'queued');
    raise exception 'UJIAN 2 GAGAL: mesej manusia dengan ai_status diterima';
  exception when check_violation then
    raise notice 'Ujian 2: mesej manusia dengan ai_status ditolak (betul)';
  end;
  -- Status AI luar senarai mesti ditolak.
  begin
    insert into public.qm_ai_messages (room_id, author_kind, author_id, body, ai_status)
      values (v_bilik, 'ai', null, 'jawapan', 'status-salah');
    raise exception 'UJIAN 2 GAGAL: ai_status luar senarai diterima';
  exception when check_violation then
    raise notice 'Ujian 2: ai_status luar senarai ditolak (betul)';
  end;
  -- Pasangan yang sah mesti diterima: AI + queued.
  insert into public.qm_ai_messages (room_id, author_kind, author_id, body, ai_status)
    values (v_bilik, 'ai', null, 'jawapan', 'queued');
  -- Manusia tanpa status juga sah.
  insert into public.qm_ai_messages (room_id, author_kind, author_id, body)
    values (v_bilik, 'human', v_guru, 'soalan');
  raise notice 'Ujian 2: pasangan sah diterima (betul)';
end $u$;

-- Ujian 3: qm_ai_reserve_ask sehingga USER_CAP dan ROOM_CAP dengan
-- had kecil: pengguna 2 sehari, bilik 3 sehari, dua pengguna.
do $u$
declare
  v_bilik  uuid := '00000000-0000-0000-0000-0000000330r1';
  v_guru   uuid := '00000000-0000-0000-0000-0000000330e1';
  v_p1     uuid := '00000000-0000-0000-0000-0000000330a1';
  v_p2     uuid := '00000000-0000-0000-0000-0000000330a2';
  v_hasil  text;
  v_asks   int;
  v_jumlah int;
begin
  v_hasil := public.qm_ai_reserve_ask(v_p1, v_bilik, 2, 3);
  if v_hasil <> 'OK' then raise exception 'UJIAN 3 GAGAL: p1 kali 1 dapat %', v_hasil; end if;
  v_hasil := public.qm_ai_reserve_ask(v_p1, v_bilik, 2, 3);
  if v_hasil <> 'OK' then raise exception 'UJIAN 3 GAGAL: p1 kali 2 dapat %', v_hasil; end if;
  -- Kali 3: pengguna sudah 2, mesti USER_CAP walaupun bilik baru 2.
  v_hasil := public.qm_ai_reserve_ask(v_p1, v_bilik, 2, 3);
  if v_hasil <> 'USER_CAP' then raise exception 'UJIAN 3 GAGAL: p1 kali 3 dapat % (jangka USER_CAP)', v_hasil; end if;
  -- USER_CAP tidak menambah apa-apa.
  select asks into v_asks from public.qm_ai_usage
    where user_id = v_p1 and room_id = v_bilik;
  if v_asks <> 2 then raise exception 'UJIAN 3 GAGAL: p1 baki % (jangka 2)', v_asks; end if;
  -- p2 kali 1 masih OK (bilik 2 < 3), menjadi 3.
  v_hasil := public.qm_ai_reserve_ask(v_p2, v_bilik, 2, 3);
  if v_hasil <> 'OK' then raise exception 'UJIAN 3 GAGAL: p2 kali 1 dapat %', v_hasil; end if;
  -- p2 kali 2: pengguna 1 < 2 tetapi bilik sudah 3, mesti ROOM_CAP.
  v_hasil := public.qm_ai_reserve_ask(v_p2, v_bilik, 2, 3);
  if v_hasil <> 'ROOM_CAP' then raise exception 'UJIAN 3 GAGAL: p2 kali 2 dapat % (jangka ROOM_CAP)', v_hasil; end if;
  -- ROOM_CAP tidak menambah apa-apa.
  select asks into v_asks from public.qm_ai_usage
    where user_id = v_p2 and room_id = v_bilik;
  if v_asks <> 1 then raise exception 'UJIAN 3 GAGAL: p2 baki % (jangka 1)', v_asks; end if;
  -- Jumlah bilik tepat 3, tidak pernah melampaui had walau berlumba.
  select coalesce(sum(asks), 0) into v_jumlah from public.qm_ai_usage
    where room_id = v_bilik;
  if v_jumlah <> 3 then raise exception 'UJIAN 3 GAGAL: jumlah bilik % (jangka 3)', v_jumlah; end if;
  -- Bilik lain tidak terjejas oleh had bilik ini.
  insert into public.qm_ai_rooms (id, class_id, created_by, title, join_code) values
    ('00000000-0000-0000-0000-0000000330r2',
     '00000000-0000-0000-0000-0000000330c1', v_guru, 'Bilik kedua KZ-033', 'AB3CD5');
  v_hasil := public.qm_ai_reserve_ask(v_guru, '00000000-0000-0000-0000-0000000330r2', 2, 3);
  if v_hasil <> 'OK' then raise exception 'UJIAN 3 GAGAL: bilik lain dapat %', v_hasil; end if;
  raise notice 'Ujian 3: kuota pengguna dan bilik dikuatkuasakan (betul)';
end $u$;

-- Ujian 4: qm_ai_add_tokens menambah token pada baris hari ini.
do $u$
declare
  v_bilik uuid := '00000000-0000-0000-0000-0000000330r1';
  v_p1    uuid := '00000000-0000-0000-0000-0000000330a1';
  v_pt    bigint;
  v_ct    bigint;
  v_asks int;
begin
  perform public.qm_ai_add_tokens(v_p1, v_bilik, 120, 260);
  select prompt_tokens, completion_tokens into v_pt, v_ct from public.qm_ai_usage
    where user_id = v_p1 and room_id = v_bilik;
  if v_pt <> 120 or v_ct <> 260 then
    raise exception 'UJIAN 4 GAGAL: token pertama % / % (jangka 120 / 260)', v_pt, v_ct;
  end if;
  -- Panggilan kedua menambah, bukan menimpa.
  perform public.qm_ai_add_tokens(v_p1, v_bilik, 30, 40);
  select prompt_tokens, completion_tokens into v_pt, v_ct from public.qm_ai_usage
    where user_id = v_p1 and room_id = v_bilik;
  if v_pt <> 150 or v_ct <> 300 then
    raise exception 'UJIAN 4 GAGAL: token terkumpul % / % (jangka 150 / 300)', v_pt, v_ct;
  end if;
  -- asks tidak berubah oleh penambahan token.
  select asks into v_asks from public.qm_ai_usage
    where user_id = v_p1 and room_id = v_bilik;
  if v_asks <> 2 then
    raise exception 'UJIAN 4 GAGAL: asks berubah kepada % (jangka 2)', v_asks;
  end if;
  raise notice 'Ujian 4: token terkumpul dengan betul (betul)';
end $u$;

-- Ujian 5: kebenaran. Hanya service_role boleh memanggil fungsi;
-- anon dan authenticated tidak boleh baca jadual langsung.
do $u$
begin
  if has_function_privilege('anon', 'public.qm_ai_reserve_ask(uuid, uuid, int, int)', 'execute') then
    raise exception 'UJIAN 5 GAGAL: anon boleh execute qm_ai_reserve_ask';
  end if;
  if has_function_privilege('authenticated', 'public.qm_ai_reserve_ask(uuid, uuid, int, int)', 'execute') then
    raise exception 'UJIAN 5 GAGAL: authenticated boleh execute qm_ai_reserve_ask';
  end if;
  if not has_function_privilege('service_role', 'public.qm_ai_reserve_ask(uuid, uuid, int, int)', 'execute') then
    raise exception 'UJIAN 5 GAGAL: service_role tidak boleh execute qm_ai_reserve_ask';
  end if;
  if has_function_privilege('anon', 'public.qm_ai_add_tokens(uuid, uuid, int, int)', 'execute') then
    raise exception 'UJIAN 5 GAGAL: anon boleh execute qm_ai_add_tokens';
  end if;
  if has_table_privilege('anon', 'public.qm_ai_rooms', 'select')
     or has_table_privilege('authenticated', 'public.qm_ai_rooms', 'select') then
    raise exception 'UJIAN 5 GAGAL: anon/authenticated boleh baca qm_ai_rooms';
  end if;
  if has_table_privilege('anon', 'public.qm_ai_messages', 'select')
     or has_table_privilege('authenticated', 'public.qm_ai_messages', 'select') then
    raise exception 'UJIAN 5 GAGAL: anon/authenticated boleh baca qm_ai_messages';
  end if;
  raise notice 'Ujian 5: kebenaran terkunci pada service_role (betul)';
end $u$;

raise notice 'KZ-033: SEMUA UJIAN LULUS';

rollback;