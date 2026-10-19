-- 0065_kemaskini_reka_sijil.sql
--
-- KZ-029: kemas kini reka bentuk sijil sedia ada kepada templat aktif
-- (TANPA revoke dan TANPA menukar kod sijil).
--
-- Masalah: PDF dijana SEKALI semasa issue dan disimpan pada
-- `<class_id>/<code>.pdf`. Apabila templat aktif kelas bertukar, sijil lama
-- masih membawa PDF reka bentuk lama dan Resend menghantarnya semula. Satu-
-- satunya jalan sebelum ini ialah revoke dan issue semula (kod bertukar).
--
-- Fungsi 1: qm_rebind_certificates - pindahkan sijil terpilih ke templat
-- aktif kelas. Kod, name_snapshot, issued_at, issued_by dan emailed_at
-- KEKAL; hanya template_id dan program_snapshot dikemas kini.
--
-- Fungsi 2: qm_delete_certificate_template - padam templat sijil yang
-- tidak aktif dan tiada sijil merujuknya (FK template_id ialah RESTRICT).
--
-- Tiada BEGIN/COMMIT di sini (fail migrasi tidak boleh mengandungi COMMIT).
-- Idempoten: create or replace. RLS templat/sijil TIDAK diubah.
-- Skema jadual sijil: migrasi 0042 (unique (template_id, participant_id)
-- merangkumi baris dibatalkan; template_id FK RESTRICT).

-- ---------------------------------------------------------------------
-- 1. RPC kemas kini reka bentuk sijil ke templat aktif
-- ---------------------------------------------------------------------
create or replace function public.qm_rebind_certificates(
  p_class uuid,
  p_ids   uuid[]
)
returns table (updated_ids uuid[], skipped_count int)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_templat  uuid;
  v_title    text;
  v_fields   jsonb;
  v_class_nm text;
  v_prog     text;
  v_id       uuid;
  v_peserta  uuid;
  v_sedia    uuid;
  v_dikemas  uuid[] := array[]::uuid[];
  v_langkau  int := 0;
begin
  -- Pertahanan berlapis (kzsec): panggilan tanpa sesi ditolak awal.
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  -- Pendidik kelas sahaja (owner atau qm_class_educators, 0042).
  if not public.qm_certificate_is_educator(p_class) then
    raise exception 'Only the class educator can update certificates.';
  end if;
  -- Templat aktif kelas; tiada -> tolak.
  select t.id, t.title, t.fields
    into v_templat, v_title, v_fields
    from public.qm_certificate_templates t
   where t.class_id = p_class
     and t.is_active;
  if v_templat is null then
    raise exception 'No active certificate template.';
  end if;
  -- Had senarai: null atau lebih 50 ditolak. Tatasusunan kosong juga
  -- tidak bermakna, jadi array_length null (kosong) dianggap tidak sah.
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0
     or array_length(p_ids, 1) > 50 then
    raise exception 'Provide between 1 and 50 certificate ids.';
  end if;

  -- Aturan program_snapshot yang sama dengan 0057: medan course templat
  -- aktif, jika kosong nama kelas, sandaran terakhir tajuk templat.
  select k.name into v_class_nm from public.qm_classes k where k.id = p_class;
  v_prog := coalesce(nullif(btrim(v_fields->>'course'), ''), v_class_nm, v_title);

  for v_id in select unnest(p_ids) loop
    -- Hanya sijil kelas ini yang tidak dibatalkan. Id kelas lain dan
    -- sijil dibatalkan diabaikan (dikira skipped, tiada ralat).
    select c.participant_id into v_peserta
      from public.qm_certificates c
     where c.id = v_id
       and c.class_id = p_class
       and c.revoked_at is null;
    if v_peserta is null then
      v_langkau := v_langkau + 1;
      continue;
    end if;
    -- Kekangan unik (template_id, participant_id) merangkumi baris
    -- dibatalkan: jika peserta sudah ada sijil LAIN di bawah templat
    -- aktif, kemas kini akan gagal, jadi langkau dengan aman.
    select c.id into v_sedia
      from public.qm_certificates c
     where c.template_id = v_templat
       and c.participant_id = v_peserta
       and c.id <> v_id;
    if found then
      v_langkau := v_langkau + 1;
      continue;
    end if;
    -- Sijil yang sudah menggunakan templat aktif TETAP masuk updated:
    -- kemas kini ini no-op untuk data, tetapi PDFnya tetap dijana semula
    -- oleh laluan pemanggil.
    update public.qm_certificates
       set template_id = v_templat,
           program_snapshot = v_prog
     where id = v_id
       and class_id = p_class
       and revoked_at is null;
    v_dikemas := v_dikemas || v_id;
  end loop;

  -- returns table: nama lajur berada dalam skop fungsi; guna pemboleh
  -- ubah tempatan dan return next (return kosong memulangkan sifar baris).
  updated_ids := v_dikemas;
  skipped_count := v_langkau;
  return next;
end;
$fn$;

revoke all on function public.qm_rebind_certificates(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.qm_rebind_certificates(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. RPC padam templat sijil
-- ---------------------------------------------------------------------
create or replace function public.qm_delete_certificate_template(p_template uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_class   uuid;
  v_aktif   boolean;
  v_bil     int;
  v_jumlah  int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  select t.class_id, t.is_active
    into v_class, v_aktif
    from public.qm_certificate_templates t
   where t.id = p_template;
  if v_class is null then
    raise exception 'Certificate template not found.';
  end if;
  if not public.qm_certificate_is_educator(v_class) then
    raise exception 'Only the class educator can delete a certificate template.';
  end if;
  -- Templat aktif tidak boleh dipadam kecuali ia satu-satunya templat
  -- kelas (kelas itu kemudian tiada templat aktif; boleh cipta baharu).
  if v_aktif then
    select count(*) into v_jumlah
      from public.qm_certificate_templates
     where class_id = v_class;
    if v_jumlah > 1 then
      raise exception 'Set another template as active before deleting this one.';
    end if;
  end if;
  -- FK qm_certificates_template_id_fkey ialah RESTRICT, jadi semak dahulu
  -- dan beri mesej sebenar; termasuk sijil yang sudah dibatalkan.
  select count(*) into v_bil
    from public.qm_certificates
   where template_id = p_template;
  if v_bil > 0 then
    -- RAISE guna %, bukan %s.
    raise exception '% certificates use this template. Use Update design to move them to the active template first.', v_bil;
  end if;
  delete from public.qm_certificate_templates where id = p_template;
end;
$fn$;

revoke all on function public.qm_delete_certificate_template(uuid) from public, anon, authenticated;
grant execute on function public.qm_delete_certificate_template(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
