-- 0034_penilaian_rakan.sql
-- Penilaian rakan sebaya, Fasa 1 (laluan formatif).
--
-- Rujukan: docs/SPEC-penilaian-rakan.md. Tiga jadual, fungsi pengiraan,
-- fungsi status pelajar, dan RLS yang menyimpan kerahsiaan penilaian di
-- peringkat pangkalan data (pelajar tidak pernah nampak baris keputusan
-- dirinya, kerana RLS menapis baris bukan lajur).
--
-- Peringatan: fail ini TIDAK dibalut transaksi secara eksplisit. Jangan
-- tambah penutup transaksi di sini; CTO menguji fail ini dengan
-- BEGIN ... ROLLBACK pada pelayan.

-- ============================================================
-- 1. Jadual pusingan penilaian (unit penilaian ialah PUSINGAN, milik KELAS)
-- ============================================================

create table if not exists public.qm_peer_rounds (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.qm_classes(id) on delete cascade,
  name         text not null,
  kind         text not null default 'formatif'
               check (kind in ('formatif','sumatif')),
  week         int check (week between 1 and 52),
  opens_at     timestamptz not null,
  closes_at    timestamptz not null,
  g_source     text check (g_source in ('board','manual')),
  board_id     uuid references public.qm_boards(id) on delete set null,
  computed_at  timestamptz,
  created_by   uuid not null references public.qm_profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint qm_peer_rounds_window_chk check (closes_at > opens_at),
  -- Fasa 1 hanya pusingan formatif; sumber markah G milik Fasa 2.
  constraint qm_peer_rounds_kind_g_chk
    check (kind = 'sumatif' or (g_source is null and board_id is null)),
  constraint qm_peer_rounds_sumatif_g_chk check (kind = 'formatif' or g_source is not null),
  constraint qm_peer_rounds_board_chk check (g_source is distinct from 'board' or board_id is not null)
);

create index if not exists qm_peer_rounds_class_idx on public.qm_peer_rounds(class_id);

-- ============================================================
-- 2. Jadual penilaian sulit antara rakan
-- ============================================================

create table if not exists public.qm_peer_ratings (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.qm_peer_rounds(id) on delete cascade,
  team_id       uuid not null references public.qm_teams(id) on delete cascade,
  rater_id      uuid not null references public.qm_profiles(id) on delete cascade,
  ratee_id      uuid not null references public.qm_profiles(id) on delete cascade,
  k1            smallint not null check (k1 between 0 and 2),
  k2            smallint not null check (k2 between 0 and 2),
  k3            smallint not null check (k3 between 0 and 2),
  k4            smallint not null check (k4 between 0 and 2),
  k5            smallint not null check (k5 between 0 and 2),
  justification text,
  submitted_at  timestamptz not null default now(),
  constraint qm_peer_ratings_unique_chk unique (round_id, rater_id, ratee_id),
  -- Tiada penilaian kendiri, dilarang di peringkat pangkalan data.
  constraint qm_peer_ratings_no_self_chk check (rater_id <> ratee_id),
  -- Justifikasi wajib apabila mana mana kriteria bernilai 0 atau 1;
  -- minimum 10 aksara selepas potong ruang. Kosong dibenarkan hanya
  -- apabila kelima lima kriteria bernilai 2.
  constraint qm_peer_ratings_justify_chk check (
    (k1 = 2 and k2 = 2 and k3 = 2 and k4 = 2 and k5 = 2)
    or (justification is not null and length(btrim(justification)) >= 10)
  )
);

create index if not exists qm_peer_ratings_round_idx  on public.qm_peer_ratings(round_id);
create index if not exists qm_peer_ratings_rater_idx  on public.qm_peer_ratings(rater_id);
create index if not exists qm_peer_ratings_ratee_idx  on public.qm_peer_ratings(ratee_id);

-- ============================================================
-- 3. Jadual keputusan (pelajar TIADA dasar SELECT; hanya pendidik nampak)
-- ============================================================

create table if not exists public.qm_peer_results (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.qm_peer_rounds(id) on delete cascade,
  team_id       uuid not null references public.qm_teams(id) on delete cascade,
  user_id       uuid not null references public.qm_profiles(id) on delete cascade,
  t_total       int not null,
  r_count       int not null,
  valid         boolean not null,
  p             numeric(8,4),
  pbar          numeric(8,4),
  f             numeric(8,4),
  f_mod         numeric(8,4) not null,
  flag          text check (flag in ('MERAH','KUNING','HIJAU')),
  needs_review  boolean not null default false,
  team_at_risk  boolean not null default false,
  -- Lajur Fasa 2, kekal NULL dalam Fasa 1.
  g             numeric(8,2),
  m             numeric(8,1),
  moderated_by  uuid references public.qm_profiles(id) on delete set null,
  finalised_at  timestamptz,
  computed_at   timestamptz not null default now(),
  constraint qm_peer_results_unique_chk unique (round_id, user_id)
);

create index if not exists qm_peer_results_round_idx on public.qm_peer_results(round_id);

-- ============================================================
-- 4. Pencetus: had enam pusingan setiap kelas
-- ============================================================

create or replace function public.qm_peer_guard_max_rounds()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.qm_peer_rounds
   where class_id = new.class_id;
  if v_count >= 6 then
    raise exception 'QM_PEER_MAX_ROUNDS: A class can have at most six evaluation rounds.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;

drop trigger if exists qm_peer_max_rounds_trg on public.qm_peer_rounds;
create trigger qm_peer_max_rounds_trg
  before insert on public.qm_peer_rounds
  for each row execute function public.qm_peer_guard_max_rounds();

-- Sekatan pelan: qm_peer_rounds membawa class_id, jadi penjaga ciri quest
-- sedia ada (qm_guard_quest_feature, migrasi 0030) boleh diguna terus.
-- Ia memanggil qm_plan_owner_of(to_jsonb(NEW)) yang membetulkan pemilik
-- daripada class_id, bukan daripada data pelanggan.
drop trigger if exists qm_guard_plan_peer_rounds on public.qm_peer_rounds;
create trigger qm_guard_plan_peer_rounds
  before insert on public.qm_peer_rounds
  for each row execute function public.qm_guard_quest_feature();

-- updated_at dikemas kini secara automatik.
create or replace function public.qm_peer_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists qm_peer_rounds_touch_trg on public.qm_peer_rounds;
create trigger qm_peer_rounds_touch_trg
  before update on public.qm_peer_rounds
  for each row execute function public.qm_peer_touch_updated_at();

-- ============================================================
-- 5. Pencetus pengesahan penilaian
-- ============================================================

create or replace function public.qm_peer_guard_rating()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_class  uuid;
  v_opens  timestamptz;
  v_closes timestamptz;
  v_team_class uuid;
  v_team_hunt  uuid;
begin
  -- Penilaian kendiri: ditolak dengan kod yang boleh dibaca (CHECK
  -- constraint qm_peer_ratings_no_self_chk kekal sebagai penghalang kedua).
  if new.rater_id = new.ratee_id then
    raise exception 'QM_PEER_SELF: You cannot evaluate yourself.'
      using errcode = 'P0001';
  end if;

  select class_id, opens_at, closes_at
    into v_class, v_opens, v_closes
    from public.qm_peer_rounds
   where id = new.round_id;
  if v_class is null then
    raise exception 'QM_PEER_CLOSED: This evaluation round is closed.'
      using errcode = 'P0001';
  end if;

  -- Kumpulan mesti kumpulan peringkat kelas (hunt_id is null) bagi kelas
  -- pusingan itu; kumpulan peringkat hunt tidak digunakan.
  select class_id, hunt_id into v_team_class, v_team_hunt
    from public.qm_teams
   where id = new.team_id;
  if v_team_class is null or v_team_class <> v_class or v_team_hunt is not null then
    raise exception 'QM_PEER_NOT_MEMBER: You are not a member of this group.'
      using errcode = 'P0001';
  end if;

  -- Kedua dua penilai dan yang dinilai mesti ahli kumpulan itu.
  if not exists (
       select 1 from public.qm_team_members tm
        where tm.team_id = new.team_id and tm.user_id = new.rater_id)
     or not exists (
       select 1 from public.qm_team_members tm
        where tm.team_id = new.team_id and tm.user_id = new.ratee_id) then
    raise exception 'QM_PEER_NOT_MEMBER: You are not a member of this group.'
      using errcode = 'P0001';
  end if;

  -- Tetingkap masa: borang hanya terbuka antara opens_at dan closes_at.
  -- Selepas closes_at rekod menjadi tidak boleh ubah (INSERT atau UPDATE).
  if now() < v_opens or now() > v_closes then
    raise exception 'QM_PEER_CLOSED: This evaluation round is closed.'
      using errcode = 'P0001';
  end if;

  -- Justifikasi wajib bila ada kriteria 0 atau 1 (CHECK constraint kekal
  -- sebagai penghalang kedua; pencetus memberi mesej yang boleh dibaca).
  if (new.k1 < 2 or new.k2 < 2 or new.k3 < 2 or new.k4 < 2 or new.k5 < 2)
     and (new.justification is null or length(btrim(new.justification)) < 10) then
    raise exception 'QM_PEER_JUSTIFY: Please explain any score of 0 or 1.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$fn$;

drop trigger if exists qm_peer_rating_guard_trg on public.qm_peer_ratings;
create trigger qm_peer_rating_guard_trg
  before insert or update on public.qm_peer_ratings
  for each row execute function public.qm_peer_guard_rating();

-- ============================================================
-- 6. Fungsi pengiraan: T, r, P, Pbar, F, Fmod, bendera, KUMPULAN BERISIKO
-- ============================================================

create or replace function public.qm_peer_compute(p_round uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller   uuid;
  v_class    uuid;
  v_owner    uuid;
  v_is_admin boolean;
  v_written  int := 0;
  v_team     uuid;
  v_member   record;
  v_uids     uuid[];
  v_ts       int[];
  v_rs       int[];
  v_ps       numeric[];
  v_i        int;
  v_n        int;
  v_valid    boolean;
  v_p        numeric;
  v_pbar     numeric;
  v_f        numeric;
  v_fmod     numeric;
  v_flag     text;
  v_review   boolean;
  v_psum     numeric;
  v_pcount   int;
  v_merah    int;
  v_risk     boolean;
  v_fmods    numeric[];
  v_fs       numeric[];
  v_pbars    numeric[];
  v_flags    text[];
  v_reviews  boolean[];
begin
  v_caller := auth.uid();
  if v_caller is null then
    -- JANGAN guna current_user di sini: dalam SECURITY DEFINER ia ialah
    -- pemilik fungsi, bukan pemanggil, jadi penjaga itu sentiasa lulus.
    raise exception 'QM_FORBIDDEN: Only an educator of this class can compute peer review results.'
      using errcode = 'P0001';
  end if;

  select class_id into v_class from public.qm_peer_rounds where id = p_round;
  if v_class is null then
    raise exception 'QM_NOT_FOUND: This evaluation round does not exist.'
      using errcode = 'P0001';
  end if;

  v_is_admin := public.is_admin();
  if not v_is_admin
     and not public.qm_is_class_owner(v_class)
     and not public.qm_is_class_educator(v_class) then
    raise exception 'QM_FORBIDDEN: Only an educator of this class can compute peer review results.'
      using errcode = 'P0001';
  end if;

  -- Sekatan pelan: pemilik kelas mesti bukan pelan percuma (contoh
  -- corak 0033; penjaga pencetus tidak berkuasa dalam SECURITY DEFINER).
  if not v_is_admin then
    select owner_id into v_owner from public.qm_classes where id = v_class;
    if not public.qm_quest_features_allowed(v_owner) then
      raise exception 'QM_PLAN_FREE: This feature is not part of the free plan. The free plan covers quizzes only.'
        using errcode = 'P0001';
    end if;
  end if;

  -- Kira semula dari awal: padam semua keputusan lama pusingan ini.
  delete from public.qm_peer_results where round_id = p_round;

  -- Kumpulan peringkat kelas sahaja (hunt_id is null), sama dengan kumpulan
  -- daripada import CSV.
  for v_team in
    select id from public.qm_teams
     where class_id = v_class and hunt_id is null
     order by name
  loop
    v_uids := '{}'; v_ts := '{}'; v_rs := '{}'; v_ps := '{}';

    -- LALUAN 1: T dan r bagi setiap ahli. r ialah bilangan rekod yang
    -- benar benar diterima (count atas baris sebenar), BUKAN n - 1.
    for v_member in
      select tm.user_id,
             coalesce(sum(r.k1 + r.k2 + r.k3 + r.k4 + r.k5), 0) as t_total,
             count(r.id) as r_count
        from public.qm_team_members tm
        left join public.qm_peer_ratings r
               on r.team_id = tm.team_id
              and r.ratee_id = tm.user_id
              and r.round_id = p_round
       where tm.team_id = v_team
       group by tm.user_id
    loop
      -- Ahli yang berada dalam dua kumpulan kelas yang sama (data lama)
      -- hanya diproses sekali, sebab kekangan unique (round_id, user_id).
      if v_member.user_id = any(v_uids) then continue; end if;
      v_uids := array_append(v_uids, v_member.user_id);
      v_ts   := array_append(v_ts, v_member.t_total::int);
      v_rs   := array_append(v_rs, v_member.r_count::int);
      if v_member.r_count >= 2 then
        -- Ketepatan penuh; jangan bundar P sebelum membahagi dengan Pbar.
        v_ps := array_append(v_ps, v_member.t_total::numeric / v_member.r_count);
      else
        v_ps := array_append(v_ps, null::numeric);
      end if;
    end loop;

    v_n := coalesce(array_length(v_uids, 1), 0);

    -- Pbar = purata P bagi ahli yang SAH sahaja; ahli tidak sah dikecuali
    -- daripada pengangka dan daripada pembahagi.
    v_psum := null; v_pcount := 0;
    for v_i in 1..v_n loop
      if v_ps[v_i] is not null then
        v_psum  := coalesce(v_psum, 0) + v_ps[v_i];
        v_pcount := v_pcount + 1;
      end if;
    end loop;
    if v_pcount > 0 then v_pbar := v_psum / v_pcount; else v_pbar := null; end if;

    -- LALUAN 2: F, Fmod, bendera, SEMAK bagi setiap ahli.
    v_merah := 0;
    v_fmods := '{}'; v_fs := '{}'; v_pbars := '{}';
    v_flags := '{}'; v_reviews := '{}';
    for v_i in 1..v_n loop
      v_valid := v_ps[v_i] is not null;
      v_p := v_ps[v_i];
      v_f := null; v_flag := null; v_review := false;

      if not v_valid then
        -- Ahli tidak sah: P dan F tidak wujud, tiada bendera.
        v_fmod := 1.0000;
        v_review := true;
        v_fs := array_append(v_fs, null::numeric);
        v_pbars := array_append(v_pbars, null::numeric);
      elsif coalesce(v_pbar, 0) = 0 then
        -- Pbar sifar: F tidak boleh dibahagi, tiada bendera.
        v_fmod := 1.0000;
        v_review := true;
        v_fs := array_append(v_fs, null::numeric);
        v_pbars := array_append(v_pbars, v_pbar);
      else
        v_f := v_p / v_pbar;
        if v_f > 1.0 then
          v_fmod := 1.0000;
        elsif v_f < 0.70 then
          v_fmod := 0.7000;
          v_review := true;
        else
          v_fmod := v_f;
        end if;
        -- Bendera warna: MERAH disemak dahulu, bersarang, supaya KUNING
        -- tidak menimpanya. SEMAK (needs_review) medan berasingan.
        if v_p <= 6.0 or v_f < 0.80 then
          v_flag := 'MERAH';
        elsif v_p <= 7.5 or v_f < 0.90 then
          v_flag := 'KUNING';
        else
          v_flag := 'HIJAU';
        end if;
        v_fs := array_append(v_fs, v_f);
        v_pbars := array_append(v_pbars, v_pbar);
      end if;

      if v_flag = 'MERAH' then v_merah := v_merah + 1; end if;

      v_fmods := array_append(v_fmods, v_fmod);
      v_flags := array_append(v_flags, v_flag);
      v_reviews := array_append(v_reviews, v_review);
    end loop;

    -- KUMPULAN BERISIKO: dua atau lebih ahli MERAH dalam pusingan sama
    -- menanda SEMUA ahli kumpulan itu, termasuk yang HIJAU.
    v_risk := v_merah >= 2;

    for v_i in 1..v_n loop
      -- Penghalaan dedup: langkau ahli yang sudah ada baris pusingan ini.
      if exists (
           select 1 from public.qm_peer_results
            where round_id = p_round and user_id = v_uids[v_i]) then
        continue;
      end if;
      insert into public.qm_peer_results
        (round_id, team_id, user_id, t_total, r_count, valid,
         p, pbar, f, f_mod, flag, needs_review, team_at_risk, computed_at)
      values
        (p_round, v_team, v_uids[v_i], v_ts[v_i], v_rs[v_i], v_ps[v_i] is not null,
         v_ps[v_i], v_pbars[v_i], v_fs[v_i], v_fmods[v_i], v_flags[v_i],
         v_reviews[v_i], v_risk, now());
      v_written := v_written + 1;
    end loop;

    -- Kosongkan tatasusunan selari untuk kumpulan seterusnya.
    v_fmods := '{}'; v_flags := '{}'; v_reviews := '{}';
    v_pbars := '{}'; v_fs := '{}';
  end loop;

  update public.qm_peer_rounds
     set computed_at = now()
   where id = p_round;

  return v_written;
end;
$fn$;

revoke all on function public.qm_peer_compute(uuid) from public;
grant execute on function public.qm_peer_compute(uuid) to authenticated, service_role;

-- ============================================================
-- 7. Fungsi status pelajar (satu satunya saluran maklumat kepada pelajar)
-- ============================================================

create or replace function public.qm_peer_my_status(p_round uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller uuid;
  v_class  uuid;
  v_team   uuid;
  v_total  int := 0;
  v_done   int := 0;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'QM_FORBIDDEN: You must be signed in.'
      using errcode = 'P0001';
  end if;

  select class_id into v_class from public.qm_peer_rounds where id = p_round;
  if v_class is null then
    raise exception 'QM_NOT_FOUND: This evaluation round does not exist.'
      using errcode = 'P0001';
  end if;

  -- Pelajar kelas itu (atau pendidik kelas) sahaja.
  if not exists (
       select 1 from public.qm_class_members cm
        where cm.class_id = v_class and cm.user_id = v_caller)
     and not public.qm_is_class_educator(v_class) then
    raise exception 'QM_FORBIDDEN: You are not a member of this class.'
      using errcode = 'P0001';
  end if;

  -- Kumpulan peringkat kelas sahaja.
  select tm.team_id into v_team
    from public.qm_team_members tm
    join public.qm_teams t on t.id = tm.team_id
   where tm.user_id = v_caller
     and t.class_id = v_class
     and t.hunt_id is null
   limit 1;

  if v_team is null then
    return jsonb_build_object(
      'in_team', false, 'submitted', false,
      'total_to_evaluate', 0, 'submitted_count', 0);
  end if;

  -- Diri sendiri tidak dikira sebagai rakan yang perlu dinilai.
  select count(*) into v_total
    from public.qm_team_members tm
   where tm.team_id = v_team and tm.user_id <> v_caller;

  select count(*) into v_done
    from public.qm_peer_ratings r
   where r.round_id = p_round and r.team_id = v_team and r.rater_id = v_caller;

  return jsonb_build_object(
    'in_team', true,
    'team_id', v_team,
    'submitted', v_total > 0 and v_done >= v_total,
    'total_to_evaluate', v_total,
    'submitted_count', v_done);
end;
$fn$;

revoke all on function public.qm_peer_my_status(uuid) from public;
grant execute on function public.qm_peer_my_status(uuid) to authenticated, service_role;

-- ============================================================
-- 8. RLS: kerahsiaan ialah masalah pangkalan data, bukan masalah UI
-- ============================================================

alter table public.qm_peer_rounds  enable row level security;
alter table public.qm_peer_ratings enable row level security;
alter table public.qm_peer_results enable row level security;

-- qm_peer_rounds: pusingan tidak membawa data sulit; ahli dan pendidik
-- kelas boleh membaca (pelajar perlu tahu bila borang dibuka).
drop policy if exists p_pr_read on public.qm_peer_rounds;
create policy p_pr_read on public.qm_peer_rounds for select
  using (
    public.qm_is_class_educator(class_id)
    or exists (
      select 1 from public.qm_class_members cm
       where cm.class_id = qm_peer_rounds.class_id
         and cm.user_id = auth.uid()
    )
  );

drop policy if exists p_pr_educator_write on public.qm_peer_rounds;
create policy p_pr_educator_write on public.qm_peer_rounds for all
  using (public.qm_is_class_educator(class_id))
  with check (public.qm_is_class_educator(class_id));

drop policy if exists p_pr_admin on public.qm_peer_rounds;
create policy p_pr_admin on public.qm_peer_rounds for all
  using (public.is_admin()) with check (public.is_admin());

-- qm_peer_ratings: pelajar hanya nampak baris yang DIA sendiri tulis.
-- TIADA dasar yang membenarkan ratee_id = auth.uid(); itu tepat kebocoran
-- yang dilarang.
drop policy if exists p_prt_rater_read on public.qm_peer_ratings;
create policy p_prt_rater_read on public.qm_peer_ratings for select
  using (
    rater_id = auth.uid()
    or exists (
      select 1 from public.qm_peer_rounds r
       where r.id = qm_peer_ratings.round_id
         and public.qm_is_class_educator(r.class_id)
    )
  );

drop policy if exists p_prt_rater_insert on public.qm_peer_ratings;
create policy p_prt_rater_insert on public.qm_peer_ratings for insert
  with check (rater_id = auth.uid());

drop policy if exists p_prt_rater_update on public.qm_peer_ratings;
create policy p_prt_rater_update on public.qm_peer_ratings for update
  using (rater_id = auth.uid())
  with check (rater_id = auth.uid());

-- DELETE: tiada dasar untuk pelajar; rekod tidak boleh ubah selepas ditutup.

-- qm_peer_results: pendidik kelas SAHAJA. Pelajar TIADA dasar SELECT
-- langsung: pbar bersama f mendedahkan purata kumpulan. Pelajar mendapat
-- maklumatnya melalui qm_peer_my_status sahaja. INSERT/UPDATE/DELETE tiada
-- dasar; hanya fungsi pengiraan (SECURITY DEFINER) menulis.
drop policy if exists p_prr_educator_read on public.qm_peer_results;
create policy p_prr_educator_read on public.qm_peer_results for select
  using (
    exists (
      select 1 from public.qm_peer_rounds r
       where r.id = qm_peer_results.round_id
         and public.qm_is_class_educator(r.class_id)
    )
  );

-- ============================================================
-- 9. Geran eksplisit (RLS yang menapis baris, geran yang mengehadkan arah)
-- ============================================================

revoke all on public.qm_peer_rounds  from anon;
revoke all on public.qm_peer_ratings from anon;
revoke all on public.qm_peer_results from anon;

grant select, insert, update, delete on public.qm_peer_rounds  to authenticated;
grant select, insert, update            on public.qm_peer_ratings to authenticated;
grant select                            on public.qm_peer_results to authenticated;

notify pgrst, 'reload schema';