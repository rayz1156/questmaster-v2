-- V2-016.sql (CTO): migrasi 0053, pustaka templat sijil.
-- Satu transaksi, ROLLBACK di hujung. Semakan dihadkan kepada data ujian
-- sendiri (UUID 00000000-0000-0000-0000-00000016xx). Corak V2-015 untuk
-- data dan V2-013 untuk simulasi pengguna sahih (request.jwt.claims).

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000016a1', 'v2-016-free@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000016a2', 'v2-016-pro@ujian.invalid',   'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000016a3', 'v2-016-admin@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000016a4', 'v2-016-lain@ujian.invalid',  'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

-- Bersihkan sisa kemungkinan dari percubaan lepas yang tidak ber-Rollback.
delete from public.qm_certificate_library where title like 'V2-016%';
delete from public.qm_classes where id in (
  '00000000-0000-0000-0000-00000016c1'::uuid,
  '00000000-0000-0000-0000-00000016c2'::uuid);
delete from public.qm_profiles where id in (
  '00000000-0000-0000-0000-00000016a1'::uuid,
  '00000000-0000-0000-0000-00000016a2'::uuid,
  '00000000-0000-0000-0000-00000016a3'::uuid,
  '00000000-0000-0000-0000-00000016a4'::uuid);

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, plan_expires_at) values
  ('00000000-0000-0000-0000-00000016a1', 'educator', 'Free Ujian V2-016',  'free',      true, false, null),
  ('00000000-0000-0000-0000-00000016a2', 'educator', 'Pro Ujian V2-016',   'pro',       true, false, now() + interval '30 days'),
  ('00000000-0000-0000-0000-00000016a3', 'admin',    'Admin Ujian V2-016', 'free',      true, false, null),
  ('00000000-0000-0000-0000-00000016a4', 'educator', 'Lain Ujian V2-016',  'free',      true, false, null);

insert into public.qm_classes (id, owner_id, name, color, join_code) values
  ('00000000-0000-0000-0000-00000016c1', '00000000-0000-0000-0000-00000016a1', 'Kelas Free V2-016', '#6366f1', 'V216FFAA'),
  ('00000000-0000-0000-0000-00000016c2', '00000000-0000-0000-0000-00000016a2', 'Kelas Pro V2-016',  '#6366f1', 'V216PPBB');

-- Data galeri: tiga item oleh pentadbir aktif melalui RLS (menggunakan
-- peranan authenticated supaya polisi insert galeri turut diuji).
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000016a3","role":"authenticated"}', false);
  execute 'set local role authenticated';
  insert into public.qm_certificate_library
    (id, scope, title, text_tone, background_path, free_tier, published, sort_order)
  values
    ('00000000-0000-0000-0000-00000016d1', 'gallery', 'V2-016 Galeri Free',    'dark',  'gallery/00000000-0000-0000-0000-00000016d1/background-a.png', true,  true,  1),
    ('00000000-0000-0000-0000-00000016d2', 'gallery', 'V2-016 Galeri Berbayar', 'light', 'gallery/00000000-0000-0000-0000-00000016d2/background-a.png', false, true,  2),
    ('00000000-0000-0000-0000-00000016d3', 'gallery', 'V2-016 Galeri Draf',    'dark',  'gallery/00000000-0000-0000-0000-00000016d3/background-a.png', true,  false, 3);
  execute 'reset role';
end $$;

-- RLS: pendidik biasa nampak galeri diterbitkan sahaja (2), pentadbir
-- nampak ketiga-tiganya termasuk draf.
do $$
declare v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000016a1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_certificate_library where scope = 'gallery';
  execute 'reset role';
  if v_bil = 2 then raise notice 'LULUS 1: educator nampak galeri diterbitkan sahaja (2)';
  else raise exception 'GAGAL 1: educator nampak % item galeri (jangkaan 2)', v_bil; end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000016a3","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_certificate_library where scope = 'gallery';
  execute 'reset role';
  if v_bil = 3 then raise notice 'LULUS 2: pentadbir nampak draf galeri juga (3)';
  else raise exception 'GAGAL 2: pentadbir nampak % item galeri (jangkaan 3)', v_bil; end if;
end $$;

-- RLS: bukan pentadbir tidak boleh INSERT item galeri.
do $$
declare v_ralat text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000016a1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  begin
    insert into public.qm_certificate_library (scope, title) values ('gallery', 'V2-016 Sorok');
    raise exception 'GAGAL 3: insert galeri oleh educator lulus';
  exception when others then
    v_ralat := sqlerrm;
  end;
  execute 'reset role';
  if v_ralat is not null then
    raise notice 'LULUS 3: educator ditolak insert galeri (%)', v_ralat;
  else
    raise exception 'GAGAL 3: tiada ralat insert galeri';
  end if;
end $$;

-- RLS + pengawal: educator Percuma tidak boleh INSERT personal (pelan).
do $$
declare v_ralat text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000016a1","role":"authenticated"}', false);
  execute 'set local role authenticated';
  begin
    insert into public.qm_certificate_library (scope, owner_id, title)
    values ('personal', '00000000-0000-0000-0000-00000016a1', 'V2-016 Percuma');
    raise exception 'GAGAL 4: insert personal pelan free lulus';
  exception when others then
    v_ralat := sqlerrm;
  end;
  execute 'reset role';
  if v_ralat like '%MY_TEMPLATE_PLAN%' then
    raise notice 'LULUS 4: educator Percuma ditolak insert personal (%)', v_ralat;
  else
    raise exception 'GAGAL 4: ralat tidak dijangka: %', v_ralat;
  end if;
end $$;

-- RLS + pengawal: educator Pro boleh INSERT personal (dengan latar
-- peribadi; id disimpan untuk ujian asset_in_use kemudian).
do $$
declare v_pid uuid;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000016a2","role":"authenticated"}', false);
  execute 'set local role authenticated';
  insert into public.qm_certificate_library
    (scope, owner_id, title, background_path)
  values
    ('personal', '00000000-0000-0000-0000-00000016a2', 'V2-016 Peribadi Pro',
     'library/00000000-0000-0000-0000-00000016a2/background-a.png')
  returning id into v_pid;
  execute 'reset role';
  if v_pid is not null then raise notice 'LULUS 5: educator Pro boleh simpan templat peribadi';
  else raise exception 'GAGAL 5: insert personal Pro gagal'; end if;
end $$;

-- RLS: personal orang lain tersembunyi daripada educator lain.
do $$
declare v_bil int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000016a4","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_certificate_library where scope = 'personal';
  execute 'reset role';
  if v_bil = 0 then raise notice 'LULUS 6: educator lain tidak nampak templat peribadi orang lain';
  else raise exception 'GAGAL 6: educator lain nampak % item personal', v_bil; end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000016a2","role":"authenticated"}', false);
  execute 'set local role authenticated';
  select count(*) into v_bil from public.qm_certificate_library where scope = 'personal';
  execute 'reset role';
  if v_bil = 1 then raise notice 'LULUS 7: pemilik nampak templat peribadinya sendiri';
  else raise exception 'GAGAL 7: pemilik nampak % item personal (jangkaan 1)', v_bil; end if;
end $$;

-- Had 50: isi sehingga 50 untuk pemilik Pro, kemudian sisipan ke-51 ditolak.
do $$
declare i int;
begin
  for i in 1..49 loop
    insert into public.qm_certificate_library (scope, owner_id, title)
    values ('personal', '00000000-0000-0000-0000-00000016a2', 'V2-016 Had ' || i);
  end loop;
end $$;

do $$
declare v_ralat text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000016a2","role":"authenticated"}', false);
  execute 'set local role authenticated';
  begin
    insert into public.qm_certificate_library (scope, owner_id, title)
    values ('personal', '00000000-0000-0000-0000-00000016a2', 'V2-016 Had 51');
    raise exception 'GAGAL 8: sisipan ke-51 lulus';
  exception when others then
    v_ralat := sqlerrm;
  end;
  execute 'reset role';
  if v_ralat like '%LIBRARY_LIMIT%' then
    raise notice 'LULUS 8: had 50 item per educator dikuatkuasikan (%)', v_ralat;
  else
    raise exception 'GAGAL 8: ralat tidak dijangka: %', v_ralat;
  end if;
end $$;

-- Pencetus pelan pada templat kelas, laluan gallery/ dan library/.
insert into public.qm_certificate_templates
  (id, class_id, title, background_path, library_id, created_by) values
  ('00000000-0000-0000-0000-00000016t1', '00000000-0000-0000-0000-00000016c1', 'T1 free free_tier',
   'gallery/00000000-0000-0000-0000-00000016d1/background-a.png', '00000000-0000-0000-0000-00000016d1',
   '00000000-0000-0000-0000-00000016a1'),
  ('00000000-0000-0000-0000-00000016t2', '00000000-0000-0000-0000-00000016c1', 'T2 free berbayar',
   'gallery/00000000-0000-0000-0000-00000016d2/background-a.png', '00000000-0000-0000-0000-00000016d2',
   '00000000-0000-0000-0000-00000016a1'),
  ('00000000-0000-0000-0000-00000016t3', '00000000-0000-0000-0000-00000016c2', 'T3 pro berbayar',
   'gallery/00000000-0000-0000-0000-00000016d2/background-a.png', '00000000-0000-0000-0000-00000016d2',
   '00000000-0000-0000-0000-00000016a2'),
  ('00000000-0000-0000-0000-00000016t4', '00000000-0000-0000-0000-00000016c2', 'T4 laluan palsu',
   'gallery/00000000-0000-0000-0000-00000016d1/background-a.png', '00000000-0000-0000-0000-00000016d2',
   '00000000-0000-0000-0000-00000016a2'),
  ('00000000-0000-0000-0000-00000016t5', '00000000-0000-0000-0000-00000016c2', 'T5 draf galeri',
   'gallery/00000000-0000-0000-0000-00000016d3/background-a.png', '00000000-0000-0000-0000-00000016d3',
   '00000000-0000-0000-0000-00000016a2'),
  ('00000000-0000-0000-0000-00000016t6', '00000000-0000-0000-0000-00000016c1', 'T6 library free',
   'library/00000000-0000-0000-0000-00000016a2/background-a.png', null,
   '00000000-0000-0000-0000-00000016a1'),
  ('00000000-0000-0000-0000-00000016t7', '00000000-0000-0000-0000-00000016c2', 'T7 library pro',
   'library/00000000-0000-0000-0000-00000016a2/background-a.png', null,
   '00000000-0000-0000-0000-00000016a2'),
  ('00000000-0000-0000-0000-00000016t8', '00000000-0000-0000-0000-00000016c1', 'T8 sendiri free',
   '00000000-0000-0000-0000-00000016c1/x/background-a.png', null,
   '00000000-0000-0000-0000-00000016a1'),
  ('00000000-0000-0000-0000-00000016t9', '00000000-0000-0000-0000-00000016c2', 'T9 sendiri pro',
   '00000000-0000-0000-0000-00000016c2/x/background-a.png', null,
   '00000000-0000-0000-0000-00000016a2');

do $$
declare r record;
begin
  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-00000016t1';
  if r.background_path is not null then raise notice 'LULUS 9: galeri free_tier dibenarkan untuk kelas Percuma';
  else raise exception 'GAGAL 9: galeri free_tier dibuang untuk kelas Percuma'; end if;

  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-00000016t2';
  if r.background_path is null then raise notice 'LULUS 10: galeri bukan free_tier dibuang untuk kelas Percuma';
  else raise exception 'GAGAL 10: galeri bukan free_tier kekal untuk kelas Percuma'; end if;

  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-00000016t3';
  if r.background_path is not null then raise notice 'LULUS 11: galeri bukan free_tier dibenarkan untuk kelas Pro';
  else raise exception 'GAGAL 11: galeri bukan free_tier dibuang untuk kelas Pro'; end if;

  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-00000016t4';
  if r.background_path is null then raise notice 'LULUS 12: laluan galeri yang tidak padan dengan item dirujuk dibuang';
  else raise exception 'GAGAL 12: laluan palsu kekal'; end if;

  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-00000016t5';
  if r.background_path is null then raise notice 'LULUS 13: item galeri belum diterbitkan ditolak walaupun kelas Pro';
  else raise exception 'GAGAL 13: item draf kekal'; end if;

  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-00000016t6';
  if r.background_path is null then raise notice 'LULUS 14: laluan library/ dibuang untuk kelas Percuma';
  else raise exception 'GAGAL 14: laluan library/ kekal untuk kelas Percuma'; end if;

  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-00000016t7';
  if r.background_path is not null then raise notice 'LULUS 15: laluan library/ dibenarkan untuk kelas Pro';
  else raise exception 'GAGAL 15: laluan library/ dibuang untuk kelas Pro'; end if;

  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-00000016t8';
  if r.background_path is null then raise notice 'LULUS 16: laluan sendiri dibuang untuk kelas Percuma (peraturan 0052 kekal)';
  else raise exception 'GAGAL 16: laluan sendiri kekal untuk kelas Percuma'; end if;

  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-00000016t9';
  if r.background_path is not null then raise notice 'LULUS 17: laluan sendiri dibenarkan untuk kelas Pro';
  else raise exception 'GAGAL 17: laluan sendiri dibuang untuk kelas Pro'; end if;
end $$;

-- qm_certificate_asset_in_use: rujukan merentas templat dan pustaka.
do $$
begin
  if public.qm_certificate_asset_in_use('gallery/00000000-0000-0000-0000-00000016d2/background-a.png') then
    raise notice 'LULUS 18: laluan galeri dirujuk templat dikenal pasti digunakan';
  else raise exception 'GAGAL 18: laluan galeri yang digunakan tidak dikesan'; end if;

  if public.qm_certificate_asset_in_use('library/00000000-0000-0000-0000-00000016a2/background-a.png') then
    raise notice 'LULUS 19: laluan pustaka dikesan digunakan (templat dan item personal)';
  else raise exception 'GAGAL 19: laluan pustaka yang digunakan tidak dikesan'; end if;

  -- Laluan yang tidak dirujuk mana-mana baris templat mahupun pustaka.
  -- (Laluan item d3 TIDAK boleh dipakai di sini kerana item pustaka itu
  -- sendiri masih merujuknya, walaupun tiada templat kelas menggunakainya.)
  if not public.qm_certificate_asset_in_use('00000000-0000-0000-0000-00000016c9/x/tiada-laluan.png') then
    raise notice 'LULUS 20: laluan yang tidak dirujuk mana-mana baris dikenal pasti tidak digunakan';
  else raise exception 'GAGAL 20: laluan yang tidak digunakan dianggap digunakan'; end if;

  if not public.qm_certificate_asset_in_use(null) then
    raise notice 'LULUS 21: laluan NULL tidak dianggap digunakan';
  else raise exception 'GAGAL 21: NULL dianggap digunakan'; end if;
end $$;

-- library_id ON DELETE SET NULL: memadam item galeri tidak merosakkan
-- templat kelas yang sudah menggunakainya (latar kekal).
do $$
declare r record;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000016a3","role":"authenticated"}', false);
  execute 'set local role authenticated';
  delete from public.qm_certificate_library where id = '00000000-0000-0000-0000-00000016d1';
  execute 'reset role';

  select library_id, background_path into r
    from public.qm_certificate_templates
   where id = '00000000-0000-0000-0000-00000016t1';
  if r.library_id is null and r.background_path is not null then
    raise notice 'LULUS 22: padam item galeri menullkan library_id tetapi latar templat kekal';
  else
    raise exception 'GAGAL 22: library_id=% latar=%', r.library_id, r.background_path;
  end if;
end $$;

rollback;
