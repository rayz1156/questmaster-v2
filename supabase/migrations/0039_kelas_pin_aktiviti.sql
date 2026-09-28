-- 0039_kelas_pin_aktiviti.sql
--
-- V2-005: Kelas aktif dan tamat, carian dan pin.
--
-- Dua objek:
--  1. public.qm_class_pins: sematan (pin) kelas oleh seorang pengguna,
--     had 3 pin setiap pengguna. Baris sendiri sahaja melalui RLS.
--  2. public.qm_my_class_activity(): tarikh aktiviti terkini setiap kelas
--     yang pengguna miliki, pendidiknya (diterima), atau ahlinya, bersama
--     status pin. Dipakai untuk susunan "pin dahulu, kemudian aktiviti
--     terkini" di halaman kelas educator dan pemilih kelas peserta.
--
-- Nama lajur disahkan daripada migrasi sedia ada:
--  - qm_classes: id, owner_id, name, description, color, join_code,
--    is_archived (0003), ended_at (sql/migrations/2026_05_20_class_end.sql),
--    created_at (0003).
--  - qm_hunts: class_id (0003), created_at (db/schema.sql).
--  - qm_live_quizzes: class_id, created_at (migrations/0017_live_quiz.sql).
--  - qm_submissions: created_at, challenge_id (db/schema.sql); pautan ke
--    kelas melalui qm_challenges.hunt_id -> qm_hunts.class_id (tiada lajur
--    hunt_id pada qm_submissions).
--  - qm_class_educators: class_id, educator_id, accepted_at (0009).
--  - qm_class_members: class_id, user_id (0003).
--
-- Mengikut peraturan pasukan: fail migrasi tidak mengandungi COMMIT.
-- Setiap pernyataan di sini idempoten supaya tampalan berulang tidak
-- merosakkan apa-apa.

-- ============================================================
-- 1. Jadual pin
-- ============================================================

create table if not exists public.qm_class_pins (
  user_id    uuid not null references public.qm_profiles(id) on delete cascade,
  class_id   uuid not null references public.qm_classes(id) on delete cascade,
  pinned_at  timestamptz not null default now(),
  primary key (user_id, class_id)
);

alter table public.qm_class_pins enable row level security;

create index if not exists qm_class_pins_user_idx on public.qm_class_pins(user_id);
create index if not exists qm_class_pins_class_idx on public.qm_class_pins(class_id);

-- Kebenaran jadual: anon tiada apa-apa; authenticated baris sendiri sahaja.
revoke all on public.qm_class_pins from anon;
grant select, insert, delete on public.qm_class_pins to authenticated;
grant all on public.qm_class_pins to service_role;

-- ============================================================
-- 2. Pembantu kebenaran pin (security definer supaya polisi RLS tidak
--    merentas jadual bergantung pada polisi RLS jadual lain)
-- ============================================================

create or replace function public.qm_can_pin_class(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $f$
  select exists(
    select 1 from public.qm_classes c
     where c.id = p_class and c.owner_id = auth.uid()
  ) or exists(
    select 1 from public.qm_class_educators ce
     where ce.class_id = p_class
       and ce.educator_id = auth.uid()
       and ce.accepted_at is not null
  ) or exists(
    select 1 from public.qm_class_members m
     where m.class_id = p_class
       and m.user_id = auth.uid()
  );
$f$;
revoke execute on function public.qm_can_pin_class(uuid) from public, anon;
grant execute on function public.qm_can_pin_class(uuid) to authenticated;

-- ============================================================
-- 3. Polisi RLS qm_class_pins
--    SELECT/INSERT/DELETE baris sendiri sahaja; tiada UPDATE.
-- ============================================================

drop policy if exists p_pins_select on public.qm_class_pins;
create policy p_pins_select on public.qm_class_pins
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists p_pins_insert on public.qm_class_pins;
create policy p_pins_insert on public.qm_class_pins
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.qm_can_pin_class(class_id)
  );

drop policy if exists p_pins_update on public.qm_class_pins;
-- Sengaja tiada polisi UPDATE: pin tidak boleh dipindah atau diubah.

drop policy if exists p_pins_delete on public.qm_class_pins;
create policy p_pins_delete on public.qm_class_pins
  for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 4. Pencetus had 3 pin (BEFORE INSERT)
-- ============================================================

create or replace function public.qm_guard_pin_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
begin
  -- Pengunci transaksi per pengguna: elak perlumbaan dua INSERT serentak
  -- melepasi kiraan had 3 pin (kzsec V2-005 Penemuan #1).
  perform pg_advisory_xact_lock(hashtext('qm_class_pins:' || new.user_id::text));
  if (select count(*) from public.qm_class_pins where user_id = new.user_id) >= 3 then
    raise exception 'Pin limit reached (3)';
  end if;
  return new;
end;
$f$;

drop trigger if exists trg_qm_pin_limit on public.qm_class_pins;
create trigger trg_qm_pin_limit
  before insert on public.qm_class_pins
  for each row execute function public.qm_guard_pin_limit();

-- ============================================================
-- 5. qm_my_class_activity(): aktiviti terkini setiap kelas pengguna
-- ============================================================
-- SECURITY DEFINER kerana baris keahlian tidak semuanya boleh dibaca
-- pemanggil melalui RLS; fungsi ini tidak mendedahkan kelas orang lain
-- kerana penapis menggunakan auth.uid() secara langsung.

create or replace function public.qm_my_class_activity()
returns table (class_id uuid, last_activity_at timestamptz, pinned boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $f$
  with kelas_saya as (
    select c.id as kelas_id, c.created_at as dicipta
      from public.qm_classes c
     where c.owner_id = auth.uid()
        or exists(
             select 1 from public.qm_class_educators ce
              where ce.class_id = c.id
                and ce.educator_id = auth.uid()
                and ce.accepted_at is not null
           )
        or exists(
             select 1 from public.qm_class_members m
              where m.class_id = c.id
                and m.user_id = auth.uid()
           )
  )
  select
    k.kelas_id,
    greatest(
      k.dicipta,
      (select max(h.created_at) from public.qm_hunts h
        where h.class_id = k.kelas_id),
      (select max(q.created_at) from public.qm_live_quizzes q
        where q.class_id = k.kelas_id),
      (select max(s.created_at)
         from public.qm_submissions s
         join public.qm_challenges ch on ch.id = s.challenge_id
         join public.qm_hunts h on h.id = ch.hunt_id
        where h.class_id = k.kelas_id)
    ) as aktiviti,
    exists(
      select 1 from public.qm_class_pins p
       where p.user_id = auth.uid()
         and p.class_id = k.kelas_id
    ) as dipin
  from kelas_saya k;
$f$;

revoke execute on function public.qm_my_class_activity() from public, anon;
grant execute on function public.qm_my_class_activity() to authenticated;

notify pgrst, 'reload schema';