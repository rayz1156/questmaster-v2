-- V2-015.sql (CTO): migrasi 0052, pencetus pelan templat sijil dan had bucket.
-- Satu transaksi, ROLLBACK di hujung. Semakan dihadkan kepada data ujian sendiri.
begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000015a1', 'v2-015-free@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000015a2', 'v2-015-pro@ujian.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000015a3', 'v2-015-unl@ujian.invalid',  'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

delete from public.qm_profiles where id in (
  '00000000-0000-0000-0000-0000000015a1'::uuid,
  '00000000-0000-0000-0000-0000000015a2'::uuid,
  '00000000-0000-0000-0000-0000000015a3'::uuid);
insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, plan_expires_at) values
  ('00000000-0000-0000-0000-0000000015a1', 'educator', 'Free Ujian',      'free',      true, false, null),
  ('00000000-0000-0000-0000-0000000015a2', 'educator', 'Pro Ujian',       'pro',       true, false, now() + interval '30 days'),
  ('00000000-0000-0000-0000-0000000015a3', 'educator', 'Unlimited Ujian', 'unlimited', true, false, null);

insert into public.qm_classes (id, owner_id, name, color, join_code) values
  ('00000000-0000-0000-0000-0000000015c1', '00000000-0000-0000-0000-0000000015a1', 'Kelas Free V2-015', '#6366f1', 'V215FFAA'),
  ('00000000-0000-0000-0000-0000000015c2', '00000000-0000-0000-0000-0000000015a2', 'Kelas Pro V2-015',  '#6366f1', 'V215PPBB'),
  ('00000000-0000-0000-0000-0000000015c3', '00000000-0000-0000-0000-0000000015a3', 'Kelas Unl V2-015',  '#6366f1', 'V215UUCC');

insert into public.qm_certificate_templates (id, class_id, title, background_path, logo_path) values
  ('00000000-0000-0000-0000-0000000015e1', '00000000-0000-0000-0000-0000000015c1', 'T free', '00000000-0000-0000-0000-0000000015c1/x/background-a.png', '00000000-0000-0000-0000-0000000015c1/x/logo-a.png'),
  ('00000000-0000-0000-0000-0000000015e2', '00000000-0000-0000-0000-0000000015c2', 'T pro',  '00000000-0000-0000-0000-0000000015c2/x/background-a.png', null),
  ('00000000-0000-0000-0000-0000000015e3', '00000000-0000-0000-0000-0000000015c3', 'T unl',  '00000000-0000-0000-0000-0000000015c3/x/background-a.png', '00000000-0000-0000-0000-0000000015c3/x/logo-a.png');

do $$
declare r record; v_lim bigint;
begin
  select public.qm_effective_plan('00000000-0000-0000-0000-0000000015a3') into r;
  select background_path, logo_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-0000000015e1';
  if r.background_path is null and r.logo_path is null then raise notice 'LULUS 1: pelan free, latar dan logo dipaksa NULL';
  else raise exception 'GAGAL 1: free mengekalkan aset %', r; end if;

  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-0000000015e2';
  if r.background_path is not null then raise notice 'LULUS 2: pelan pro mengekalkan latar';
  else raise exception 'GAGAL 2: pro kehilangan latar'; end if;

  select background_path, logo_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-0000000015e3';
  if r.background_path is not null and r.logo_path is not null then raise notice 'LULUS 3: pelan unlimited mengekalkan latar dan logo';
  else raise exception 'GAGAL 3: unlimited kehilangan aset %', r; end if;

  update public.qm_certificate_templates set background_path = '00000000-0000-0000-0000-0000000015c1/x/background-b.png'
   where id = '00000000-0000-0000-0000-0000000015e1';
  select background_path into r from public.qm_certificate_templates where id = '00000000-0000-0000-0000-0000000015e1';
  if r.background_path is null then raise notice 'LULUS 4: UPDATE pada pelan free juga dipaksa NULL';
  else raise exception 'GAGAL 4: UPDATE free lulus'; end if;

  select file_size_limit into v_lim from storage.buckets where id = 'certificate-assets';
  if v_lim = 8388608 then raise notice 'LULUS 5: had bucket certificate-assets 8MB';
  else raise exception 'GAGAL 5: had bucket %', v_lim; end if;

  if not has_function_privilege('anon', 'public.qm_certificate_template_plan_guard()', 'execute') then
    raise notice 'LULUS 6: anon tiada EXECUTE pada fungsi pencetus';
  else raise exception 'GAGAL 6: anon boleh EXECUTE'; end if;
end $$;

rollback;
