-- 0055_sijil_nama_sandaran_emel_pilih.sql
--
-- KZ-007: sijil tidak sampai kepada peserta.
--   1. qm_issue_certificates: nama sandaran display_name (btrim) jika
--      certificate_name belum disahkan, supaya ahli tanpa nama disahkan
--      tetap menerima sijil dengan name_snapshot = display_name.
--   2. qm_certificate_eligibility: lajur certificate_name memulangkan nilai
--      coalesce yang sama; name_confirmed KEKAL certificate_name is not null.
--   3. qm_certificate_email_targets: pilihan sasaran (p_ids) dan hantar
--      semula (p_resend); tandatangan lama (uuid, integer) digugurkan.
--
-- Tandatangan, semakan kebenaran (qm_certificate_is_educator), kelayakan dan
-- logik keluarkan semula KEKAL. Tiada jadual diubah. Tiada BEGIN/COMMIT di
-- sini. Idempoten (create or replace + drop function if exists).
-- Mesej ralat Bahasa Inggeris (sampai ke skrin pengguna melalui json.error).

-- ---------------------------------------------------------------------
-- 1. Kelayakan sijil: certificate_name memulangkan nama sandaran.
--    Salinan 0042:324-396; perubahan HANYA pada gelung pilih dan lajur
--    certificate_name (nilai coalesce). name_confirmed kekal.
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_eligibility(p_template uuid)
returns table (
  participant_id   uuid,
  display_name     text,
  certificate_name text,
  name_confirmed   boolean,
  eligible         boolean,
  reason           text,
  already_issued   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_class_id  uuid;
  v_criteria  jsonb;
  v_elig      boolean;
  r           record;
begin
  select t.class_id, t.criteria
    into v_class_id, v_criteria
    from public.qm_certificate_templates t
   where t.id = p_template;
  if v_class_id is null then
    raise exception 'Certificate template not found.';
  end if;
  -- C1: fungsi ini mendedahkan nama ahli kelas, jadi ia hanya untuk pemilik
  -- kelas atau pendidik diterima kelas itu.
  if not public.qm_certificate_is_educator(v_class_id) then
    raise exception 'Only the class educator can view certificate eligibility.';
  end if;

  for r in
    select m.user_id,
           p.display_name,
           p.certificate_name,
           -- KZ-007: nama sandaran (display_name) jika nama sijil belum disahkan.
           coalesce(p.certificate_name, nullif(btrim(p.display_name), '')) as nama
      from public.qm_class_members m
      join public.qm_profiles p on p.id = m.user_id
     where m.class_id = v_class_id
  loop
    -- L3: kelayakan untuk seorang peserta, bukan gelung semua ahli bagi
    -- setiap panggilan.
    v_elig := public.qm_certificate_participant_eligible(p_template, r.user_id);

    return query
    select
      r.user_id,
      r.display_name,
      -- KZ-007: nama sandaran diteruskan kepada UI dengan label (display name).
      r.nama,
      -- name_confirmed KEKAL: hanya nama yang benar-benar disahkan dianggap disahkan.
      r.certificate_name is not null,
      v_elig,
      case
        when v_criteria->>'type' = 'all_members' then 'All members are eligible.'
        when v_criteria->>'type' = 'min_score' then
          case when v_elig then 'Meets the minimum score.' else 'Score below the minimum required.' end
        else case when v_elig then 'Attended the live quiz.' else 'Did not attend the live quiz.' end
      end,
      exists(
        select 1 from public.qm_certificates c2
         where c2.template_id = p_template
           and c2.participant_id = r.user_id
           and c2.revoked_at is null
      );
  end loop;
end;
$fn$;

-- C1: REVOKE daripada PUBLIC/anon; hanya pendidik melalui laluan app yang
-- memanggilnya, dan fungsi itu sendiri sudah menyemak pendidik kelas.
revoke all on function public.qm_certificate_eligibility(uuid) from public, anon;
grant execute on function public.qm_certificate_eligibility(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Pengeluaran sijil: nama sandaran bila nama sijil belum disahkan.
--    Salinan 0042:402-502; perubahan HANYA pada gelung pilih (nama),
--    syarat continue dan name_snapshot (sisip dan kemas kini).
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
  r           record;
begin
  select t.class_id, t.title, t.criteria
    into v_class_id, v_title, v_criteria
    from public.qm_certificate_templates t
   where t.id = p_template;
  if v_class_id is null then
    raise exception 'Certificate template not found.';
  end if;
  if not public.qm_certificate_is_educator(v_class_id) then
    raise exception 'Only the class educator can issue certificates.';
  end if;
  select k.name into v_class_nm from public.qm_classes k where k.id = v_class_id;
  v_prog := coalesce(v_title, v_class_nm);

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

-- ---------------------------------------------------------------------
-- 3. Sasaran emel: pilihan sijil (p_ids) dan hantar semula (p_resend).
--    Salinan 0044:25-71; tandatangan baharu dan dua tapisan baharu.
--    Tandatangan lama (uuid, integer) digugurkan dahulu supaya PostgREST
--    tidak mengekalkan overloading lama.
-- ---------------------------------------------------------------------
drop function if exists public.qm_certificate_email_targets(uuid, integer);

create or replace function public.qm_certificate_email_targets(
  p_class uuid,
  p_limit integer default 200,
  p_ids uuid[] default null,
  p_resend boolean default false
)
returns table (
  certificate_id uuid,
  code            text,
  name_snapshot   text,
  program_snapshot text,
  email           text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  -- Semakan kebenaran: pendidik kelas sahaja (pemilik atau co-educator
  -- yang jemputannya sudah diterima), selari dengan laluan API.
  if not public.qm_certificate_is_educator(p_class) then
    raise exception 'Only the class educator can send certificate emails.';
  end if;

  -- p_limit diapit supaya had 200 setiap panggilan dipatuhi walaupun
  -- pemanggil memberi nilai besar (KZ-007: diapit dua hala).
  return query
    select
      c.id,
      c.code,
      c.name_snapshot,
      c.program_snapshot,
      u.email::text
    from public.qm_certificates c
    join public.qm_profiles p on p.id = c.participant_id
    join auth.users u on u.id = p.id
    where c.class_id = p_class
      and c.revoked_at is null
      and c.pdf_path is not null
      -- KZ-007: penapis pilihan sijil (null = semua yang memenuhi syarat lain).
      and (p_ids is null or c.id = any(p_ids))
      -- KZ-007: tanpa p_resend hanya yang belum diemel; hantar semula hanya
      -- bila p_ids diberi (supaya "resend semua" tidak berlaku secara senyap).
      and (c.emailed_at is null or (p_resend and p_ids is not null))
      and u.email is not null
    order by c.issued_at asc
    limit least(greatest(coalesce(p_limit, 200), 1), 200)::int;
end;
$fn$;

revoke all on function public.qm_certificate_email_targets(uuid, integer, uuid[], boolean) from public, anon;
grant execute on function public.qm_certificate_email_targets(uuid, integer, uuid[], boolean) to authenticated;

notify pgrst, 'reload schema';