-- V2-016b.sql (CTO): migrasi 0054, medan isian sijil.
-- Satu transaksi, ROLLBACK di hujung. Semakan dihadkan kepada data ujian
-- sendiri (UUID 00000000-0000-0000-0000-000000001bxx). Corak V2-016.

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000001ba1', 'v2-016b-free@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000001ba2', 'v2-016b-pro@ujian.invalid',  'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

-- Bersihkan sisa kemungkinan dari percubaan lepas yang tidak ber-Rollback.
delete from public.qm_certificate_templates where title like 'V2-016b%';
delete from public.qm_classes where id in (
  '00000000-0000-0000-0000-000000001bc1'::uuid,
  '00000000-0000-0000-0000-000000001bc2'::uuid);
delete from public.qm_profiles where id in (
  '00000000-0000-0000-0000-000000001ba1'::uuid,
  '00000000-0000-0000-0000-000000001ba2'::uuid);

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, plan_expires_at) values
  ('00000000-0000-0000-0000-000000001ba1', 'educator', 'Free Ujian V2-016b', 'free', true, false, null),
  ('00000000-0000-0000-0000-000000001ba2', 'educator', 'Pro Ujian V2-016b',  'pro',  true, false, now() + interval '30 days');

insert into public.qm_classes (id, owner_id, name, color, join_code) values
  ('00000000-0000-0000-0000-000000001bc1', '00000000-0000-0000-0000-000000001ba1', 'Kelas Free V2-016b', '#6366f1', 'V216BFAA'),
  ('00000000-0000-0000-0000-000000001bc2', '00000000-0000-0000-0000-000000001ba2', 'Kelas Pro V2-016b',  '#6366f1', 'V216BPBB');

-- 1. Lajur baharu wujud dengan lalai: fields '{}' dan signature_path NULL.
do $$
declare r record;
begin
  insert into public.qm_certificate_templates
    (id, class_id, title, created_by) values
    ('00000000-0000-0000-0000-000000001bd1', '00000000-0000-0000-0000-000000001bc1',
     'V2-016b Lalai', '00000000-0000-0000-0000-000000001ba1');
  select fields, signature_path into r from public.qm_certificate_templates
   where id = '00000000-0000-0000-0000-000000001bd1';
  if r.fields = '{}'::jsonb and r.signature_path is null then
    raise notice 'LULUS 1: fields lalai {} dan signature_path NULL';
  else
    raise exception 'GAGAL 1: fields=% signature_path=%', r.fields, r.signature_path;
  end if;
end $$;

-- 2. CHECK: fields bukan objek (array) ditolak.
do $$
declare v_ralat text;
begin
  begin
    insert into public.qm_certificate_templates (class_id, title, fields, created_by)
    values ('00000000-0000-0000-0000-000000001bc1', 'V2-016b Array',
            '[1, 2]'::jsonb, '00000000-0000-0000-0000-000000001ba1');
    raise exception 'GAGAL 2: fields array lulus';
  exception
    when check_violation then v_ralat := sqlerrm;
    when others then v_ralat := sqlerrm;
  end;
  if v_ralat like '%qm_cert_tpl_fields_objek_chk%' then
    raise notice 'LULUS 2: fields bukan objek ditolak (%)', v_ralat;
  else
    raise exception 'GAGAL 2: ralat tidak dijangka: %', v_ralat;
  end if;
end $$;

-- 3. CHECK: fields melebihi 4096 bait teks ditolak.
do $$
declare v_ralat text;
begin
  begin
    insert into public.qm_certificate_templates (class_id, title, fields, created_by)
    values ('00000000-0000-0000-0000-000000001bc1', 'V2-016b Besar',
            jsonb_build_object('course', repeat('a', 5000)),
            '00000000-0000-0000-0000-000000001ba1');
    raise exception 'GAGAL 3: fields 5000 bait lulus';
  exception
    when check_violation then v_ralat := sqlerrm;
    when others then v_ralat := sqlerrm;
  end;
  if v_ralat like '%qm_cert_tpl_fields_saiz_chk%' then
    raise notice 'LULUS 3: fields melebihi 4096 bait ditolak (%)', v_ralat;
  else
    raise exception 'GAGAL 3: ralat tidak dijangka: %', v_ralat;
  end if;
end $$;

-- 4. Pencetus pelan: kelas Percuma membuang signature_path (insert dan
--    update) tetapi mengekalkan fields (teks dibenarkan semua pelan).
do $$
declare r record;
begin
  insert into public.qm_certificate_templates
    (id, class_id, title, fields, signature_path, created_by) values
    ('00000000-0000-0000-0000-000000001bd2', '00000000-0000-0000-0000-000000001bc1',
     'V2-016b Free',
     '{"course":"Bengkel Robotik","date_start":"2026-10-01","location":"Dewan A"}'::jsonb,
     '00000000-0000-0000-0000-000000001bc1/00000000-0000-0000-0000-000000001bd2/signature-a.png',
     '00000000-0000-0000-0000-000000001ba1');
  select signature_path, fields into r from public.qm_certificate_templates
   where id = '00000000-0000-0000-0000-000000001bd2';
  if r.signature_path is null and r.fields->>'course' = 'Bengkel Robotik' then
    raise notice 'LULUS 4: kelas Percuma membuang signature_path, fields dikekalkan (insert)';
  else
    raise exception 'GAGAL 4: signature_path=% fields=%', r.signature_path, r.fields;
  end if;

  -- Update signature_path pada templat Percuma juga dibuang.
  update public.qm_certificate_templates
     set signature_path = '00000000-0000-0000-0000-000000001bc1/00000000-0000-0000-0000-000000001bd2/signature-b.png'
   where id = '00000000-0000-0000-0000-000000001bd2';
  select signature_path into r from public.qm_certificate_templates
   where id = '00000000-0000-0000-0000-000000001bd2';
  if r.signature_path is null then
    raise notice 'LULUS 5: kelas Percuma membuang signature_path (update)';
  else
    raise exception 'GAGAL 5: signature_path kekal %', r.signature_path;
  end if;

  -- Update fields pada templat Percuma diterima (semua pelan).
  update public.qm_certificate_templates
     set fields = '{"course":"Bengkel Robotik Tahap 2"}'::jsonb
   where id = '00000000-0000-0000-0000-000000001bd2';
  select fields->>'course' into r from public.qm_certificate_templates
   where id = '00000000-0000-0000-0000-000000001bd2';
  if r is not null then
    raise notice 'LULUS 6: fields boleh dikemas kini pada kelas Percuma';
  else
    raise exception 'GAGAL 6: fields tidak disimpan pada kelas Percuma';
  end if;
end $$;

-- 5. Kelas Pro: signature_path dan fields dikekalkan.
do $$
declare v_sig text;
        v_pena text;
begin
  insert into public.qm_certificate_templates
    (id, class_id, title, fields, signature_path, created_by) values
    ('00000000-0000-0000-0000-000000001bd3', '00000000-0000-0000-0000-000000001bc2',
     'V2-016b Pro',
     '{"course":"Bengkel Drone","date_start":"2026-10-01","date_end":"2026-10-03","location":"Makmal B","signer_name":"Dr Hariz","signer_title":"Pensyarah"}'::jsonb,
     '00000000-0000-0000-0000-000000001bc2/00000000-0000-0000-0000-000000001bd3/signature-a.png',
     '00000000-0000-0000-0000-000000001ba2');
  select signature_path, fields->>'signer_name' into v_sig, v_pena
    from public.qm_certificate_templates
   where id = '00000000-0000-0000-0000-000000001bd3';
  if v_sig is not null and v_pena = 'Dr Hariz' then
    raise notice 'LULUS 7: kelas Pro mengekalkan signature_path dan fields';
  else
    raise exception 'GAGAL 7: signature_path=% signer_name=%', v_sig, v_pena;
  end if;
end $$;

-- 6. qm_certificate_asset_in_use mengesan signature_path.
do $$
begin
  if public.qm_certificate_asset_in_use(
    '00000000-0000-0000-0000-000000001bc2/00000000-0000-0000-0000-000000001bd3/signature-a.png') then
    raise notice 'LULUS 8: signature_path yang dirujuk dikesan digunakan';
  else
    raise exception 'GAGAL 8: signature_path yang digunakan tidak dikesan';
  end if;

  if not public.qm_certificate_asset_in_use(
    '00000000-0000-0000-0000-000000001bc2/00000000-0000-0000-0000-000000001bd3/signature-lama.png') then
    raise notice 'LULUS 9: laluan tandatangan yang tidak dirujuk dikenal pasti tidak digunakan';
  else
    raise exception 'GAGAL 9: laluan yang tidak digunakan dianggap digunakan';
  end if;

  if not public.qm_certificate_asset_in_use(null) then
    raise notice 'LULUS 10: NULL tidak dianggap digunakan';
  else
    raise exception 'GAGAL 10: NULL dianggap digunakan';
  end if;
end $$;

-- 7. Had bucket certificates = 15728640 bait (15 MB).
do $$
declare v_had int;
begin
  select file_size_limit into v_had from storage.buckets where id = 'certificates';
  if v_had = 15728640 then
    raise notice 'LULUS 11: bucket certificates berhad % bait', v_had;
  else
    raise exception 'GAGAL 11: had bucket certificates = % (jangkaan 15728640)', v_had;
  end if;
end $$;

rollback;
