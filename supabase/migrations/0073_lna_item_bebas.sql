-- 0073_lna_item_bebas.sql: item LNA bebas, tidak terikat kepada Outcome (KZ-038).
--
-- Sebelum ini setiap item LNA WAJIB merujuk satu Outcome kelas, jadi guru
-- tidak boleh menilai keperluan di luar silibus tanpa mencipta Outcome hantu
-- yang kemudian muncul dalam analitik penguasaan. Migrasi ini membenarkan
-- item LNA bebas: label sendiri, outcome_id null.
--
-- Perubahan skema:
--  - qm_lna_items: lajur baharu `id` (PK) dan `label`; outcome_id jadi
--    nullable; CHECK tepat satu daripada (outcome_id, label) mesti diisi;
--    kekal unique (lna_id, outcome_id) supaya satu Outcome sekali sahaja
--    dalam satu LNA (NULL dibenarkan berulang); indeks (lna_id, position).
--  - qm_lna_responses: lajur baharu `item_id` merujuk qm_lna_items(id) on
--    delete cascade; isi semula baris sedia ada daripada (round -> lna_id,
--    outcome_id); kemudian item_id not null dan PK baharu
--    (round_id, user_id, item_id); outcome_id jadi nullable (kekal diisi
--    bagi item Outcome).
--
-- Migrasi mesti berjaya pada pangkalan data dengan baris LNA sedia ada DAN
-- tanpa baris. Jika ada jawapan yang tidak dapat dipadankan dengan item,
-- migrasi GAGAL KUAT (RAISE) supaya tiada jawapan hilang secara senyap.
--
-- Dijalankan oleh CTO di VPS dalam SATU transaksi:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     < supabase/migrations/0073_lna_item_bebas.sql
--
-- Ujian berkanun: supabase/tests/KZ-038.sql (BEGIN ... ROLLBACK).

-- ============================================================
-- 1. qm_lna_items: lajur id (kunci baharu) dan label.
--    `add column if not exists` tidak mengisi baris sedia ada,
--    jadi UPDATE mengisi id null dahulu sebelum set not null.
-- ============================================================
alter table public.qm_lna_items add column if not exists id uuid;
update public.qm_lna_items set id = gen_random_uuid() where id is null;
alter table public.qm_lna_items alter column id set default gen_random_uuid();
alter table public.qm_lna_items alter column id set not null;

alter table public.qm_lna_items add column if not exists label text;

-- Item bebas tidak merujuk Outcome: outcome_id jadi nullable.
alter table public.qm_lna_items alter column outcome_id drop not null;

-- ============================================================
-- 2. CHECK pada qm_lna_items: label 1 hingga 200 aksara (jika ada)
--    dan tepat SATU daripada (outcome_id, label) mesti diisi.
-- ============================================================
do $blok$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qm_lna_items_label_panjang'
  ) then
    alter table public.qm_lna_items
      add constraint qm_lna_items_label_panjang
      check (label is null or char_length(btrim(label)) between 1 and 200);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'qm_lna_items_tepat_satu'
  ) then
    alter table public.qm_lna_items
      add constraint qm_lna_items_tepat_satu
      check ((outcome_id is null) <> (label is null));
  end if;
end $blok$;

-- ============================================================
-- 3. Kunci qm_lna_items: buang PK lama (lna_id, outcome_id),
--    PK baharu (id), kekal unique (lna_id, outcome_id) dan indeks
--    susunan (lna_id, position).
-- ============================================================
alter table public.qm_lna_items drop constraint if exists qm_lna_items_pkey;
do $blok$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.qm_lna_items'::regclass and contype = 'p'
  ) then
    alter table public.qm_lna_items add primary key (id);
  end if;
end $blok$;

do $blok$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qm_lna_items_lna_outcome_unik'
  ) then
    alter table public.qm_lna_items
      add constraint qm_lna_items_lna_outcome_unik unique (lna_id, outcome_id);
  end if;
end $blok$;

create index if not exists qm_lna_items_susun_idx
  on public.qm_lna_items (lna_id, position);

-- ============================================================
-- 4. qm_lna_responses: lajur item_id dan isi semula.
--    Padanan: round_id -> pusingan -> lna_id, bersama outcome_id
--    jawapan, menemukan SATU item (unique lna_id + outcome_id
--    menjamin tiada kembar). Jalankan sebelum PK baharu supaya
--    baris lama tidak terkunci daripada dikemas kini.
-- ============================================================
alter table public.qm_lna_responses add column if not exists item_id uuid;

update public.qm_lna_responses as r
set item_id = i.id
from public.qm_lna_items as i
where i.lna_id in (
    select p.lna_id from public.qm_lna_rounds as p where p.id = r.round_id
  )
  and i.outcome_id = r.outcome_id
  and r.item_id is null;

-- Gagal kuat jika ada jawapan yang tidak dapat dipadankan: lebih baik
-- migrasi berhenti daripada jawapan pelajar hilang secara senyap.
do $blok$
declare
  v_yatim int;
begin
  select count(*) into v_yatim
  from public.qm_lna_responses
  where item_id is null;
  if v_yatim > 0 then
    raise exception 'KZ-0073: % jawapan LNA tidak dapat dipadankan dengan item; migrasi dibatalkan', v_yatim;
  end if;
end $blok$;

alter table public.qm_lna_responses alter column item_id set not null;

do $blok$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qm_lna_responses_item_fk'
  ) then
    alter table public.qm_lna_responses
      add constraint qm_lna_responses_item_fk
      foreign key (item_id) references public.qm_lna_items(id) on delete cascade;
  end if;
end $blok$;

-- outcome_id jawapan jadi nullable: null bagi item bebas, kekal
-- diisi (dan kekal FK on delete cascade) bagi item Outcome.
alter table public.qm_lna_responses alter column outcome_id drop not null;

-- ============================================================
-- 5. Kunci qm_lna_responses: buang PK lama (round_id, user_id,
--    outcome_id), PK baharu (round_id, user_id, item_id).
-- ============================================================
alter table public.qm_lna_responses drop constraint if exists qm_lna_responses_pkey;
do $blok$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.qm_lna_responses'::regclass and contype = 'p'
  ) then
    alter table public.qm_lna_responses add primary key (round_id, user_id, item_id);
  end if;
end $blok$;

-- ============================================================
-- 6. RLS dan keizinan kekal ditutup (corak migrasi 0070; mengulang
--    enable dan revoke tidak berbahaya).
-- ============================================================
alter table public.qm_lna enable row level security;
alter table public.qm_lna_items enable row level security;
alter table public.qm_lna_rounds enable row level security;
alter table public.qm_lna_responses enable row level security;

revoke all on public.qm_lna from anon, authenticated;
revoke all on public.qm_lna_items from anon, authenticated;
revoke all on public.qm_lna_rounds from anon, authenticated;
revoke all on public.qm_lna_responses from anon, authenticated;

-- Pastikan PostgREST melihat skema baharu.
notify pgrst, 'reload schema';
