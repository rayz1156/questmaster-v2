-- 0046_segerak_nama_profil.sql
--
-- V2-009: nama pada kad Intro (intro_display_name) mesti segerakkan nama
-- akaun (display_name). Sebelum ini saveIntroCard hanya menulis
-- intro_display_name, jadi senarai kelas (People), papan pendahulu,
-- Kuiz Langsung dan sijil masih menunjukkan nama lama.
--
-- Kandungan:
--   1. Jadual sandaran qm_profiles_nama_sandaran_0046 (RLS aktif, tiada
--      polisi, hanya supabase_admin/service_role boleh baca).
--   2. Isi semula (backfill): salin display_name lama ke sandaran, kemudian
--      set display_name = left(trim(intro_display_name), 80) untuk profil
--      yang berbeza. Akaun yang padam sendiri (display_name berawalan
--      "[Deleted]", tanda softDeleteMyAccount) dikecualikan.
--   3. Pencetus qm_segerak_nama_intro pada UPDATE qm_profiles supaya laluan
--      lain (contoh alat MCP) turut menyegerakkan display_name.
--
-- Nota pemulihan (jika perlu mengembalikan nama lama):
--   update qm_profiles p
--     set display_name = s.display_name_lama
--     from qm_profiles_nama_sandaran_0046 s
--     where s.id = p.id;
--
-- Tiada COMMIT dalam fail ini (dijalankan manual oleh CTO di VPS).

-- ---------------------------------------------------------------------
-- 1. Jadual sandaran. RLS aktif tanpa polisi: RLS menafikan semua akses
--    baris kepada pengguna biasa walaupun ada GRANT, dan REVOKE di bawah
--    menjadikannya jelas. Hanya supabase_admin/service_role boleh baca.
-- ---------------------------------------------------------------------
create table if not exists public.qm_profiles_nama_sandaran_0046 (
  id uuid primary key,
  display_name_lama text,
  disalin_pada timestamptz default now()
);

alter table public.qm_profiles_nama_sandaran_0046 enable row level security;

revoke all on public.qm_profiles_nama_sandaran_0046 from anon;
revoke all on public.qm_profiles_nama_sandaran_0046 from authenticated;
revoke all on public.qm_profiles_nama_sandaran_0046 from public;

-- ---------------------------------------------------------------------
-- 2. Isi semula (backfill). Syarat:
--      intro_display_name tidak kosong, DAN
--      berbeza daripada display_name semasa, DAN
--      display_name bukan tanda akaun padam sendiri ("[Deleted] ...").
--    Kemas kini dijalankan sebagai supabase_admin, jadi guard
--    qm_guard_profile_privileges melaluinya tanpa isu (0040:509).
-- ---------------------------------------------------------------------
insert into public.qm_profiles_nama_sandaran_0046 (id, display_name_lama)
select p.id, p.display_name
from public.qm_profiles p
where nullif(btrim(p.intro_display_name), '') is not null
  and nullif(btrim(p.intro_display_name), '') is distinct from btrim(coalesce(p.display_name, ''))
  and coalesce(p.display_name, '') not like '[Deleted]%';

update public.qm_profiles p
set display_name = left(btrim(p.intro_display_name), 80)
where nullif(btrim(p.intro_display_name), '') is not null
  and nullif(btrim(p.intro_display_name), '') is distinct from btrim(coalesce(p.display_name, ''))
  and coalesce(p.display_name, '') not like '[Deleted]%';

-- ---------------------------------------------------------------------
-- 3. Pencetus penyegerakan. SECURITY INVOKER sengaja (seperti guard 0027):
--    ia hanya mengubah NEW, bukan membaca jadual berpagar, jadi tiada
--    kuasa tambahan diperlukan dan tiada risiko laluan belakang.
--
--    Susunan trigger BEFORE UPDATE pada qm_profiles mengikut nama:
--    qm_profiles_guard_privileges (0040:531) berjalan dahulu, kemudian
--    trigger ini. Guard tidak memin display_name (0040:512-524), jadi
--    tiada pertembungan nilai.
-- ---------------------------------------------------------------------
create or replace function public.qm_segerak_nama_intro()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  -- Hanya bila nilai kad Intro berubah dan bukan kosong. Nilai kosong
  -- atau NULL bermakna pengguna mahu kosongkan kad Intro sahaja; nama
  -- akaun tidak dikosongkan.
  if new.intro_display_name is distinct from old.intro_display_name
     and nullif(btrim(new.intro_display_name), '') is not null then
    new.display_name := left(btrim(new.intro_display_name), 80);
  end if;
  return new;
end;
$fn$;

drop trigger if exists qm_segerak_nama_intro on public.qm_profiles;
create trigger qm_segerak_nama_intro
  before update on public.qm_profiles
  for each row execute function public.qm_segerak_nama_intro();

-- PostgREST perlu tahu tentang fungsi dan jadual baharu.
notify pgrst, 'reload schema';
