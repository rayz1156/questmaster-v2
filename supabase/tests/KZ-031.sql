-- Ujian KZ-031 (dijalankan CTO pada supabase-db dan supabase-db-veltrix):
--   psql ... -f supabase/tests/KZ-031.sql
-- Semua perubahan dibatalkan (BEGIN ... ROLLBACK). Migrasi 0022 mungkin
-- dijalankan terlebih dahulu. Tiada COMMIT dalam fail ini.
-- Temuan 7 CTO: ujian menyemai sendiri lms_creators dan lms_courses
-- (diterbitkan) bagi pengguna ujian; ujian pendaftaran TIDAK dilangkau.
begin;

do $$
declare
  v_gagal integer := 0;
  v_user uuid;
  v_pencipta uuid;
  v_kursus uuid;
  v_sedia uuid;
  v_kira integer;
  v_hash text := repeat('a1', 32);
begin
  -- Persediaan: pengguna ujian dalam auth.users (dibatalkan oleh ROLLBACK).
  begin
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data)
    values (
      '11111111-1111-4111-8111-111111111111',
      'kz031-ujian@example.invalid',
      crypt('kz031-ujian', gen_salt('bf')),
      now(),
      'authenticated',
      'authenticated',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Ujian KZ-031","role":"participant"}'::jsonb
    );
  exception when others then
    raise notice 'LANGKAH: pengguna ujian tidak dapat dicipta (%), gunakan pengguna sedia ada', sqlerrm;
  end;

  select id into v_user from auth.users
    where lower(btrim(email)) = 'kz031-ujian@example.invalid' limit 1;
  if v_user is null then
    select id into v_user from auth.users order by created_at limit 1;
  end if;
  if v_user is null then
    raise exception 'KZ-031: tiada pengguna untuk diuji';
  end if;

  -- Penyemaian (temuan 7 CTO): profil pencipta bagi pengguna ujian.
  -- Guna profil sedia ada jika pengguna ujian terpaksa diambil daripada
  -- senarai (laluan LANGKAH di atas), selain itu cipta yang baharu.
  select id into v_pencipta from lms_creators where owner_id = v_user limit 1;
  if v_pencipta is null then
    begin
      insert into lms_creators (owner_id, slug, display_name, is_published)
      values (v_user, 'kz031-pencipta-ujian', 'Ujian KZ-031', true)
      on conflict do nothing
      returning id into v_pencipta;
    exception when others then
      raise notice 'GAGAL S1: tidak dapat semai lms_creators: %', sqlerrm;
      v_gagal := v_gagal + 1;
    end;
  end if;
  if v_pencipta is null then
    raise exception 'KZ-031: gagal semai lms_creators, ujian pendaftaran tidak boleh diteruskan';
  end if;

  -- Penyemaian (temuan 7 CTO): kursus DITERBITKAN milik pencipta ujian.
  select id into v_kursus from lms_courses
    where creator_id = v_pencipta and slug = 'kz031-kursus-ujian' limit 1;
  if v_kursus is null then
    begin
      insert into lms_courses (creator_id, title, slug, subtitle, is_free, price_cents, currency, is_published)
      values (v_pencipta, 'Kursus Ujian KZ-031', 'kz031-kursus-ujian', null, false, 4900, 'MYR', true)
      on conflict do nothing
      returning id into v_kursus;
    exception when others then
      raise notice 'GAGAL S2: tidak dapat semai lms_courses: %', sqlerrm;
      v_gagal := v_gagal + 1;
    end;
    select id into v_kursus from lms_courses
      where creator_id = v_pencipta and slug = 'kz031-kursus-ujian' limit 1;
  end if;
  if v_kursus is null then
    raise exception 'KZ-031: gagal semai lms_courses, ujian pendaftaran tidak boleh diteruskan';
  end if;
  -- Pastikan kursus semaian diterbitkan seperti niat ujian.
  update lms_courses set is_published = true where id = v_kursus and is_published = false;

  -- U1: source 'pay' kini dibenarkan oleh semakan constraint (langkah migrasi 1).
  begin
    insert into lms_enrollments (user_id, course_id, source, assignment_type, amount_cents, currency, pay_order_ref)
    values (v_user, v_kursus, 'pay', 'self', 4900, 'MYR', 'KZ031-UJI-1');
  exception when others then
    v_gagal := v_gagal + 1;
    raise notice 'GAGAL U1: insert source pay menimbulkan ralat: %', sqlerrm;
  end;

  -- U2: source luar senarai tetap ditolak oleh constraint.
  begin
    insert into lms_enrollments (user_id, course_id, source)
    values (v_user, v_kursus, 'tidak_sah');
    v_gagal := v_gagal + 1;
    raise notice 'GAGAL U2: source tidak_sah sepatutnya ditolak oleh lms_enrollments_source_check';
  exception when check_violation then
    raise notice 'LULUS U2: source tidak_sah ditolak oleh semakan constraint';
  when others then
    v_gagal := v_gagal + 1;
    raise notice 'GAGAL U2: ralat di luar jangkaan untuk source tidak_sah: %', sqlerrm;
  end;

  -- U3: insert idempoten (ON CONFLICT DO NOTHING) tidak menduakan pendaftaran.
  select id into v_sedia from lms_enrollments
    where user_id = v_user and course_id = v_kursus limit 1;
  if v_sedia is not null then
    delete from lms_enrollments where user_id = v_user and course_id = v_kursus;
  end if;

  insert into lms_enrollments (user_id, course_id, source, assignment_type, amount_cents, currency, pay_order_ref)
  values (v_user, v_kursus, 'pay', 'self', 4900, 'MYR', 'KZ031-UJI-2')
  on conflict (user_id, course_id) do nothing;

  insert into lms_enrollments (user_id, course_id, source, assignment_type, amount_cents, currency, pay_order_ref)
  values (v_user, v_kursus, 'pay', 'self', 4900, 'MYR', 'KZ031-UJI-3')
  on conflict (user_id, course_id) do nothing;

  select count(*) into v_kira from lms_enrollments
    where user_id = v_user and course_id = v_kursus;
  if v_kira = 1 then
    raise notice 'LULUS U3: insert idempoten menghasilkan % baris', v_kira;
  else
    v_gagal := v_gagal + 1;
    raise notice 'GAGAL U3: sepatutnya 1 baris, sebenar % baris', v_kira;
  end if;

  -- U4: fungsi lms_pay_cari_pengguna menjumpai pengguna mengikut e-mel
  --     (dijalankan sebagai peranan semasa, iaitu pemilik skema).
  select lms_pay_cari_pengguna('  KZ031-Ujian@Example.invalid  ') into v_sedia;
  if v_sedia = v_user then
    raise notice 'LULUS U4: fungsi menjumpai pengguna (lower dan btrim berfungsi)';
  else
    v_gagal := v_gagal + 1;
    raise notice 'GAGAL U4: fungsi memulangkan %, dijangka %', coalesce(v_sedia::text, 'NULL'), v_user;
  end if;

  -- U4b: service_role BOLEH melaksanakan fungsi (temuan 1 CTO: lapisan kedua
  --      menerima service_role). Jika peranan psql bukan ahli service_role,
  --      uji laluan JWT yang dipakai PostgREST sebagai ganti.
  begin
    set local role service_role;
    perform lms_pay_cari_pengguna('kz031-ujian@example.invalid');
    raise notice 'LULUS U4b: service_role dibenarkan melaksanakan fungsi';
  exception when others then
    begin
      reset role;
      perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
      perform lms_pay_cari_pengguna('kz031-ujian@example.invalid');
      raise notice 'LULUS U4b: peranan JWT service_role dibenarkan oleh lapisan kedua';
    exception when others then
      v_gagal := v_gagal + 1;
      raise notice 'GAGAL U4b: service_role sepatutnya dibenarkan: %', sqlerrm;
    end;
  end;
  reset role;

  -- U5: authenticated TIDAK boleh melaksanakan fungsi (EXECUTE hanya service_role).
  begin
    set local role authenticated;
    perform lms_pay_cari_pengguna('kz031-ujian@example.invalid');
    v_gagal := v_gagal + 1;
    raise notice 'GAGAL U5: authenticated sepatutnya ditolak';
  exception
    when insufficient_privilege then
      raise notice 'LULUS U5: authenticated ditolak (insufficient_privilege)';
    when others then
      v_gagal := v_gagal + 1;
      raise notice 'GAGAL U5: ralat di luar jangkaan: %', sqlerrm;
  end;
  reset role;

  -- U6: anon TIDAK boleh melaksanakan fungsi.
  begin
    set local role anon;
    perform lms_pay_cari_pengguna('kz031-ujian@example.invalid');
    v_gagal := v_gagal + 1;
    raise notice 'GAGAL U6: anon sepatutnya ditolak';
  exception
    when insufficient_privilege then
      raise notice 'LULUS U6: anon ditolak (insufficient_privilege)';
    when others then
      v_gagal := v_gagal + 1;
      raise notice 'GAGAL U6: ralat di luar jangkaan: %', sqlerrm;
  end;
  reset role;

  -- U7: kunci API dengan skop luar 'pay' ditolak oleh semakan scope.
  begin
    insert into lms_api_keys (user_id, label, key_prefix, key_hash, scope)
    values (v_user, 'ujian skop', 'ak_live_uji', v_hash, 'web');
    v_gagal := v_gagal + 1;
    raise notice 'GAGAL U7: scope web sepatutnya ditolak';
  exception
    when check_violation then
      raise notice 'LULUS U7: scope web ditolak oleh lms_api_keys_scope_check';
    when others then
      v_gagal := v_gagal + 1;
      raise notice 'GAGAL U7: ralat di luar jangkaan: %', sqlerrm;
  end;

  -- U8: cincangan kunci mesti unik (indeks 0022) dan skop lalai 'pay'.
  begin
    insert into lms_api_keys (user_id, label, key_prefix, key_hash)
    values (v_user, 'ujian 1', 'ak_live_uji', v_hash);
  exception when others then
    v_gagal := v_gagal + 1;
    raise notice 'GAGAL U8: insert pertama tidak sepatutnya gagal: %', sqlerrm;
  end;

  begin
    insert into lms_api_keys (user_id, label, key_prefix, key_hash)
    values (v_user, 'ujian 2', 'ak_live_uji', v_hash);
    v_gagal := v_gagal + 1;
    raise notice 'GAGAL U8: key_hash berganda sepatutnya ditolak';
  exception
    when unique_violation then
      raise notice 'LULUS U8: key_hash berganda ditolak oleh indeks unik';
    when others then
      v_gagal := v_gagal + 1;
      raise notice 'GAGAL U8: ralat di luar jangkaan: %', sqlerrm;
  end;

  declare
    v_skop text;
  begin
    select scope into v_skop from lms_api_keys where key_hash = v_hash limit 1;
    if v_skop = 'pay' then
      raise notice 'LULUS U8b: skop lalai lajur ialah pay';
    else
      v_gagal := v_gagal + 1;
      raise notice 'GAGAL U8b: skop lalai ialah %, dijangka pay', coalesce(v_skop, 'NULL');
    end if;
  end;

  if v_gagal > 0 then
    raise exception 'KZ-031: % semakan gagal', v_gagal;
  end if;
  raise notice 'KZ-031: semua semakan lulus';
end
$$;

rollback;
