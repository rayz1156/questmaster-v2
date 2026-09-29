-- 0042_sijil.sql
--
-- V2-003a: Sijil peserta. Jadual templat dan sijil, penjanaan kod, RLS,
-- fungsi pengesahan awam, kelayakan, pengeluaran dan pembatalan, bucket
-- Storage peribadi, dan penjaga pelan untuk latar/logo tersuai.
--
-- Tiada BEGIN/COMMIT di sini (perangkap: fail migrasi tidak boleh mengandungi
-- COMMIT). Idempoten: if not exists di mana-mana yang mungkin.
--
-- Semua mesej ralat dalam Bahasa Inggeris kerana ia sampai ke skrin pengguna
-- (keputusan istilah UI: "Quiz", mesej API Inggeris).

-- ---------------------------------------------------------------------
-- 1. Nama pada sijil untuk setiap profil
-- ---------------------------------------------------------------------
alter table public.qm_profiles
  add column if not exists certificate_name text;
alter table public.qm_profiles
  add column if not exists certificate_name_confirmed_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Templat sijil
-- ---------------------------------------------------------------------
create table if not exists public.qm_certificate_templates (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.qm_classes(id) on delete cascade,
  title           text not null,
  background_path text,
  logo_path       text,
  layout          jsonb not null default '{}'::jsonb,
  criteria        jsonb not null default '{"type":"all_members"}'::jsonb,
  created_by      uuid references public.qm_profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.qm_certificate_templates enable row level security;
create index if not exists qm_certificate_templates_class_idx
  on public.qm_certificate_templates (class_id);

-- ---------------------------------------------------------------------
-- 3. Sijil
-- ---------------------------------------------------------------------
create table if not exists public.qm_certificates (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references public.qm_certificate_templates(id) on delete restrict,
  class_id         uuid not null references public.qm_classes(id) on delete cascade,
  participant_id   uuid not null references public.qm_profiles(id) on delete cascade,
  name_snapshot    text not null,
  program_snapshot text not null,
  code             text not null unique,
  issued_at        timestamptz not null default now(),
  issued_by        uuid references public.qm_profiles(id),
  revoked_at       timestamptz,
  revoked_reason   text,
  pdf_path         text,
  emailed_at       timestamptz,
  unique (template_id, participant_id)
);
alter table public.qm_certificates enable row level security;
create index if not exists qm_certificates_class_idx
  on public.qm_certificates (class_id);
create index if not exists qm_certificates_participant_idx
  on public.qm_certificates (participant_id);

revoke all on public.qm_certificate_templates from anon;
revoke all on public.qm_certificates from anon;
grant select, insert, update on public.qm_certificate_templates to authenticated;
grant select, insert, update on public.qm_certificates to authenticated;

-- ---------------------------------------------------------------------
-- 4. Penjaga kod sijil: 10 aksara, tiada 0, O, 1, I, L.
--    pgcrypto TIDAK boleh dicapai (perangkap live quiz 0018); guna
--    gen_random_uuid() yang sebahagian teras Postgres. Setiap bait heks
--    dimodulo 31 (panjang abjad). Ulang jika bertembung dengan kod sedia ada.
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_code()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_hex      text;
  v_i        int;
  v_attempt  int;
begin
  for v_attempt in 1..20 loop
    v_code := '';
    -- 64 aksara heks daripada dua UUID: cukup untuk 10 bait rawak.
    v_hex := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    for v_i in 1..10 loop
      v_code := v_code || substr(
        v_alphabet,
        (('x' || substr(v_hex, v_i * 2, 2))::bit(8)::int % 31) + 1,
        1
      );
    end loop;
    if not exists (select 1 from public.qm_certificates c where c.code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'Could not generate a unique certificate code. Please try again.';
end;
$fn$;

-- Kod sijil dijana di dalam fungsi pengeluaran sahaja; tiada sebab ia awam.
revoke all on function public.qm_certificate_code() from public, anon;

-- ---------------------------------------------------------------------
-- 5. Pembantu pendidik kelas: pemilik ATAU pendidik jemputan diterima
--    (pendidik ada dalam qm_class_educators, BUKAN qm_class_members).
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_is_educator(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists(
    select 1 from public.qm_classes
     where id = p_class and owner_id = auth.uid()
  ) or exists(
    select 1 from public.qm_class_educators
     where class_id = p_class
       and educator_id = auth.uid()
       and accepted_at is not null
  );
$fn$;
-- L1: auth.uid() sentiasa NULL untuk anon, jadi tiada gunanya ia awam.
revoke all on function public.qm_certificate_is_educator(uuid) from public, anon;
grant execute on function public.qm_certificate_is_educator(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS templat: pendidik kelas SELECT/INSERT/UPDATE.
-- ---------------------------------------------------------------------
drop policy if exists p_cert_templates_educator_read on public.qm_certificate_templates;
create policy p_cert_templates_educator_read on public.qm_certificate_templates
  for select to authenticated
  using (public.qm_certificate_is_educator(class_id));

drop policy if exists p_cert_templates_educator_write on public.qm_certificate_templates;
create policy p_cert_templates_educator_write on public.qm_certificate_templates
  for insert to authenticated
  with check (public.qm_certificate_is_educator(class_id));

drop policy if exists p_cert_templates_educator_update on public.qm_certificate_templates;
create policy p_cert_templates_educator_update on public.qm_certificate_templates
  for update to authenticated
  using (public.qm_certificate_is_educator(class_id))
  with check (public.qm_certificate_is_educator(class_id));

-- ---------------------------------------------------------------------
-- 7. RLS sijil: educator kelas baca/tulis (pembatalan, tiada DELETE),
--    peserta baca sijil sendiri sahaja. Tiada DELETE untuk sesiapa.
-- ---------------------------------------------------------------------
drop policy if exists p_cert_educator_read on public.qm_certificates;
create policy p_cert_educator_read on public.qm_certificates
  for select to authenticated
  using (public.qm_certificate_is_educator(class_id));

drop policy if exists p_cert_educator_insert on public.qm_certificates;
create policy p_cert_educator_insert on public.qm_certificates
  for insert to authenticated
  with check (public.qm_certificate_is_educator(class_id));

drop policy if exists p_cert_educator_revoke on public.qm_certificates;
create policy p_cert_educator_revoke on public.qm_certificates
  for update to authenticated
  using (public.qm_certificate_is_educator(class_id))
  with check (public.qm_certificate_is_educator(class_id));

drop policy if exists p_cert_owner_read on public.qm_certificates;
create policy p_cert_owner_read on public.qm_certificates
  for select to authenticated
  using (participant_id = auth.uid());

-- ---------------------------------------------------------------------
-- 8. Fungsi pengesahan awam: hanya medan yang selamat (PDPA).
--    Tiada emel, tiada ID, tiada skor. Tiada baris = kod tidak ditemui.
-- ---------------------------------------------------------------------
create or replace function public.qm_verify_certificate(p_code text)
returns table (
  name_snapshot    text,
  program_snapshot text,
  issued_at        timestamptz,
  issuer_name      text,
  status           text,
  revoked_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    c.name_snapshot,
    c.program_snapshot,
    c.issued_at,
    coalesce(issuer.display_name, owner.display_name, 'Kuizen'),
    case when c.revoked_at is not null then 'revoked' else 'valid' end,
    c.revoked_at
  from public.qm_certificates c
  left join public.qm_profiles issuer on issuer.id = c.issued_by
  join public.qm_classes k on k.id = c.class_id
  left join public.qm_profiles owner on owner.id = k.owner_id
 where c.code = p_code
   and p_code is not null
   and length(p_code) = 10;
$fn$;

grant execute on function public.qm_verify_certificate(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8b. Kelayakan untuk SEORANG peserta. Dipanggil oleh kelayakan senarai
--     (seksyen 9) dan pengeluaran (seksyen 10) supaya pengeluaran tidak
--     menggelung semua ahli bagi setiap peserta (temuan L3). Juga boleh
--     dipanggil terus melalui RPC, jadi ia menyemak pendidik kelas.
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_participant_eligible(
  p_template    uuid,
  p_participant uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_class_id uuid;
  v_criteria jsonb;
  v_hunt_id  uuid;
  v_quiz_id  uuid;
  v_min      numeric := 0;
  v_score    numeric;
  v_flag     boolean;
  v_uid      uuid;
begin
  select t.class_id, t.criteria
    into v_class_id, v_criteria
    from public.qm_certificate_templates t
   where t.id = p_template;
  if v_class_id is null then
    raise exception 'Certificate template not found.';
  end if;
  if not public.qm_certificate_is_educator(v_class_id) then
    raise exception 'Only the class educator can check certificate eligibility.';
  end if;

  v_uid := p_participant;
  if v_criteria->>'type' = 'hunt_completed' then
    v_hunt_id := (v_criteria->>'hunt_id')::uuid;
    select exists(
      select 1 from public.qm_submissions s
       join public.qm_challenges ch on ch.id = s.challenge_id
      where ch.hunt_id = v_hunt_id
        and s.user_id = v_uid
        and s.status = 'approved'
    ) into v_flag;
  elsif v_criteria->>'type' = 'min_score' then
    v_min := coalesce((v_criteria->>'min_score')::numeric, 0);
    if v_criteria ? 'hunt_id' then
      v_hunt_id := (v_criteria->>'hunt_id')::uuid;
    end if;
    -- Skor individu kelas
    select i.total_score::numeric into v_score
      from public.qm_class_individual_scores i
     where i.class_id = v_class_id
       and i.user_id = v_uid;
    -- Skor pasukan terbaik (jika lebih tinggi); hunt disekat jika diberi
    declare
      v_team numeric;
    begin
      select max(ts.total_score)::numeric into v_team
        from public.qm_team_scores ts
        join public.qm_team_members tm on tm.team_id = ts.team_id
       where tm.user_id = v_uid
         and exists (
           select 1 from public.qm_teams t2
            where t2.id = ts.team_id
              and t2.hunt_id = coalesce(v_hunt_id, t2.hunt_id)
              and t2.hunt_id in (select h.id from public.qm_hunts h where h.class_id = v_class_id)
         );
      if v_team is not null and (v_score is null or v_team > v_score) then
        v_score := v_team;
      end if;
    end;
    v_score := greatest(coalesce(v_score, 0), 0);
  elsif v_criteria->>'type' = 'live_attended' then
    v_quiz_id := (v_criteria->>'quiz_id')::uuid;
    select exists(
      select 1
        from public.qm_live_players lp
        join public.qm_live_sessions s on s.id = lp.session_id
       where s.quiz_id = v_quiz_id
         and lp.user_id = v_uid
    ) into v_flag;
  end if;

  return case
    when v_criteria->>'type' = 'all_members' then true
    when v_criteria->>'type' = 'min_score' then coalesce(v_score, 0) >= v_min
    else v_flag
  end;
end;
$fn$;

revoke all on function public.qm_certificate_participant_eligible(uuid, uuid) from public, anon;
grant execute on function public.qm_certificate_participant_eligible(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9. Kelayakan: semua ahli kelas + status kelayakan ikut criteria templat.
--    criteria jenis:
--      all_members                  -> semua ahli
--      hunt_completed {hunt_id}     -> ada penghantaran approved dalam hunt itu
--      min_score {hunt_id?, min_score} -> skor individu (qm_class_individual_scores)
--                                      ATAU skor pasukan terbaik (qm_team_scores)
--      live_attended {quiz_id}      -> ada baris qm_live_players dengan user_id
--                                      peserta dalam mana-mana sesi kuiz itu
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
           p.certificate_name
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
      r.certificate_name,
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
-- 10. Pengeluaran sijil: pendidik kelas sahaja. Layak DAN nama disahkan.
--     Nama lajur pulangan dilayakkan dengan nama jadual (perangkap plpgsql).
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
           p.certificate_name
      from public.qm_class_members m
      join public.qm_profiles p on p.id = m.user_id
     where m.class_id = v_class_id
       and (p_participants is null or m.user_id = any (p_participants))
  loop
    if r.certificate_name is null then
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
             name_snapshot = r.certificate_name,
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
        (p_template, v_class_id, r.user_id, r.certificate_name, v_prog, v_code, auth.uid())
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
-- 11. Pembatalan: pendidik kelas sahaja. Tiada DELETE sijil.
-- ---------------------------------------------------------------------
create or replace function public.qm_revoke_certificate(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_class_id uuid;
begin
  select c.class_id into v_class_id
    from public.qm_certificates c where c.id = p_id;
  if v_class_id is null then
    raise exception 'Certificate not found.';
  end if;
  if not public.qm_certificate_is_educator(v_class_id) then
    raise exception 'Only the class educator can revoke a certificate.';
  end if;
  update public.qm_certificates
     set revoked_at = now(), revoked_reason = p_reason
   where id = p_id and revoked_at is null;
  if not found then
    raise exception 'Certificate is already revoked.';
  end if;
end;
$fn$;

revoke all on function public.qm_revoke_certificate(uuid, text) from public, anon, authenticated;
grant execute on function public.qm_revoke_certificate(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 12. Bucket Storage peribadi. certificates: tiada polisi langsung untuk
--    anon/authenticated (akses melalui pelayan sahaja, URL bertandatangan).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('certificates', 'certificates', false, 5242880,
   array['application/pdf']),
  ('certificate-assets', 'certificate-assets', false, 5242880,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- certificate-assets: educator kelas boleh muat naik ke laluan
-- <class_id>/... sahaja. split_part diperiksa sebagai UUID dalam fungsi
-- pembantu supaya baris bukan UUID tidak melempar ralat cast.
create or replace function public.qm_certificate_asset_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_class uuid;
begin
  if p_name is null or position('/' in p_name) = 0 then
    return false;
  end if;
  begin
    v_class := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.qm_certificate_is_educator(v_class);
end;
$fn$;

-- Dipanggil dalam polisi Storage untuk authenticated sahaja; ia TIDAK awam.
revoke all on function public.qm_certificate_asset_allowed(text) from public, anon;
grant execute on function public.qm_certificate_asset_allowed(text) to authenticated;

drop policy if exists p_cert_assets_educator_read on storage.objects;
create policy p_cert_assets_educator_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'certificate-assets'
    and public.qm_certificate_asset_allowed(name)
  );

drop policy if exists p_cert_assets_educator_insert on storage.objects;
create policy p_cert_assets_educator_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificate-assets'
    and public.qm_certificate_asset_allowed(name)
  );

drop policy if exists p_cert_assets_educator_update on storage.objects;
create policy p_cert_assets_educator_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'certificate-assets'
    and public.qm_certificate_asset_allowed(name)
  )
  with check (
    bucket_id = 'certificate-assets'
    and public.qm_certificate_asset_allowed(name)
  );

-- Tiada polisi untuk bucket certificates: hanya service role (pelayan)
-- yang boleh menulis/membaca melaluinya.

-- ---------------------------------------------------------------------
-- 13. Penjaga pelan: latar dan logo tersuai hanya untuk pelan berkesan
--     pemilik kelas pro/institution. Free: background_path/logo_path
--     dipaksa NULL pada INSERT dan UPDATE templat.
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_template_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner uuid;
  v_plan  text;
begin
  select k.owner_id into v_owner
    from public.qm_classes k
   where k.id = new.class_id;
  select public.qm_effective_plan(v_owner) into v_plan;
  if v_plan not in ('pro', 'institution') then
    new.background_path := null;
    new.logo_path := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists tr_qm_cert_template_plan on public.qm_certificate_templates;
create trigger tr_qm_cert_template_plan
  before insert or update of background_path, logo_path
  on public.qm_certificate_templates
  for each row execute function public.qm_certificate_template_plan_guard();

notify pgrst, 'reload schema';
