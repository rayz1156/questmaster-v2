-- KZ-A (24 Nov 2026): pendidik menukar nama sijil peserta melalui connector.
--
-- Masalah: nama sijil diambil daripada nama paparan peserta (KZ-007) dan
-- pendidik tidak boleh menukarnya, jadi "Bro Taufik" tercetak pada sijil.
--
-- Perubahan:
--   1. qm_profiles: sumber nama sijil (participant/educator) dan notis
--      kepada peserta bila pendidik menukar nama profilnya.
--   2. qm_class_certificate_names: nama sijil khusus satu kelas (scope
--      "certificate"), mengatasi nama profil untuk kelas itu sahaja.
--   3. qm_certificate_name_log: log audit nama lama dan baharu.
--   4. qm_set_member_certificate_name: satu-satunya laluan tulis, menyemak
--      pendidik kelas, mengemas kini name_snapshot sijil aktif kelas itu
--      dan memulangkan id sijil untuk dijana semula oleh laluan app.
--   5. qm_certificate_eligibility dan qm_issue_certificates: nama kelas
--      didahulukan. Salinan 0055 dan 0057 dengan perubahan HANYA pada
--      pemilihan nama dan name_confirmed. Tandatangan fungsi tidak berubah.
--
-- Mesej ralat dalam English kerana ia sampai ke skrin pengguna.
-- Idempoten: boleh dijalankan semula.

-- ---------------------------------------------------------------------
-- 1. Lajur profil
-- ---------------------------------------------------------------------
alter table public.qm_profiles
  add column if not exists certificate_name_source text;
alter table public.qm_profiles
  add column if not exists certificate_name_notice_at timestamptz;
alter table public.qm_profiles
  add column if not exists certificate_name_notice_seen_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qm_profiles_cert_name_source_chk'
  ) then
    alter table public.qm_profiles
      add constraint qm_profiles_cert_name_source_chk
      check (certificate_name_source is null or certificate_name_source in ('participant', 'educator'));
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2. Nama sijil per kelas
-- ---------------------------------------------------------------------
create table if not exists public.qm_class_certificate_names (
  class_id         uuid not null references public.qm_classes(id) on delete cascade,
  user_id          uuid not null references public.qm_profiles(id) on delete cascade,
  certificate_name text not null check (length(btrim(certificate_name)) between 2 and 120),
  set_by           uuid references public.qm_profiles(id) on delete set null,
  set_at           timestamptz not null default now(),
  primary key (class_id, user_id)
);
alter table public.qm_class_certificate_names enable row level security;

drop policy if exists p_class_cert_names_read on public.qm_class_certificate_names;
create policy p_class_cert_names_read on public.qm_class_certificate_names
  for select to authenticated
  using (public.qm_certificate_is_educator(class_id) or user_id = auth.uid());
-- Tiada polisi tulis: tulisan hanya melalui qm_set_member_certificate_name.
revoke all on public.qm_class_certificate_names from anon, authenticated;
grant select on public.qm_class_certificate_names to authenticated;

-- ---------------------------------------------------------------------
-- 3. Log audit nama
-- ---------------------------------------------------------------------
create table if not exists public.qm_certificate_name_log (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid references public.qm_classes(id) on delete set null,
  user_id     uuid references public.qm_profiles(id) on delete cascade,
  scope       text not null check (scope in ('certificate', 'profile')),
  old_name    text,
  new_name    text not null,
  changed_by  uuid references public.qm_profiles(id) on delete set null,
  source      text not null default 'educator',
  changed_at  timestamptz not null default now()
);
alter table public.qm_certificate_name_log enable row level security;
create index if not exists qm_certificate_name_log_class_idx
  on public.qm_certificate_name_log (class_id, changed_at desc);

drop policy if exists p_cert_name_log_read on public.qm_certificate_name_log;
create policy p_cert_name_log_read on public.qm_certificate_name_log
  for select to authenticated
  using (
    (class_id is not null and public.qm_certificate_is_educator(class_id))
    or public.qm_is_admin()
  );
revoke all on public.qm_certificate_name_log from anon, authenticated;
grant select on public.qm_certificate_name_log to authenticated;

-- ---------------------------------------------------------------------
-- 4. Tukar nama sijil
-- ---------------------------------------------------------------------
create or replace function public.qm_set_member_certificate_name(
  p_class uuid,
  p_user  uuid,
  p_name  text,
  p_scope text default 'certificate'
)
returns table (old_name text, new_name text, certificate_ids uuid[])
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_name text;
  v_old  text;
  v_ids  uuid[];
begin
  if not public.qm_certificate_is_educator(p_class) then
    raise exception 'Only the class educator can change certificate names.';
  end if;
  if p_scope is null or p_scope not in ('certificate', 'profile') then
    raise exception 'scope must be certificate or profile.';
  end if;
  -- Ruang berganda dipadatkan; nama mesti 2 hingga 120 aksara.
  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Name must be between 2 and 120 characters.';
  end if;
  if not exists (
    select 1 from public.qm_class_members m
     where m.class_id = p_class and m.user_id = p_user
  ) then
    raise exception 'Participant is not a member of this class.';
  end if;
  -- Semakan bebas KZ-A: nama profil hanya untuk akaun peserta. Pendidik atau
  -- pentadbir yang menyertai kelas orang lain tidak boleh ditukar nama
  -- globalnya (nama itu juga dicetak sebagai pengeluar sijil mereka).
  if p_scope = 'profile' and not exists (
    select 1 from public.qm_profiles p where p.id = p_user and p.role = 'participant'
  ) then
    raise exception 'Profile names can only be changed for participant accounts. Use scope certificate.';
  end if;

  -- Nama lama berkesan untuk kelas ini (susunan sama dengan pengeluaran).
  select coalesce(n.certificate_name, p.certificate_name, nullif(btrim(p.display_name), ''))
    into v_old
    from public.qm_profiles p
    left join public.qm_class_certificate_names n
           on n.class_id = p_class and n.user_id = p.id
   where p.id = p_user;

  if p_scope = 'certificate' then
    insert into public.qm_class_certificate_names (class_id, user_id, certificate_name, set_by, set_at)
    values (p_class, p_user, v_name, auth.uid(), now())
    on conflict (class_id, user_id) do update
      set certificate_name = excluded.certificate_name,
          set_by = excluded.set_by,
          set_at = excluded.set_at;
  else
    update public.qm_profiles
       set certificate_name = v_name,
           display_name = v_name,
           certificate_name_confirmed_at = now(),
           certificate_name_source = 'educator',
           certificate_name_notice_at = now(),
           certificate_name_notice_seen_at = null
     where id = p_user;
    -- Nama kelas lama tidak lagi relevan bila profil dikemas kini.
    delete from public.qm_class_certificate_names
     where class_id = p_class and user_id = p_user;
  end if;

  -- Sijil aktif kelas ini mengikut nama baharu. PDF dijana semula oleh app.
  with u as (
    update public.qm_certificates c
       set name_snapshot = v_name
     where c.class_id = p_class
       and c.participant_id = p_user
       and c.revoked_at is null
       and c.name_snapshot is distinct from v_name
    returning c.id
  )
  select coalesce(array_agg(u.id), array[]::uuid[]) into v_ids from u;

  insert into public.qm_certificate_name_log (class_id, user_id, scope, old_name, new_name, changed_by)
  values (p_class, p_user, p_scope, v_old, v_name, auth.uid());

  old_name := v_old;
  new_name := v_name;
  certificate_ids := v_ids;
  return next;
end;
$fn$;

revoke all on function public.qm_set_member_certificate_name(uuid, uuid, text, text) from public, anon;
grant execute on function public.qm_set_member_certificate_name(uuid, uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5a. Kelayakan: salinan 0055 dengan nama kelas didahulukan.
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
  if not public.qm_certificate_is_educator(v_class_id) then
    raise exception 'Only the class educator can view certificate eligibility.';
  end if;

  for r in
    select m.user_id,
           p.display_name,
           -- KZ-A: nama kelas, kemudian nama sijil profil, kemudian nama paparan.
           coalesce(n.certificate_name, p.certificate_name, nullif(btrim(p.display_name), '')) as nama,
           (n.certificate_name is not null or p.certificate_name is not null) as disahkan
      from public.qm_class_members m
      join public.qm_profiles p on p.id = m.user_id
      left join public.qm_class_certificate_names n
             on n.class_id = m.class_id and n.user_id = m.user_id
     where m.class_id = v_class_id
  loop
    v_elig := public.qm_certificate_participant_eligible(p_template, r.user_id);

    return query
    select
      r.user_id,
      r.display_name,
      r.nama,
      r.disahkan,
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

revoke all on function public.qm_certificate_eligibility(uuid) from public, anon;
grant execute on function public.qm_certificate_eligibility(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5b. Pengeluaran: salinan 0057 dengan nama kelas didahulukan.
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
  v_prog := coalesce(nullif(btrim(v_fields->>'course'), ''), v_class_nm, v_title);

  issued_count := 0;
  issued_ids := array[]::uuid[];

  for r in
    select m.user_id,
           -- KZ-A: nama kelas didahulukan.
           coalesce(n.certificate_name, p.certificate_name, nullif(btrim(p.display_name), '')) as nama
      from public.qm_class_members m
      join public.qm_profiles p on p.id = m.user_id
      left join public.qm_class_certificate_names n
             on n.class_id = m.class_id and n.user_id = m.user_id
     where m.class_id = v_class_id
       and (p_participants is null or m.user_id = any (p_participants))
  loop
    if r.nama is null then
      continue;
    end if;
    if not public.qm_certificate_participant_eligible(p_template, r.user_id) then
      continue;
    end if;
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
