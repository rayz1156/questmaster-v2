-- KZ-001.sql: ujian penerimaan penilaian rakan sebaya, Fasa 1.
--
-- Jalankan pada pelayan (CTO):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/tests/KZ-001.sql
--
-- Seluruh fail berjalan dalam satu transaksi yang digulung semula pada
-- hujungnya, jadi tiada data ujian kekal dalam pangkalan data. Skrip ini
-- mencipta data sendiri, menjalankan public.qm_peer_compute, dan
-- membandingkan nilai dengan ujian mengikat dalam spesifikasi
-- (docs/SPEC-penilaian-rakan.md, Bahagian "Ujian penerimaan").
--
-- Sebarang ketidaksepadan memaparkan "UJIAN N GAGAL: ..." dan menghentikan
-- skrip; tiada output itu bermakna semua ujian lulus.

begin;

-- ============================================================
-- 0. Data asas: profil, kelas, kumpulan, pusingan
-- ============================================================

-- Profil ujian. ID tetap supaya hasil mudah dirujuk.
-- qm_profiles.id ialah FK ke auth.users, jadi baris auth.users disisip
-- dahulu. session_replication_role = replica melumpuhkan pencetus supaya
-- sisipan tanpa kata laluan/enkripsi diterima; dikembalikan ke origin
-- selepas itu.
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'kz001-00e1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a1', 'kz001-00a1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b1', 'kz001-00b1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000c1', 'kz001-00c1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000d1', 'kz001-00d1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000e2', 'kz001-00e2@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000f1', 'kz001-00f1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', 'kz001-00a2@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', 'kz001-00b2@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000c2', 'kz001-00c2@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000b5', 'kz001-00b5@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000c5', 'kz001-00c5@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000d5', 'kz001-00d5@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000e5', 'kz001-00e5@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000f5', 'kz001-00f5@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000001b1', 'kz001-01b1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000001c1', 'kz001-01c1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000001d1', 'kz001-01d1@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000e9', 'kz001-00e9@ujian.invalid', 'authenticated', 'authenticated', now(), now());

set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'educator',    'Pensyarah Ujian', 'pro',        true, false, now()),
  ('00000000-0000-0000-0000-0000000000a1', 'participant', 'Aisyah',          'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000b1', 'participant', 'Baharu',          'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000c1', 'participant', 'Chong',           'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000d1', 'participant', 'Devi',            'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000e2', 'participant', 'Eshal',           'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000f1', 'participant', 'Farid',           'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000a2', 'participant', 'Gina',            'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000b2', 'participant', 'Hakim',           'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000c2', 'participant', 'Intan',           'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000b5', 'participant', 'Wani',            'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000c5', 'participant', 'Xin',             'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000d5', 'participant', 'Yusuf',           'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000e5', 'participant', 'Zamri',           'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000f5', 'participant', 'Puteri',          'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000001b1', 'participant', 'Qistina',         'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000001c1', 'participant', 'Raihan',          'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000001d1', 'participant', 'Suresh',          'free',       true, false, now()),
  ('00000000-0000-0000-0000-0000000000e9', 'educator',    'Pensyarah Percuma', 'free',     true, false, now());

-- Kelas ujian (pemilik pelan pro supaya sekatan pelan tidak menghalang kiraan).
insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e1', 'Kelas Ujian KZ-001');

insert into public.qm_class_educators (class_id, educator_id, role, invited_by, invited_at, accepted_at) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e1', 'owner',
   '00000000-0000-0000-0000-0000000000e1', now(), now());

insert into public.qm_class_members (class_id, user_id) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000b5'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c5'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000d5'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e5'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000f5'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000001b1'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000001c1'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000001d1');

-- Enam kumpulan peringkat kelas (hunt_id is null), satu bagi setiap ujian.
insert into public.qm_teams (id, class_id, hunt_id, name, max_members) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000c01', null, 'Ujian 1', 4),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000c01', null, 'Ujian 2', 3),
  ('00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000c01', null, 'Ujian 3', 4),
  ('00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-000000000c01', null, 'Ujian 4', 4),
  ('00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-000000000c01', null, 'Ujian 5', 4),
  ('00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-000000000c01', null, 'Ujian 6', 4);

insert into public.qm_team_members (team_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000a1', 'member'),
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000b1', 'member'),
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', 'member'),
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000d1', 'member'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000e2', 'member'),
  -- T2 perlu tiga ahli: guna Farid dan Gina sebagai dua ahli tambahan.
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000f1', 'member'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000a2', 'member'),
  ('00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000f1', 'member'),
  ('00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000a2', 'member'),
  ('00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000b2', 'member'),
  ('00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000c2', 'member'),
  ('00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000b5', 'member'),
  ('00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000c5', 'member'),
  ('00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000d5', 'member'),
  ('00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000e5', 'member'),
  ('00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000000f5', 'member'),
  ('00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001b1', 'member'),
  ('00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001c1', 'member'),
  ('00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001d1', 'member'),
  ('00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000a1', 'member'),
  ('00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000b1', 'member'),
  ('00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000c1', 'member'),
  ('00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000d1', 'member');

-- ============================================================
-- PERINGATAN PENTING tentang keahlian bertindih
-- ============================================================
-- Ahli T6 (Aisyah, Baharu, Chong, Devi) juga ahli T1. qm_peer_compute
-- memproses setiap pengguna sekali sahaja bagi satu pusingan (kekangan
-- unique round_id, user_id). Untuk elakkan T6 terpotong oleh T1, kumpulan
-- T6 digunakan untuk UJIAN 6 dengan PUSINGAN BERASINGAN (r_kedua) di
-- bawah. Ahli T1 kekal empat orang dalam pusingan pertama.

-- Pusingan: terbuka sekarang (ujian 1 hingga 6 pilih antara dua pusingan).
insert into public.qm_peer_rounds (id, class_id, name, kind, opens_at, closes_at, created_by) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000c01', 'Pusingan 1', 'formatif',
   now() - interval '1 hour', now() + interval '1 day', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000c01', 'Pusingan 2', 'formatif',
   now() - interval '1 hour', now() + interval '1 day', '00000000-0000-0000-0000-0000000000e1'),
  -- Untuk ujian tetingkap masa.
  ('00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000c01', 'Belum dibuka', 'formatif',
   now() + interval '1 day', now() + interval '2 days', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-000000000d04', '00000000-0000-0000-0000-000000000c01', 'Sudah tutup', 'formatif',
   now() - interval '2 days', now() - interval '1 day', '00000000-0000-0000-0000-0000000000e1');

-- ============================================================
-- 1. Penilaian Contoh A (Ujian 1): T 28/27/28/15, r 3 setiap orang
-- ============================================================
-- Matriks (jumlah bagi k1..k5):
--   Devi   -> Aisyah 10, Baharu 10, Chong 10   (semua kriteria 2)
--   Baharu -> Aisyah 9,  Chong 9,  Devi 5
--   Chong  -> Aisyah 9,  Baharu 8, Devi 5
--   Aisyah -> Baharu 9,  Chong 9,  Devi 5

insert into public.qm_peer_ratings (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 2,2,2,2,2, null),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 2,2,2,2,2, null),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 1,1,1,1,1, 'Jarang hadir dan tidak menyumbang'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 2,2,2,2,1, 'Kurang komunikasi kadang kadang'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 2,2,2,2,1, 'Jarang berkongsi bahan rujukan'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 1,1,1,1,1, 'Jarang hadir dan tidak menyumbang'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 1,1,1,1,1, 'Jarang hadir dan tidak menyumbang');

-- ============================================================
-- 2. Contoh B (Ujian 2): tiga orang, semua memberi 9 kepada semua
-- ============================================================
-- Eshal, Farid, Gina dalam T2 (pusingan r02). Setiap satu memberi jumlah 9.
insert into public.qm_peer_ratings (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification) values
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a2', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e2', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a2', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e2', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 2,2,2,2,1, 'Kadang kadang datang lewat');

-- ============================================================
-- 3. Contoh C (Ujian 3): P 9/8/7/6, Pbar 7.5
-- ============================================================
-- Farid, Gina, Hakim, Intan dalam T3 (pusingan r01). Setiap penilai
-- memberi jumlah tetap kepada setiap rakan: Farid 9, Gina 8, Hakim 7,
-- Intan 6.
insert into public.qm_peer_ratings (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000f1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a2', 2,2,2,1,1, 'Jarang berkongsi bahan rujukan'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 2,2,2,1,1, 'Jarang berkongsi bahan rujukan'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 2,2,2,1,1, 'Jarang berkongsi bahan rujukan'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2', 2,2,1,1,1, 'Sering tidak memberi maklum balas'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2', 2,2,1,1,1, 'Sering tidak memberi maklum balas'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 2,2,1,1,1, 'Sering tidak memberi maklum balas'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 2,1,1,1,1, 'Jarang menghormati pandangan rakan'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c2', 2,1,1,1,1, 'Jarang menghormati pandangan rakan'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c2', 2,1,1,1,1, 'Jarang menghormati pandangan rakan');

-- ============================================================
-- 4. Ujian 4: Ahli D (Zamri) hanya menerima SATU penilaian
-- ============================================================
-- Wani, Xin, Yusuf menilai antara satu sama lain (jumlah 9 setiap satu),
-- dan hanya Wani menilai Zamri (jumlah 5). Zamri tidak menilai sesiapa.
insert into public.qm_peer_ratings (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000c5', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000d5', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000e5', 1,1,1,1,1, 'Jarang hadir dan tidak menyumbang'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000b5', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000d5', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000b5', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000c5', 2,2,2,2,1, 'Kadang kadang datang lewat');

-- ============================================================
-- 5. Ujian 5: satu ahli tidak menghantar borang langsung
-- ============================================================
-- Puteri (p1) tidak menghantar apa apa. Qistina, Raihan, Suresh menilai
-- dua rakan penghantar lain (jumlah 9) DAN Puteri (jumlah 9).
insert into public.qm_peer_ratings (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001c1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001d1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000000f5', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001b1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001d1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000000f5', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000001b1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000001c1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000000f5', 2,2,2,2,1, 'Kadang kadang datang lewat');

-- ============================================================
-- Jalankan pengiraan sebagai pemilik kelas (auth.uid() = pemilik)
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;

select public.qm_peer_compute('00000000-0000-0000-0000-000000000d01'::uuid) as baris_r01;
select public.qm_peer_compute('00000000-0000-0000-0000-000000000d02'::uuid) as baris_r02;

-- Ujian 6 (kumpulan berisiko) guna kumpulan T6 dalam pusingan r02, jadi
-- keahlian bertindih T1/T6 tidak bertembang: r02 hanya ada penilaian T2,
-- T6 akan dikira kosong kemudian. Masukkan penilaian T6 SEKARANG (pusingan
-- r02 masih terbuka), kemudian kira semula r02.
-- Matriks T6: setiap penilai memberi jumlah tetap: Aisyah 5, Baharu 6,
-- Chong 9, Devi 9. Dua MERAH dijangka, jadi semua ahli T6 berisiko.
-- Sisipan ini dibuat sebagai pentadbir: sesi masih dalam peranan
-- authenticated daripada panggilan compute di atas, dan dasar INSERT RLS
-- (rater_id = auth.uid()) yang betul akan menolak penilaian pihak lain.
reset role;

insert into public.qm_peer_ratings (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification) values
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1,1,1,1,1, 'Jarang hadir dan tidak menyumbang'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 1,1,1,1,1, 'Jarang hadir dan tidak menyumbang'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 1,1,1,1,1, 'Jarang hadir dan tidak menyumbang'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 2,1,1,1,1, 'Jarang menghormati pandangan rakan'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 2,1,1,1,1, 'Jarang menghormati pandangan rakan'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 2,1,1,1,1, 'Jarang menghormati pandangan rakan'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 2,2,2,2,1, 'Kadang kadang datang lewat'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 2,2,2,2,1, 'Kadang kadang datang lewat');

-- Kira semula r02 sebagai pendidik, seperti panggilan compute pertama.
set local role authenticated;

select public.qm_peer_compute('00000000-0000-0000-0000-000000000d02'::uuid) as baris_r02_kira_semula;

-- ============================================================
-- Semakan Ujian 1 (Contoh A)
-- ============================================================
do $u$
declare
  v record;
begin
  select r_count, valid, p, pbar, f, f_mod, flag, needs_review into v
    from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id  = '00000000-0000-0000-0000-0000000000d1'; -- Devi
  if v is null then raise exception 'UJIAN 1 GAGAL: tiada baris Devi'; end if;
  if v.r_count <> 3 then
    raise exception 'UJIAN 1 GAGAL: r Devi % (jangka 3)', v.r_count; end if;
  if v.p is distinct from 5.0000 then
    raise exception 'UJIAN 1 GAGAL: P Devi % (jangka 5.0000)', v.p; end if;
  if v.pbar is distinct from 8.1667 then
    raise exception 'UJIAN 1 GAGAL: Pbar % (jangka 8.1667)', v.pbar; end if;
  if v.f is distinct from 0.6122 then
    raise exception 'UJIAN 1 GAGAL: F Devi % (jangka 0.6122 tepat); P dibundar terlalu awal?', v.f; end if;
  if v.f_mod is distinct from 0.7000 then
    raise exception 'UJIAN 1 GAGAL: Fmod Devi % (jangka 0.7000)', v.f_mod; end if;
  if v.flag is distinct from 'MERAH' then
    raise exception 'UJIAN 1 GAGAL: bendera Devi % (jangka MERAH)', v.flag; end if;
  if v.needs_review is not true then
    raise exception 'UJIAN 1 GAGAL: SEMAK Devi jangka BENAR'; end if;
end $u$;

do $u$
declare v record;
begin
  select p, f, f_mod, flag, needs_review into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id = '00000000-0000-0000-0000-0000000000a1'; -- Aisyah
  if v.p is distinct from 9.3333 then raise exception 'UJIAN 1 GAGAL: P Aisyah % (jangka 9.3333)', v.p; end if;
  if v.f is distinct from 1.1429 then raise exception 'UJIAN 1 GAGAL: F Aisyah % (jangka 1.1429)', v.f; end if;
  if v.f_mod is distinct from 1.0000 then raise exception 'UJIAN 1 GAGAL: Fmod Aisyah % (jangka 1.0000)', v.f_mod; end if;
  if v.flag is distinct from 'HIJAU' then raise exception 'UJIAN 1 GAGAL: bendera Aisyah % (jangka HIJAU)', v.flag; end if;
  if v.needs_review is true then raise exception 'UJIAN 1 GAGAL: SEMAK Aisyah jangka PALSU'; end if;
end $u$;

do $u$
declare v record;
begin
  select p, f, f_mod, flag into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id = '00000000-0000-0000-0000-0000000000b1'; -- Baharu
  if v.p is distinct from 9.0000 then raise exception 'UJIAN 1 GAGAL: P Baharu % (jangka 9.0000)', v.p; end if;
  if v.f is distinct from 1.1020 then raise exception 'UJIAN 1 GAGAL: F Baharu % (jangka 1.1020)', v.f; end if;
  if v.flag is distinct from 'HIJAU' then raise exception 'UJIAN 1 GAGAL: bendera Baharu % (jangka HIJAU)', v.flag; end if;
end $u$;

do $u$
declare v record;
begin
  select p, f into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id = '00000000-0000-0000-0000-0000000000c1'; -- Chong
  if v.p is distinct from 9.3333 then raise exception 'UJIAN 1 GAGAL: P Chong % (jangka 9.3333)', v.p; end if;
  if v.f is distinct from 1.1429 then raise exception 'UJIAN 1 GAGAL: F Chong % (jangka 1.1429)', v.f; end if;
end $u$;

-- ============================================================
-- Semakan Ujian 2 (Contoh B)
-- ============================================================
do $u$
declare v int;
begin
  select count(*) into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d02'
     and team_id  = '00000000-0000-0000-0000-000000000b02'
     and p = 9.0000 and pbar = 9.0000 and f = 1.0000 and f_mod = 1.0000
     and flag = 'HIJAU' and needs_review = false;
  if v <> 3 then
    raise exception 'UJIAN 2 GAGAL: % daripada 3 baris tidak sepadan (semua HIJAU, F 1.0)', v;
  end if;
end $u$;

-- ============================================================
-- Semakan Ujian 3 (Contoh C)
-- ============================================================
do $u$
declare v record;
begin
  select p, f, f_mod, flag, needs_review into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id = '00000000-0000-0000-0000-0000000000f1'; -- Farid
  if v.p is distinct from 9.0000 then raise exception 'UJIAN 3 GAGAL: P Farid % (jangka 9.0000)', v.p; end if;
  if v.f is distinct from 1.2000 then raise exception 'UJIAN 3 GAGAL: F Farid % (jangka 1.2000)', v.f; end if;
  if v.f_mod is distinct from 1.0000 then raise exception 'UJIAN 3 GAGAL: Fmod Farid % (jangka 1.0000)', v.f_mod; end if;
  if v.flag is distinct from 'HIJAU' then raise exception 'UJIAN 3 GAGAL: bendera Farid % (jangka HIJAU)', v.flag; end if;

  select p, f, f_mod, flag into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id = '00000000-0000-0000-0000-0000000000a2'; -- Gina
  if v.p is distinct from 8.0000 then raise exception 'UJIAN 3 GAGAL: P Gina % (jangka 8.0000)', v.p; end if;
  if v.f is distinct from 1.0667 then raise exception 'UJIAN 3 GAGAL: F Gina % (jangka 1.0667)', v.f; end if;
  if v.f_mod is distinct from 1.0000 then raise exception 'UJIAN 3 GAGAL: Fmod Gina % (jangka 1.0000)', v.f_mod; end if;
  if v.flag is distinct from 'HIJAU' then raise exception 'UJIAN 3 GAGAL: bendera Gina % (jangka HIJAU)', v.flag; end if;

  select p, f, f_mod, flag, needs_review into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id = '00000000-0000-0000-0000-0000000000b2'; -- Hakim
  if v.p is distinct from 7.0000 then raise exception 'UJIAN 3 GAGAL: P Hakim % (jangka 7.0000)', v.p; end if;
  if v.f is distinct from 0.9333 then raise exception 'UJIAN 3 GAGAL: F Hakim % (jangka 0.9333)', v.f; end if;
  if v.f_mod is distinct from 0.9333 then raise exception 'UJIAN 3 GAGAL: Fmod Hakim % (jangka 0.9333)', v.f_mod; end if;
  if v.flag is distinct from 'KUNING' then raise exception 'UJIAN 3 GAGAL: bendera Hakim % (jangka KUNING)', v.flag; end if;
  if v.needs_review is true then raise exception 'UJIAN 3 GAGAL: SEMAK Hakim jangka PALSU'; end if;

  select p, f, f_mod, flag, needs_review into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id = '00000000-0000-0000-0000-0000000000c2'; -- Intan
  if v.p is distinct from 6.0000 then raise exception 'UJIAN 3 GAGAL: P Intan % (jangka 6.0000)', v.p; end if;
  if v.f is distinct from 0.8000 then raise exception 'UJIAN 3 GAGAL: F Intan % (jangka 0.8000 tepat)', v.f; end if;
  if v.f_mod is distinct from 0.8000 then raise exception 'UJIAN 3 GAGAL: Fmod Intan % (jangka 0.8000)', v.f_mod; end if;
  -- Sempadan paling penting: F tepat 0.80, jadi MERAH melalui P <= 6.0 sahaja.
  if v.flag is distinct from 'MERAH' then raise exception 'UJIAN 3 GAGAL: bendera Intan % (jangka MERAH melalui P <= 6.0)', v.flag; end if;
  if v.needs_review is true then raise exception 'UJIAN 3 GAGAL: SEMAK Intan jangka PALSU'; end if;
end $u$;

-- ============================================================
-- Semakan Ujian 4: ahli tidak sah, Pbar daripada tiga ahli lain
-- ============================================================
do $u$
declare v record;
begin
  select r_count, valid, p, f, f_mod, flag, needs_review into v
    from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id  = '00000000-0000-0000-0000-0000000000e5'; -- Zamri
  if v.r_count <> 1 then raise exception 'UJIAN 4 GAGAL: r Zamri % (jangka 1)', v.r_count; end if;
  if v.valid is not false then raise exception 'UJIAN 4 GAGAL: valid Zamri jangka PALSU'; end if;
  if v.p is not null then raise exception 'UJIAN 4 GAGAL: P Zamri % (jangka NULL)', v.p; end if;
  if v.f is not null then raise exception 'UJIAN 4 GAGAL: F Zamri % (jangka NULL)', v.f; end if;
  if v.f_mod is distinct from 1.0000 then raise exception 'UJIAN 4 GAGAL: Fmod Zamri % (jangka 1.0000)', v.f_mod; end if;
  if v.flag is not null then raise exception 'UJIAN 4 GAGAL: bendera Zamri % (jangka NULL)', v.flag; end if;
  if v.needs_review is not true then raise exception 'UJIAN 4 GAGAL: SEMAK Zamri jangka BENAR'; end if;

  -- Pbar mesti daripada tiga ahli lain sahaja (9.0), bukan dibahagi empat.
  select pbar into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id  = '00000000-0000-0000-0000-0000000000b5'; -- Wani
  if v.pbar is distinct from 9.0000 then
    raise exception 'UJIAN 4 GAGAL: Pbar % (jangka 9.0000 daripada tiga ahli sahaja)', v.pbar; end if;
end $u$;

-- ============================================================
-- Semakan Ujian 5: pembahagi r ialah 2, bukan 3
-- ============================================================
do $u$
declare v record;
begin
  select p, flag into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and user_id  = '00000000-0000-0000-0000-0000000001b1'; -- Qistina
  -- T = 18 daripada dua penilaian; pembahagi 2 memberi P 9.0. Pembahagi
  -- salah (3) memberi 6.0 dan MERAH: kegagalan senyap yang diuji di sini.
  if v.p is distinct from 9.0000 then
    raise exception 'UJIAN 5 GAGAL: P Qistina % (jangka 9.0000; 6.0 bermakna pembahagi n-1 diguna)', v.p; end if;
  if v.flag is distinct from 'HIJAU' then
    raise exception 'UJIAN 5 GAGAL: bendera Qistina % (jangka HIJAU)', v.flag; end if;
end $u$;

-- ============================================================
-- Semakan Ujian 6: kumpulan berisiko
-- ============================================================
do $u$
declare v int;
begin
  -- Aisyah (P 5) dan Baharu (P 6) MERAH; Chong dan Devi HIJAU; SEMUA
  -- empat ahli mesti team_at_risk = true.
  select count(*) into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d02'
     and team_id  = '00000000-0000-0000-0000-000000000b06'
     and team_at_risk = true;
  if v <> 4 then
    raise exception 'UJIAN 6 GAGAL: % daripada 4 ahli T6 berisiko (jangka 4)', v; end if;

  select count(*) into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d02'
     and team_id  = '00000000-0000-0000-0000-000000000b06'
     and flag = 'MERAH';
  if v <> 2 then
    raise exception 'UJIAN 6 GAGAL: % MERAH dalam T6 (jangka 2)', v; end if;

  -- Kumpulan lain (satu MERAH sahaja) TIDAK berisiko.
  select count(*) into v from public.qm_peer_results
   where round_id = '00000000-0000-0000-0000-000000000d01'
     and team_id  = '00000000-0000-0000-0000-000000000b01'
     and team_at_risk = true;
  if v <> 0 then
    raise exception 'UJIAN 6 GAGAL: T1 berisiko walaupun satu MERAH sahaja'; end if;
end $u$;

-- ============================================================
-- Semakan Ujian 7: kerahsiaan. Log masuk sebagai pelajar (Devi).
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000d1"}', true);

do $u$
declare v int;
begin
  -- Baris penilaian yang DITERIMA oleh Devi: mesti sifar.
  select count(*) into v from public.qm_peer_ratings
   where ratee_id = '00000000-0000-0000-0000-0000000000d1'
     and rater_id <> '00000000-0000-0000-0000-0000000000d1';
  if v <> 0 then
    raise exception 'UJIAN 7 GAGAL: pelajar nampak % baris penilaian tentang dirinya', v; end if;

  -- Keputusan tentang dirinya sendiri: mesti sifar (tiada dasar SELECT).
  select count(*) into v from public.qm_peer_results
   where user_id = '00000000-0000-0000-0000-0000000000d1';
  if v <> 0 then
    raise exception 'UJIAN 7 GAGAL: pelajar nampak % baris keputusan dirinya', v; end if;

  -- Kawalan positif: baris yang Devi TULIS sendiri masih kelihatan.
  -- Devi menulis 6 baris: 3 dalam T1 (r01) dan 3 dalam T6 (r02).
  select count(*) into v from public.qm_peer_ratings
   where rater_id = '00000000-0000-0000-0000-0000000000d1';
  if v <> 6 then
    raise exception 'UJIAN 7 GAGAL: kawalan positif gagal, Devi nampak % baris tulisannya (jangka 6)', v; end if;
end $u$;

-- Kembali sebagai pentadbir untuk ujian yang tinggal.
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================================
-- Semakan Ujian 8: penilaian kendiri ditolak
-- ============================================================
do $u$
begin
  begin
    insert into public.qm_peer_ratings
      (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification)
    values
      ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b01',
       '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1',
       2,2,2,2,2, null);
    raise exception 'UJIAN 8 GAGAL: penilaian kendiri diterima'; end;
exception when others then
  if sqlerrm like 'UJIAN 8 GAGAL%' then raise; end if;
  -- Ditolak seperti jangkaan: sama ada oleh pencetus (QM_PEER_SELF) atau
  -- CHECK constraint. Kedua duanya diterima.
end $u$;

-- ============================================================
-- Semakan Ujian 9: justifikasi
-- ============================================================
do $u$
begin
  begin
    -- Satu kriteria bernilai 1, justifikasi kosong: mesti ditolak.
    insert into public.qm_peer_ratings
      (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification)
    values
      ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b02',
       '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1',
       1,2,2,2,2, null);
    raise exception 'UJIAN 9 GAGAL: penilaian tanpa justifikasi diterima';
  exception when others then
    if sqlerrm like 'UJIAN 9 GAGAL%' then raise; end if;
  end;
end $u$;

-- Kelima lima kriteria bernilai 2 dengan justifikasi kosong: mesti diterima.
insert into public.qm_peer_ratings
  (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification)
values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000b02',
   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1',
   2,2,2,2,2, null);

-- ============================================================
-- Semakan Ujian 10: tetingkap masa
-- ============================================================
do $u$
begin
  begin
    insert into public.qm_peer_ratings
      (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification)
    values
      ('00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000b02',
       '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1',
       2,2,2,2,2, null);
    raise exception 'UJIAN 10 GAGAL: penilaian sebelum opens_at diterima';
  exception when others then
    if sqlerrm like 'UJIAN 10 GAGAL%' then raise; end if;
  end;
end $u$;

do $u$
begin
  begin
    insert into public.qm_peer_ratings
      (round_id, team_id, rater_id, ratee_id, k1, k2, k3, k4, k5, justification)
    values
      ('00000000-0000-0000-0000-000000000d04', '00000000-0000-0000-0000-000000000b02',
       '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1',
       2,2,2,2,2, null);
    raise exception 'UJIAN 10 GAGAL: penilaian selepas closes_at diterima';
  exception when others then
    if sqlerrm like 'UJIAN 10 GAGAL%' then raise; end if;
  end;
end $u$;

-- ============================================================
-- Semakan Ujian 11: pusingan ketujuh ditolak
-- ============================================================
insert into public.qm_peer_rounds (id, class_id, name, opens_at, closes_at, created_by) values
  ('00000000-0000-0000-0000-000000000d05', '00000000-0000-0000-0000-000000000c01', 'Pusingan 5',
   now() - interval '1 hour', now() + interval '1 day', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-000000000d06', '00000000-0000-0000-0000-000000000c01', 'Pusingan 6',
   now() - interval '1 hour', now() + interval '1 day', '00000000-0000-0000-0000-0000000000e1');

do $u$
begin
  begin
    insert into public.qm_peer_rounds (id, class_id, name, opens_at, closes_at, created_by) values
      ('00000000-0000-0000-0000-000000000d07', '00000000-0000-0000-0000-000000000c01', 'Pusingan 7',
       now() - interval '1 hour', now() + interval '1 day', '00000000-0000-0000-0000-0000000000e1');
    raise exception 'UJIAN 11 GAGAL: pusingan ketujuh diterima';
  exception when others then
    if sqlerrm like 'UJIAN 11 GAGAL%' then raise; end if;
    if sqlerrm not like '%QM_PEER_MAX_ROUNDS%' then
      raise exception 'UJIAN 11 GAGAL: ralat yang salah: %', sqlerrm; end if;
  end;
end $u$;

-- ============================================================
-- Semakan Ujian 12: pelan percuma ditolak dengan mesej pelan
-- ============================================================
insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-0000000000e9', 'Kelas Percuma KZ-001');
insert into public.qm_class_educators (class_id, educator_id, role, invited_by, invited_at, accepted_at) values
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-0000000000e9', 'owner',
   '00000000-0000-0000-0000-0000000000e9', now(), now());

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000e9"}', true);
set local role authenticated;

do $u$
begin
  begin
    insert into public.qm_peer_rounds (class_id, name, opens_at, closes_at, created_by) values
      ('00000000-0000-0000-0000-000000000c02', 'Pusingan percuma',
       now() - interval '1 hour', now() + interval '1 day',
       '00000000-0000-0000-0000-0000000000e9');
    raise exception 'UJIAN 12 GAGAL: pusingan pelan percuma diterima';
  exception when others then
    if sqlerrm like 'UJIAN 12 GAGAL%' then raise; end if;
    if sqlerrm not like '%QM_PLAN_FREE%' then
      raise exception 'UJIAN 12 GAGAL: ralat yang salah: %', sqlerrm; end if;
  end;
end $u$;

reset role;

-- ============================================================
-- Hujung: semua ujian lulus jika skrip sampai ke sini tanpa ralat.
-- ============================================================
rollback;