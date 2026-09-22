# Spesifikasi: import kumpulan melalui CSV

Untuk: Hermes Agent. Repo: questmaster-v2, cawangan feat/live-quiz.
Ditulis oleh Claude sebagai project manager. Ikut spesifikasi ini, jangan
reka bentuk semula. Kalau ada percanggahan antara spesifikasi ini dengan
apa yang anda jumpa dalam kod, berhenti dan laporkan, jangan teka.

## Matlamat

Pendidik muat turun templat CSV, isi senarai kumpulan dan ahli, muat naik
semula. Kuizen mencipta kumpulan, memasukkan ahli ke dalam kelas dan ke
dalam kumpulan masing masing, dan menandakan ketua kumpulan.

Tempatnya: /educator/classes/[id]/people, sub-tab "Teams" yang sudah ada.

## Yang SUDAH ADA dalam kod, jangan bina semula

- `src/app/educator/classes/[id]/people/page.tsx` sudah ada tiga sub-tab:
  Students, Teams, Educators. Tambah butang dalam sub-tab Teams.
- Corak templat CSV dan import sudah terbukti:
  `src/app/api/live/quiz-template/route.ts` dan
  `src/app/api/live/quizzes/[quizId]/import-csv/route.ts`. Salin coraknya,
  termasuk BOM UTF-8 di hadapan templat. Tanpa BOM, Excel di Windows
  merosakkan aksara beraksen apabila pendidik menyimpan semula.
- `qm_teams` sudah ada lajur `class_id`, jadi kumpulan peringkat kelas
  sudah disokong. Set `hunt_id` kepada NULL untuk kumpulan kelas.
- Sekatan pelan sudah ada. `qm_guard_plan_teams` menyekat INSERT ke
  `qm_teams` untuk pelan percuma. Jangan pintas. Tunjukkan sebab yang
  betul menggunakan `mesejHad` daripada `src/lib/pelan.ts`.

## Fakta penting yang mudah tersilap

**`qm_profiles` TIADA lajur emel.** Emel berada dalam `auth.users`. Jadi
memadankan emel kepada akaun memerlukan fungsi SECURITY DEFINER yang
membaca `auth.users`. Jangan cuba `select ... from qm_profiles where
email = ...`, lajur itu tidak wujud.

**`qm_class_members` dan `qm_team_members` berkunci pada `user_id uuid`,
bukan emel.** Pelajar yang belum mendaftar tidak boleh dimasukkan terus.
Itulah sebab jadual tunggu dalam Migrasi B wujud.

## Format CSV muktamad

```
nama_kumpulan,nama_ahli,emel,ketua
Kumpulan Orion,Ali bin Abu,ali@sekolah.edu.my,ya
Kumpulan Orion,Siti Aminah,siti@sekolah.edu.my,
Kumpulan Nova,Chong Wei Ming,chong@sekolah.edu.my,ya
Kumpulan Nova,Devi Rajan,devi@sekolah.edu.my,
```

- `nama_kumpulan` wajib. Bilangan kumpulan ditentukan oleh nilai unik
  dalam lajur ini. TIADA lajur "bilangan kumpulan". Meminta pendidik
  menyatakan bilangan sekali lagi hanya mencipta percanggahan antara apa
  yang ditulis dan apa yang dikira, tanpa faedah.
- `nama_ahli` pilihan. Dipaparkan dalam pratonton dan disimpan pada baris
  tunggu supaya pendidik nampak siapa belum mendaftar.
- `emel` wajib. Normalkan: potong ruang, huruf kecil semua.
- `ketua` pilihan. Nilai diterima: ya, yes, y, 1, true (tidak sensitif
  huruf besar kecil). Kosong bermakna ahli biasa.

Sebab ada lajur `ketua` dan bukan "baris pertama menjadi ketua": pendidik
akan menyusun senarai mengikut nama dalam Excel. Itu perkara paling biasa
di dunia. Peraturan baris pertama akan menukar ketua setiap kumpulan
secara senyap. Lajur eksplisit tidak pernah rosak oleh susunan.

## Migrasi A: peranan dalam kumpulan

Fail: `supabase/migrations/0032_peranan_ahli_kumpulan.sql`

`qm_team_members` kini hanya (team_id, user_id). Tiada tempat merekod
ketua. Tambah:

```sql
ALTER TABLE public.qm_team_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';
-- CHECK (role IN ('leader','member')) dalam blok DO supaya boleh jalan semula
-- Indeks unik separa: satu ketua sahaja setiap kumpulan
CREATE UNIQUE INDEX IF NOT EXISTS qm_team_one_leader
  ON public.qm_team_members (team_id) WHERE role = 'leader';
```

Ahli sedia ada kekal 'member'. Jangan tukar sesiapa menjadi ketua secara
automatik.

## Migrasi B: jadual tunggu dan fungsi tuntut

Fail: `supabase/migrations/0033_jemputan_kumpulan.sql`

Jadual `qm_team_invites`: id, class_id, team_id, email, nama (text null),
role, invited_by, created_at, claimed_at, claimed_by.
Indeks unik separa pada (team_id, email) di mana claimed_at IS NULL.
RLS: pendidik kelas itu boleh baca dan tulis, pentadbir semua.

Fungsi `public.qm_user_id_by_email(p_email text) RETURNS uuid`,
SECURITY DEFINER, membaca `auth.users` dengan `lower(btrim(email))`.

Fungsi `public.qm_claim_team_invites(p_user uuid) RETURNS integer`,
SECURITY DEFINER. Untuk setiap baris belum dituntut yang emelnya sepadan
dengan emel pengguna itu:
1. INSERT INTO qm_class_members (class_id, user_id) ON CONFLICT DO NOTHING
2. INSERT INTO qm_team_members (team_id, user_id, role) ON CONFLICT DO NOTHING
3. Tanda claimed_at = now(), claimed_by = p_user
Pulangkan bilangan baris yang dituntut.

Panggil fungsi itu daripada `qm_handle_new_user` selepas profil dicipta,
di dalam blok yang tidak boleh menggagalkan pendaftaran. Kalau tuntutan
gagal, pendaftaran mesti tetap berjaya.

PERINGATAN SECURITY DEFINER: dalam fungsi SECURITY DEFINER, `current_user`
ialah pemilik fungsi, bukan pemanggil. Kalau anda perlu menyemak peranan
pemanggil, gunakan `public.qm_caller_is_privileged()` daripada fungsi
SECURITY INVOKER, bukan dari dalam SECURITY DEFINER. Ini sudah pernah
menyebabkan penjaga keselamatan menjadi hiasan dalam projek ini.

## API

`GET /api/classes/[id]/teams/template`
Templat CSV dengan BOM UTF-8, tiga baris contoh. Salin corak
`/api/live/quiz-template`.

`POST /api/classes/[id]/teams/import-csv`
Auth: Bearer token, bukan kuki. Lihat `src/lib/supabase-route.ts`.
Pemanggil mesti pemilik atau pendidik kelas itu.
Badan: fail CSV.
Parameter `?dryRun=1`: pulangkan pratonton tanpa menulis apa apa.

Pratonton memulangkan:
- senarai kumpulan yang akan dicipta, dan yang sudah wujud dan akan diguna semula
- bagi setiap emel: akan sertai sekarang, atau menunggu pendaftaran
- senarai ralat dengan nombor baris

Import sebenar berjalan dalam SATU transaksi. Kalau mana mana baris gagal,
semua digulung semula. Import separuh jadi lebih teruk daripada tiada
import langsung, kerana pendidik tidak tahu keadaan sebenar.

## Peraturan pengesahan

Ralat, import ditolak:
- emel yang sama muncul dua kali dalam fail
- emel yang sama dalam dua kumpulan berbeza
- satu kumpulan mempunyai dua ketua
- emel tidak sah bentuknya
- `nama_kumpulan` atau `emel` kosong
- lebih 500 baris
- emel itu sudah menjadi ahli kumpulan lain dalam kelas yang sama, KECUALI
  pendidik menanda pilihan "replace existing groups"

Amaran, import diteruskan:
- kumpulan tanpa ketua
- kumpulan dengan seorang ahli sahaja

Kumpulan yang namanya sudah wujud dalam kelas itu diguna semula, bukan
dicipta bertindih. `max_members` ditetapkan kepada bilangan ahli dalam
kumpulan itu, minimum 2.

## UI

Dalam sub-tab Teams pada `/educator/classes/[id]/people`:
- Butang "Download template" dan "Upload CSV"
- Selepas muat naik, tunjukkan pratonton: berapa kumpulan, berapa sertai
  sekarang, berapa menunggu pendaftaran, dan senarai ralat
- Butang "Confirm import" hanya aktif kalau tiada ralat
- Ahli yang menunggu dipaparkan dalam senarai kumpulan dengan label
  "pending" dan emel mereka
- Bahasa: Bahasa Inggeris, sepadan dengan bahagian dalam aplikasi pendidik
- Gaya: violet dan indigo, `rounded-xl`, sepadan dengan skrin sedia ada

## Kriteria penerimaan

1. Templat dimuat turun dan dibuka dalam Excel tanpa aksara rosak.
2. Muat naik fail dengan dua kumpulan dan empat emel, di mana dua emel
   sudah berdaftar dan dua belum: dua kumpulan dicipta, dua ahli berdaftar
   masuk terus ke kelas dan kumpulan, dua lagi menjadi baris tunggu.
3. Apabila emel yang menunggu itu mendaftar, dia terus berada dalam kelas
   dan kumpulan yang betul tanpa tindakan pendidik.
4. Ketua direkod dengan betul, dan menyusun semula baris CSV tidak
   menukar siapa ketua.
5. Fail dengan emel berganda ditolak sepenuhnya, tiada kumpulan separuh
   jadi dalam pangkalan data.
6. Pendidik pelan percuma nampak mesej pelan yang betul, bukan ralat
   Postgres mentah.
7. `npx tsc --noEmit` bersih dan `npm run build` berjaya.

## Cara bekerja

- Repo tempatan: `C:\Users\Hariz\Projects\questmaster-v2`
- `git pull origin feat/live-quiz` DAHULU. Salinan tempatan ketinggalan
  beberapa komit.
- Untuk gantian berbilang baris yang rumit, gunakan skrip Python, bukan
  sed atau perl satu baris. Keduanya kerap gagal pada inden dan petikan
  dalam projek ini.
- Komen kod dalam Bahasa Melayu, sepadan dengan gaya migrasi sedia ada.
- Jangan guna em dash di mana mana.
- Komit ke `feat/live-quiz` dengan komit konvensional. JANGAN push.
  Claude akan menyemak diff, menjalankan migrasi, membina dan melancarkan
  ke VPS. Anda tidak menyentuh pengeluaran.
- Jangan jalankan migrasi. Tulis fail SQL sahaja.
