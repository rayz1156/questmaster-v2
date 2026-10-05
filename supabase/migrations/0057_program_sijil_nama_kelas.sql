-- KZ-010: Nama kursus lalai daripada nama kelas (PDF dan rekod sijil).
-- Masalah: qm_issue_certificates (0055) menetapkan
--   v_prog := coalesce(v_title, v_class_nm)
-- iaitu TAJUK TEMPLAT. Templat dari pustaka bertajuk nama reka bentuk
-- ("Islamik Geometri (Penyertaan)"), jadi program_snapshot, subjek emel dan
-- halaman pengesahan memaparkan nama reka bentuk, bukan nama kursus.
-- Keputusan: jika fields.course kosong, guna nama kelas. Tajuk templat
-- TIDAK lagi digunakan sebagai nama program.
-- Salinan 0055:105-208 dengan perubahan HANYA pada v_fields (bacaan baru)
-- dan v_prog (keutamaan). Tandatangan, semakan kebenaran, nama sandaran,
-- kelayakan dan logik keluarkan semula KEKAL sama tepat.
-- program_snapshot sijil sedia ada TIDAK diubah.

-- ---------------------------------------------------------------------
-- Pengeluaran sijil: nama kursus = fields.course, jika tidak nama kelas.
-- Salinan 0055:105-208; perubahan HANYA pada bacaan t.fields dan v_prog.
-- ---------------------------------------------------------------------
create or replace function public.qm_issue_certificates(
  p_template     uuid,
  p_participants uuid[] default null
)
returns table (issued_count int, issued_ids uuid[])
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_class_id  uuid;
  v_title     text;
  v_class_nm  text;
  v_prog      text;
  v_code      text;
  v_new_id    uuid;
  v_existing  uuid;
  v_ok        boolean;
  v_criteria  jsonb;
  -- KZ-010: medan isian templat; kunci 'course' ialah nama kursus.
  v_fields    jsonb;
  r           record;
begin
  select t.class_id, t.title, t.criteria, t.fields
    into v_class_id, v_title, v_criteria, v_fields
    from public.qm_certificate_templates t
   where t.id = p_template;
  if v_class_id is null then
    raise exception 'Certificate template not found.';
  end if;
  if not public.qm_certificate_is_educator(v_class_id) then
    raise exception 'Only the class educator can issue certificates.';
  end if;
  select k.name into v_class_nm from public.qm_classes k where k.id = v_class_id;
  -- KZ-010: kursus daripada fields.course; kosong/buti kosong -> nama kelas;
  -- tajuk templat hanya sandaran terakhir (TIDAK lagi nama program utama).
  v_prog := coalesce(nullif(btrim(v_fields->>'course'), ''), v_class_nm, v_title);

  issued_count := 0;
  issued_ids := array[]::uuid[];

  for r in
    select m.user_id,
           -- KZ-007: nama sandaran display_name bila certificate_name kosong.
           coalesce(p.certificate_name, nullif(btrim(p.display_name), '')) as nama
      from public.qm_class_members m
      join public.qm_profiles p on p.id = m.user_id
     where m.class_id = v_class_id
       and (p_participants is null or m.user_id = any (p_participants))
  loop
    -- KZ-007: langkau hanya jika tiada nama langsung (tiada nama sijil dan
    -- tiada nama paparan); bukan lagi bila certificate_name sahaja kosong.
    if r.nama is null then
      continue;
    end if;
    -- Semak kelayakan semula untuk senarai yang diberi (semua atau tiada
    -- kenaikan kadar: yang tidak layak dilangkau, tidak dihentikan). L3:
    -- semakan seorang peserta, bukan gelung semua ahli bagi setiap panggilan.
    if not public.qm_certificate_participant_eligible(p_template, r.user_id) then
      continue;
    end if;
    -- Sijil aktif sedia ada: langkau (tiada pendua). Sijil yang DIBATALKAN
    -- boleh dikeluarkan semula (M2) dengan mengemas kini baris yang sama,
    -- kerana kekangan unik (template_id, participant_id) menghalang sisipan
    -- baharu selagi baris lama ada.
    select c.id into v_existing
      from public.qm_certificates c
     where c.template_id = p_template
       and c.participant_id = r.user_id
       and c.revoked_at is null;
    if found then
      continue;
    end if;
    select c.id into v_existing
      from public.qm_certificates c
     where c.template_id = p_template
       and c.participant_id = r.user_id
       and c.revoked_at is not null;

    v_code := public.qm_certificate_code();
    if v_existing is not null then
      update public.qm_certificates
         set code = v_code,
             name_snapshot = r.nama,
             program_snapshot = v_prog,
             issued_at = now(),
             issued_by = auth.uid(),
             revoked_at = null,
             revoked_reason = null
       where id = v_existing;
      issued_count := issued_count + 1;
      issued_ids := issued_ids || v_existing;
    else
      insert into public.qm_certificates
        (template_id, class_id, participant_id, name_snapshot, program_snapshot, code, issued_by)
      values
        (p_template, v_class_id, r.user_id, r.nama, v_prog, v_code, auth.uid())
      returning qm_certificates.id into v_new_id;
      issued_count := issued_count + 1;
      issued_ids := issued_ids || v_new_id;
    end if;
  end loop;
  return next;
end;
$fn$;

revoke all on function public.qm_issue_certificates(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.qm_issue_certificates(uuid, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
