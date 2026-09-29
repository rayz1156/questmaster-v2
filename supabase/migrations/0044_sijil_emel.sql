-- 0044_sijil_emel.sql
--
-- V2-003b: tambahan sijil untuk emel pukal dan pengesahan nama peserta.
-- Dua fungsi SECURITY DEFINER sahaja; tiada jadual diubah, tiada polisi RLS
-- baharu pada jadual sedia ada.
--
-- 1. qm_certificate_email_targets(p_class, p_limit)
--    Senarai sijil yang belum emailed_at beserta emel pemiliknya. Emel
--    peserta TIADA dalam qm_profiles (lihat 0009b: ia berasal dari
--    auth.users), jadi fungsi ini menyertai auth.users. Kebenaran: hanya
--    pendidik kelas (qm_certificate_is_educator) boleh memanggil.
--
-- 2. qm_certificate_classes_needing_name()
--    Kelas peserta yang mempunyai templat sijil tetapi nama sijilnya belum
--    disahkan. Digunakan oleh kad "My certificates" dan sepanduk di
--    /participant/home. Tiada nama templat yang didedahkan; hanya nama
--    kelas, yang sudah dilihat peserta itu sendiri.
--
-- Mesej ralat Bahasa Inggeris (sampai ke skrin pengguna melalui json.error).
-- Tiada BEGIN/COMMIT di sini. Idempoten.

-- ---------------------------------------------------------------------
-- 1. Sasaran emel: sijil belum emailed_at, emel daripada auth.users
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_email_targets(
  p_class uuid,
  p_limit int default 200
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
  -- pemanggil memberi nilai besar.
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
      and c.emailed_at is null
      and u.email is not null
    order by c.issued_at asc
    limit greatest(coalesce(p_limit, 200), 1)::int;
end;
$fn$;

revoke all on function public.qm_certificate_email_targets(uuid, int) from public, anon;
grant execute on function public.qm_certificate_email_targets(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Kelas yang memerlukan pengesahan nama (untuk peserta)
--    Pulangkan SATU baris bagi setiap kelas peserta ini yang ada templat
--    sijil manakala certificate_name_confirmed_at masih NULL.
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_classes_needing_name()
returns table (
  class_id   uuid,
  class_name text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select distinct k.id, k.name
  from public.qm_class_members m
  join public.qm_classes k on k.id = m.class_id
  where m.user_id = auth.uid()
    and exists (
      select 1 from public.qm_certificate_templates t
      where t.class_id = k.id
    )
    and exists (
      select 1 from public.qm_profiles p
      where p.id = auth.uid()
        and p.certificate_name_confirmed_at is null
    );
$fn$;

grant execute on function public.qm_certificate_classes_needing_name() to authenticated;
revoke all on function public.qm_certificate_classes_needing_name() from anon;

notify pgrst, 'reload schema';
