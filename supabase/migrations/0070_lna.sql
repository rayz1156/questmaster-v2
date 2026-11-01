-- 0070_lna.sql: Learning Needs Analysis (LNA) dalam kelas (KZ-035).
--
-- Empat jadual baharu `qm_lna_*` untuk ciri LNA: guru menyediakan senarai
-- item daripada Outcomes kelas, membuka pusingan PRA dan PASCA, pelajar
-- menjawab di telefon (kepentingan dan tahap semasa, skala 1-5), dan
-- pelayan mengira laporan keutamaan (Borich MWDS, RDM RDS, kuadran IPA)
-- dengan membandingkan keyakinan pelajar lawan penguasaan sebenar yang
-- sudah dikira oleh qm_mastery_summary. Tiada jadual sedia ada diubah.
--
-- Semua akses pengguna melalui laluan API Next.js yang menyemak kebenaran
-- terlebih dahulu (pemilik kelas / ko-pendidik diterima / peserta kelas)
-- dan kemudian bekerja dengan service role; RLS diaktifkan tanpa polisi
-- supaya PostgREST (anon/authenticated) tidak melihat apa-apa (corak
-- migrasi 0068).
--
-- Dijalankan oleh CTO di VPS:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     < supabase/migrations/0070_lna.sql
--
-- Ujian berkanun: supabase/tests/KZ-035.sql (BEGIN ... ROLLBACK).

-- ============================================================
-- 1. qm_lna: satu analisis keperluan pembelajaran dalam satu kelas.
--    Item (3 hingga 15) dikuatkuasakan di laluan API, bukan CHECK,
--    kerana bilangan item berubah-ubah antara LNA.
-- ============================================================
create table if not exists public.qm_lna (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.qm_classes(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  created_by uuid not null references public.qm_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qm_lna_kelas_idx on public.qm_lna (class_id);

-- ============================================================
-- 2. qm_lna_items: senarai item satu LNA, merujuk Outcomes kelas.
--    Kunci komposit (lna_id, outcome_id): satu Outcome sekali sahaja
--    dalam satu LNA. `position` ialah susunan paparan.
-- ============================================================
create table if not exists public.qm_lna_items (
  lna_id uuid not null references public.qm_lna(id) on delete cascade,
  outcome_id uuid not null references public.qm_learning_outcomes(id) on delete cascade,
  position int not null,
  primary key (lna_id, outcome_id)
);

-- ============================================================
-- 3. qm_lna_rounds: pusingan PRA dan PASCA satu LNA. `unique
--    (lna_id, kind)` memastikan hanya satu pusingan pra dan satu
--    pasca setiap LNA. `mastery_snapshot` ialah salinan output
--    qm_mastery_summary semasa pusingan ditutup, supaya delta
--    penguasaan pra/pasca boleh dikira kemudian.
-- ============================================================
create table if not exists public.qm_lna_rounds (
  id uuid primary key default gen_random_uuid(),
  lna_id uuid not null references public.qm_lna(id) on delete cascade,
  kind text not null check (kind in ('pre','post')),
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  mastery_snapshot jsonb,
  unique (lna_id, kind)
);

-- ============================================================
-- 4. qm_lna_responses: jawapan seorang pelajar bagi satu item dalam
--    satu pusingan. `importance` = sepenting mana, `current_level` =
--    seyakin mana sekarang, kedua-dua skala 1 hingga 5. Jawapan
--    DENGAN NAMA (user_id) mengikut keputusan CTO; pelajar diberitahu
--    sebelum menjawab.
-- ============================================================
create table if not exists public.qm_lna_responses (
  round_id uuid not null references public.qm_lna_rounds(id) on delete cascade,
  user_id uuid not null references public.qm_profiles(id) on delete cascade,
  outcome_id uuid not null references public.qm_learning_outcomes(id) on delete cascade,
  importance smallint not null check (importance between 1 and 5),
  current_level smallint not null check (current_level between 1 and 5),
  submitted_at timestamptz not null default now(),
  primary key (round_id, user_id, outcome_id)
);

-- ============================================================
-- 5. RLS hidup tanpa polisi + keizinan ditutup. Semua bacaan dan
--    tulisan berlaku melalui laluan API dengan service role selepas
--    semakan akses di pelayan.
-- ============================================================
alter table public.qm_lna enable row level security;
alter table public.qm_lna_items enable row level security;
alter table public.qm_lna_rounds enable row level security;
alter table public.qm_lna_responses enable row level security;

revoke all on public.qm_lna from anon, authenticated;
revoke all on public.qm_lna_items from anon, authenticated;
revoke all on public.qm_lna_rounds from anon, authenticated;
revoke all on public.qm_lna_responses from anon, authenticated;

-- Pastikan PostgREST melihat jadual baharu.
notify pgrst, 'reload schema';
