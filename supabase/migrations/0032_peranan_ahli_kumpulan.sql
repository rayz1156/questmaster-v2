-- 0032_peranan_ahli_kumpulan.sql
--
-- Import kumpulan melalui CSV (Migrasi A).
--
-- qm_team_members kini hanya (team_id, user_id). Tiada tempat merekod
-- ketua. Tambah lajur role dengan lalai 'member' supaya ahli sedia ada
-- kekal 'member' tanpa tukar sesiapa menjadi ketua secara automatik.
--
-- Indeks unik separa memastikan satu ketua sahaja setiap kumpulan.

-- CHECK dibungkus blok DO supaya fail ini boleh jalan semula tanpa ralat.
ALTER TABLE public.qm_team_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

DO $$
BEGIN
  ALTER TABLE public.qm_team_members
    ADD CONSTRAINT qm_team_members_role_chk CHECK (role IN ('leader','member'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Satu ketua sahaja setiap kumpulan.
CREATE UNIQUE INDEX IF NOT EXISTS qm_team_one_leader
  ON public.qm_team_members (team_id) WHERE role = 'leader';

-- Pasangan (team_id, user_id) mesti unik supaya fungsi tuntut dan import
-- boleh guna ON CONFLICT (team_id, user_id). Jadual ini dicipta di luar
-- repositori migrasi, jadi indeks ini dijamin di sini.
CREATE UNIQUE INDEX IF NOT EXISTS qm_team_members_pair
  ON public.qm_team_members (team_id, user_id);