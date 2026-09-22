# Spesifikasi: penilaian rakan sebaya (Fasa 1, laluan formatif)

Untuk: Hermes Agent. Repo: questmaster-v2, cawangan feat/live-quiz.
Ditulis oleh Claude sebagai project manager, berdasarkan dokumen Dr Hariz
"Penilaian Sumbangan Individu dalam Tugasan Berkumpulan", 22 September 2026.

Ikut spesifikasi ini, jangan reka bentuk semula. Kalau ada percanggahan
antara spesifikasi ini dengan apa yang anda jumpa dalam kod, berhenti dan
laporkan dengan nombor baris. Jangan teka, dan jangan laporkan sesuatu
sebagai wujud dalam fail kalau anda tidak boleh memetik barisnya.

## Matlamat

Setiap ahli kumpulan menilai rakan sekumpulannya secara sulit menggunakan
lima kriteria. Sistem mengira purata skor setiap pelajar, membandingkannya
dengan purata kumpulan sendiri, dan menghasilkan satu faktor sumbangan.
Faktor itu memberitahu pensyarah siapa menyumbang di bawah paras kumpulan,
awal, semasa masalah masih boleh dibaiki.

Fasa 1 TIDAK menyentuh markah langsung. Tiada G, tiada M, tiada moderasi.
Itu Fasa 2 dan bukan sebahagian daripada kerja ini.

## Skop Fasa 1

Yang DIBINA dalam kerja ini:

- Tiga jadual dan satu fungsi pengiraan dalam satu migrasi.
- Pensyarah mencipta, menyunting dan memadam pusingan penilaian.
- Borang pelajar lima kriteria, sulit, tanpa penilaian kendiri.
- Pengiraan T, r, P, Pbar, F, Fmod dan bendera.
- Papan pemuka pensyarah berkod warna dengan penapis.

Yang TIDAK dibina dalam kerja ini, walaupun lajur untuknya wujud:

- Sumber markah kumpulan G.
- Pengiraan markah individu M.
- Gerbang moderasi dan pemuktamadan markah.
- Normalisasi penilai dalam Lampiran A dokumen. Dokumen itu sendiri
  berkata jangan laksanakan. Jangan laksanakan.

Lajur `kind`, `g_source`, `board_id`, `g`, `m`, `moderated_by` dan
`finalised_at` dicipta dalam migrasi ini supaya Fasa 2 tidak memerlukan
migrasi pemecah. Biarkan ia kosong.

## Unit penilaian ialah PUSINGAN, milik KELAS

Bukan milik aktiviti. Kalau penilaian melekat pada aktiviti, pensyarah
dengan dua belas aktiviti akan menjalankan dua belas pusingan, dan
Bahagian 9.5 dokumen menyenaraikan penilaian mingguan sebagai perkara yang
sengaja tidak dimasukkan. Jangan letak butang penilaian pada aktiviti.

Bilangan dan tarikh pusingan ditentukan oleh pensyarah, bukan dikunci oleh
sistem. Satu hingga enam pusingan setiap kelas. Had enam ialah sekatan
reka bentuk, bukan kekangan teknikal, dan mesti dikuatkuasakan.

Kumpulan yang digunakan ialah kumpulan peringkat kelas sahaja, iaitu
`qm_teams` dengan `class_id` sepadan dan `hunt_id IS NULL`. Itu kumpulan
yang sama yang dicipta oleh import CSV dalam kerja terdahulu. Kumpulan
peringkat hunt tidak digunakan.

## DUA PERCANGGAHAN DALAM DOKUMEN SUMBER, SUDAH DISELESAIKAN

Jangan buka semula keputusan ini. Ia sudah dirujuk kepada Dr Hariz.

### Percanggahan 1: pembahagi bagi Pbar

Bahagian 5.2 Langkah 3 menulis:

    Pbar = ( P(1) + P(2) + ... + P(n) ) / n

Bahagian 8.2 pseudokod menulis:

    Pbar = PURATA( P[i] bagi semua i di mana sah[i] = BENAR )

Kedua-duanya berbeza apabila ada ahli dengan `r(i) < 2`, kerana ahli itu
tiada nilai P langsung.

**Keputusan: ikut Bahagian 8.2.** Pbar ialah min bagi nilai P ahli yang
SAH sahaja. Ahli tidak sah dikecualikan daripada pengangka DAN daripada
pembahagi. Bahagian 5.2 ialah bentuk ringkas yang menganggap semua ahli
sah, dan Bahagian 8.2 ialah spesifikasi pelaksanaan. Kedua-duanya memberi
jawapan sama apabila semua ahli sah, dan semua contoh bekerja dalam
Bahagian 6 mempunyai semua ahli sah.

### Percanggahan 2: bendera SEMAK ditimpa

Bahagian 8.2 menetapkan `bendera[i] = "SEMAK"` dalam dua tempat, kemudian
baris terakhir menulis `bendera[i] = penandaan_formatif( P[i], F[i] )`
yang menimpa nilai itu. Lebih teruk, dalam cabang `sah[i] = PALSU`, nilai
`F[i]` tidak pernah ditetapkan, jadi pemanggilan itu tidak sah.

**Keputusan: SEMAK dan bendera warna ialah DUA MEDAN BERASINGAN.**

- `needs_review boolean` menyimpan SEMAK. Sekali ditetapkan BENAR, ia
  tidak pernah dikosongkan oleh pengiraan bendera warna.
- `flag text` menyimpan MERAH, KUNING atau HIJAU, dan NULL apabila ahli
  itu tidak sah kerana `P` dan `F` tidak wujud.

Satu rekod boleh membawa kedua-duanya, contohnya MERAH dan SEMAK
serentak. Itu memang keadaan yang paling memerlukan perhatian pensyarah.

### Satu lagi keputusan PM, bukan percanggahan

Bahagian 7 berkata peraturan penandaan warna terpakai kepada Pusingan 1,
2 dan 3. Selepas pusingan boleh ditakrif sendiri oleh pensyarah, nombor
pusingan tidak lagi bermakna.

**Keputusan: bendera warna dikira bagi SETIAP pusingan, formatif atau
sumatif, kerana ia hanya aritmetik ke atas P dan F.** Yang terhad kepada
pusingan formatif ialah tindakan yang disyorkan dalam Bahagian 7, bukan
pengiraan. Dalam Fasa 1 hanya pusingan formatif wujud, jadi ini tidak
mengubah apa-apa hari ini, tetapi ia menjadikan Fasa 2 tidak perlu
menulis semula fungsi pengiraan.

## Instrumen

Lima kriteria sahaja, tetap, tidak boleh ditambah:

| Kod | Kriteria |
| --- | --- |
| K1 | Kehadiran dan ketepatan masa |
| K2 | Perkongsian tanggungjawab |
| K3 | Penyertaan aktif |
| K4 | Komunikasi |
| K5 | Hormat dan sokongan |

Skala tiga mata bagi setiap kriteria: 0 tidak pernah, 1 kadang-kadang,
2 sentiasa. Skor maksimum seorang penilai kepada seorang rakan ialah 10.

Justifikasi bertulis WAJIB apabila mana-mana daripada K1 hingga K5
bernilai 0 atau 1. Kosong dibenarkan hanya apabila kelima-lima kriteria
bernilai 2. Kuatkuasakan ini dengan CHECK pangkalan data, bukan hanya
dalam React, kerana borang ini boleh dihantar terus melalui PostgREST.
Panjang minimum justifikasi: 10 aksara selepas potong ruang. Dokumen
tidak menyatakan panjang minimum; sepuluh aksara ialah keputusan saya
untuk menghalang jawapan "ok" yang tidak memberi konteks kepada
pensyarah.

Tiada penilaian kendiri. Bahagian 2.2 dokumen menyatakan kajian Monte
Carlo mendapati penilaian kendiri patut dielakkan sama sekali kerana ia
menambah ralat. Borang tidak boleh memaparkan diri sendiri sebagai
pilihan, dan pangkalan data mesti menolak `rater_id = ratee_id`.

## Formula, tepat seperti dokumen

Dijalankan berasingan bagi setiap kumpulan dalam setiap pusingan.

    T(i)  = jumlah (k1+k2+k3+k4+k5) bagi semua rekod di mana ratee = i
    r(i)  = bilangan rekod di mana ratee = i
    sah(i) = (r(i) >= 2)
    P(i)  = T(i) / r(i)                    hanya jika sah(i)
    Pbar  = min P(i) bagi semua i yang sah
    F(i)  = P(i) / Pbar

    Jika NOT sah(i) ATAU Pbar = 0:
        Fmod(i) = 1.00, needs_review = BENAR, flag = NULL
    Jika F(i) > 1.00:  Fmod(i) = 1.00
    Jika F(i) < 0.70:  Fmod(i) = 0.70, needs_review = BENAR
    Selain itu:        Fmod(i) = F(i)

    flag: MERAH  jika P(i) <= 6.0  ATAU F(i) < 0.80
          KUNING jika P(i) <= 7.5  ATAU F(i) < 0.90
          HIJAU  selain itu

Turutan penting. MERAH disemak dahulu, dan hanya kalau ia gagal barulah
KUNING disemak. Menulis KUNING sebagai julat 6.1 hingga 7.5 juga betul
dan memberi hasil sama, tetapi turutan bersarang lebih selamat.

KUMPULAN BERISIKO: BENAR bagi semua ahli sesuatu kumpulan apabila dua
atau lebih ahli kumpulan itu mendapat MERAH dalam pusingan yang sama.

**JANGAN membundarkan P sebelum mengira F.** Gunakan ketepatan penuh
sepanjang pengiraan, dan bundarkan hanya semasa memaparkan. Kalau P
dibundarkan kepada dua tempat perpuluhan dahulu, Contoh A dalam dokumen
tidak akan menghasilkan 0.6122 bagi Devi. Ini bukan perkara kecil, ia
adalah ujian penerimaan nombor 1.

## `r(i)` IALAH BILANGAN YANG BENAR-BENAR DITERIMA

Bukan `n - 1`. Bahagian 5.2 Langkah 2 menyatakannya secara eksplisit:
pembahagi ialah bilangan penilaian yang benar-benar diterima, supaya
formula kebal terhadap rakan yang tidak menghantar borang.

Seorang pengatur cara akan menulis `n - 1` secara naluri kerana itu
bilangan rakan dalam kumpulan. Formula itu akan salah secara senyap bagi
setiap kumpulan yang ada ahli tidak menghantar borang, dan tiada ralat
akan muncul. Kira dengan `count(*)` ke atas rekod sebenar.

## Migrasi

Fail: `supabase/migrations/0034_penilaian_rakan.sql`

Migrasi terakhir dalam repo ialah `0033_jemputan_kumpulan.sql`. Sahkan
sendiri sebelum menamakan fail. JANGAN letak `COMMIT;` di dalam fail
migrasi. Fail 0033 mengandungi `COMMIT;` dan itu membatalkan pembalut
`BEGIN ... ROLLBACK` yang saya gunakan untuk menguji secara selamat pada
pelayan. Ia hampir menyebabkan kerosakan pada pangkalan data pengeluaran.

### Jadual `qm_peer_rounds`

    id           uuid primary key default gen_random_uuid()
    class_id     uuid not null references qm_classes(id) on delete cascade
    name         text not null
    kind         text not null default 'formatif'
                 check (kind in ('formatif','sumatif'))
    week         int check (week between 1 and 52)
    opens_at     timestamptz not null
    closes_at    timestamptz not null
    g_source     text check (g_source in ('board','manual'))
    board_id     uuid references qm_boards(id) on delete set null
    computed_at  timestamptz
    created_by   uuid not null references qm_profiles(id) on delete cascade
    created_at   timestamptz not null default now()
    updated_at   timestamptz not null default now()

Kekangan:

    check (closes_at > opens_at)
    check (kind = 'sumatif' or (g_source is null and board_id is null))
    check (kind = 'formatif' or g_source is not null)
    check (g_source is distinct from 'board' or board_id is not null)

`week` ialah LABEL sahaja dan tidak menggerakkan apa-apa jadual. Kelas
dalam Kuizen tiada tarikh mula semester, jadi "minggu 4" tidak boleh
ditukar kepada tarikh sebenar tanpa mencipta medan baharu yang pensyarah
perlu isi dengan betul. `opens_at` dan `closes_at` yang menentukan bila
borang dibuka. Jangan cuba mengira tarikh daripada `week`.

Had enam pusingan setiap kelas dikuatkuasakan oleh pencetus BEFORE INSERT
yang mengira baris sedia ada bagi `class_id` itu dan RAISE apabila sudah
enam. Gunakan kod `QM_PEER_MAX_ROUNDS`.

### Jadual `qm_peer_ratings`

    id           uuid primary key default gen_random_uuid()
    round_id     uuid not null references qm_peer_rounds(id) on delete cascade
    team_id      uuid not null references qm_teams(id) on delete cascade
    rater_id     uuid not null references qm_profiles(id) on delete cascade
    ratee_id     uuid not null references qm_profiles(id) on delete cascade
    k1..k5       smallint not null check (kN between 0 and 2)
    justification text
    submitted_at timestamptz not null default now()

    unique (round_id, rater_id, ratee_id)
    check  (rater_id <> ratee_id)
    check  ((k1 = 2 and k2 = 2 and k3 = 2 and k4 = 2 and k5 = 2)
            or (justification is not null
                and length(btrim(justification)) >= 10))

Pencetus BEFORE INSERT OR UPDATE yang menolak apabila:

- `team_id` bukan kumpulan peringkat kelas bagi kelas pusingan itu
- `rater_id` atau `ratee_id` bukan ahli `team_id`
- `now()` di luar julat `opens_at` hingga `closes_at`

Selepas `closes_at`, rekod menjadi tidak boleh ubah. Tiada UPDATE, tiada
DELETE oleh pelajar.

### Jadual `qm_peer_results`

    id            uuid primary key default gen_random_uuid()
    round_id      uuid not null references qm_peer_rounds(id) on delete cascade
    team_id       uuid not null references qm_teams(id) on delete cascade
    user_id       uuid not null references qm_profiles(id) on delete cascade
    t_total       int not null
    r_count       int not null
    valid         boolean not null
    p             numeric(8,4)
    pbar          numeric(8,4)
    f             numeric(8,4)
    f_mod         numeric(8,4) not null
    flag          text check (flag in ('MERAH','KUNING','HIJAU'))
    needs_review  boolean not null default false
    team_at_risk  boolean not null default false
    g             numeric(8,2)
    m             numeric(8,1)
    moderated_by  uuid references qm_profiles(id) on delete set null
    finalised_at  timestamptz
    computed_at   timestamptz not null default now()

    unique (round_id, user_id)

`g`, `m`, `moderated_by` dan `finalised_at` kekal NULL dalam Fasa 1.

### Fungsi pengiraan

    public.qm_peer_compute(p_round uuid) RETURNS integer

SECURITY DEFINER. Memadam semua baris `qm_peer_results` bagi pusingan itu
dan mengira semula dari awal. Pulangkan bilangan baris yang ditulis, dan
tetapkan `qm_peer_rounds.computed_at = now()`.

Semakan kebenaran di dalam fungsi: pemanggil mesti pemilik kelas atau
pendidik kelas itu. Gunakan `auth.uid()`, dan `public.qm_is_class_owner`
atau `public.qm_is_class_educator` daripada migrasi 0009.

PERINGATAN SECURITY DEFINER, sudah pernah menjadi masalah dalam projek
ini: di dalam fungsi SECURITY DEFINER, `current_user` ialah PEMILIK
fungsi, bukan pemanggil. Jangan sesekali menyemak peranan menggunakan
`current_user` di sini, penjaga itu akan sentiasa lulus dan menjadi
hiasan semata-mata. `auth.uid()` pula TIDAK terjejas oleh SECURITY
DEFINER dan selamat digunakan.

Ahli kumpulan diambil daripada `qm_team_members` pada masa pengiraan.
Pengiraan ialah gambar keadaan pada masa ia dijalankan. Kalau keahlian
berubah, pensyarah kira semula.

Sekatan pelan: kalau pemilik kelas berada pada pelan percuma dan
pemanggil bukan pentadbir, RAISE dengan kod `QM_PLAN_FREE`. Ikut corak
dalam `0033_jemputan_kumpulan.sql` yang menggunakan
`public.qm_quest_features_allowed(v_owner)`. Penilaian rakan bergantung
pada `qm_teams`, yang sudah berada di sebalik sekatan pelan sejak
migrasi 0030, jadi ia mesti konsisten.

Nota PL/pgSQL: `RAISE` menggunakan `%` sebagai pemegang tempat, BUKAN
`%s`. Hanya `format()` menggunakan `%s`. Kesilapan ini sudah berlaku
sekali dalam projek ini dan menghasilkan huruf `s` tersasul dalam mesej
yang dilihat pengguna.

### Fungsi pelajar

    public.qm_peer_my_status(p_round uuid) RETURNS jsonb

SECURITY DEFINER, untuk pelajar. Pulangkan hanya:
sudah hantar atau belum, bilangan rakan yang perlu dinilai, dan bilangan
yang sudah dinilai. TIDAK memulangkan P, F, Fmod, bendera, atau apa-apa
tentang rakan sekumpulan.

## RLS: kerahsiaan ialah masalah pangkalan data, bukan masalah UI

Bahagian 8.5 dokumen melarang pelajar melihat skor individu, identiti
penilai, dan nilai P atau F rakan sekumpulan. Kalau sekatan ini hanya
wujud dalam React, satu panggilan PostgREST terus mendedahkan seluruh
matriks penilaian.

Ini bukan risiko teori. Bahagian 2.7 dokumen memetik satu ujian rawak
terkawal ke atas 223 pelajar di mana sistem telus GAGAL sepenuhnya
kerana pelajar enggan menilai dengan jujur apabila mereka takut rakan
akan tahu. Kebocoran di sini merosakkan seluruh instrumen, bukan sekadar
privasi.

Dasar yang diperlukan:

`qm_peer_rounds`
- SELECT: pendidik kelas, dan ahli kelas itu. Pusingan tidak membawa data
  sulit, dan pelajar perlu tahu bila borang dibuka.
- INSERT, UPDATE, DELETE: pemilik atau pendidik kelas sahaja.

`qm_peer_ratings`
- SELECT: `rater_id = auth.uid()` SAHAJA bagi pelajar, iaitu pelajar
  hanya nampak baris yang dia sendiri TULIS. Ditambah pendidik kelas
  yang nampak semua.
- TIDAK BOLEH ada dasar yang membenarkan `ratee_id = auth.uid()`. Itu
  tepat kebocoran yang dilarang.
- INSERT: `rater_id = auth.uid()` dan pencetus di atas menguatkuasakan
  keahlian dan tetingkap masa.
- UPDATE: `rater_id = auth.uid()` semasa pusingan masih terbuka.
- DELETE: tiada dasar untuk pelajar.

`qm_peer_results`
- SELECT: pendidik kelas SAHAJA. Pelajar TIADA dasar SELECT langsung ke
  atas jadual ini.
- Sebabnya: RLS menapis baris, bukan lajur. Memberi pelajar satu baris
  tentang dirinya akan turut memberinya `p`, `f` dan `pbar`, dan `pbar`
  bersama `f` mendedahkan purata kumpulan. Pelajar mendapat maklumatnya
  melalui `qm_peer_my_status` sahaja.
- INSERT, UPDATE, DELETE: tiada dasar. Hanya fungsi pengiraan menulis.

Dalam Fasa 1, pelajar tidak melihat apa-apa keputusan selepas menghantar,
kerana pusingan formatif tidak menghasilkan markah dan Fmod bagi pusingan
formatif tiada makna kepada pelajar. Paparan Fmod kepada pelajar ialah
kerja Fasa 2.

## API

Semua laluan menggunakan token Bearer, BUKAN kuki. Auth dalam projek ini
berasaskan localStorage dengan `storageKey: 'qm-auth'`. Pembantu kuki
`@supabase/ssr` akan memulangkan "Not authenticated". Ikut corak sedia
ada dalam `src/lib/supabase-route.ts`.

Pendidik, semuanya di bawah `/api/classes/[id]/peer-rounds`:

    GET    /                    senarai pusingan kelas ini
    POST   /                    cipta pusingan
    PATCH  /[roundId]           sunting nama, minggu, tarikh
    DELETE /[roundId]           hanya jika tiada rekod penilaian lagi
    POST   /[roundId]/compute   jalankan qm_peer_compute
    GET    /[roundId]/results   baris keputusan penuh untuk papan pemuka

`GET /[roundId]/results` memulangkan satu baris bagi setiap pelajar
dengan nama, kumpulan, P, F, Fmod, bendera, SEMAK, KUMPULAN BERISIKO,
ditambah senarai justifikasi yang dikumpulkan mengikut pelajar yang
dinilai, dan senarai ahli yang TIDAK menghantar borang.

Senarai tidak menghantar itu wajib. Bahagian 5.4 dokumen berkata
ketidakhadiran borang dikenakan penalti mengikut peraturan lewat kursus,
jadi pensyarah perlu tahu siapa. Sistem hanya melaporkan, tidak
menghukum.

Pelajar:

    GET  /api/peer-rounds/[roundId]/form
    POST /api/peer-rounds/[roundId]/ratings

`GET form` memulangkan senarai rakan sekumpulan yang perlu dinilai, tanpa
diri sendiri, dan menyatakan sama ada sudah dihantar. `POST ratings`
menerima semua rakan dalam satu badan dan menulis dalam SATU transaksi.
Penghantaran separuh jadi lebih teruk daripada tiada penghantaran, kerana
`r(i)` rakan lain akan tidak lengkap tanpa sesiapa menyedarinya.

Semua ralat pangkalan data ditukar kepada ayat yang boleh dibaca melalui
`mesejHad` dalam `src/lib/pelan.ts`. Tambah kod baharu ke dalam peta
`MESEJ` di sana:

    QM_PEER_MAX_ROUNDS  'A class can have at most six evaluation rounds.'
    QM_PEER_CLOSED      'This evaluation round is closed.'
    QM_PEER_NOT_MEMBER  'You are not a member of this group.'
    QM_PEER_SELF        'You cannot evaluate yourself.'
    QM_PEER_JUSTIFY     'Please explain any score of 0 or 1.'

## UI pendidik

Halaman baharu: `src/app/educator/classes/[id]/peer-review/page.tsx`

Pautan masuk: tambah satu kad atau butang pada
`src/app/educator/classes/[id]/page.tsx`, berdekatan dengan bahagian
Teams sedia ada. Jangan tambah tab baharu pada bar sisi aras atas.
`src/lib/eduTabs.tsx` sengaja dikurangkan kepada tiga destinasi dalam
kerja terdahulu, dan komennya menjelaskan sebabnya. Hormati keputusan itu.

Halaman ini ada dua bahagian.

**Bahagian pusingan.** Senarai pusingan sedia ada dengan status:
akan datang, terbuka, tertutup, sudah dikira. Butang cipta pusingan.
Butang kira semula bagi pusingan yang sudah tertutup.

Apabila kelas ini belum ada sebarang pusingan, papar cadangan templat
empat pusingan: tiga formatif berlabel minggu 4, 6 dan 9, dan satu
sumatif berlabel minggu 14. Dalam Fasa 1 pusingan sumatif belum boleh
dicipta, jadi templat Fasa 1 mencadangkan TIGA pusingan formatif sahaja
dan menyatakan bahawa pusingan bermarkah akan datang kemudian.

Dialog templat mempunyai satu medan di bahagian atas, "semester start
date". Apabila diisi, tarikh setiap pusingan dikira sebagai minggu
dikurang satu, didarab tujuh hari, ditambah kepada tarikh mula, dan
ditutup tujuh hari selepas dibuka. Pensyarah boleh menyunting
mana-mana tarikh selepas itu. Tarikh mula semester ini TIDAK disimpan
di mana-mana. Ia hanya alat pengiraan dalam borang.

**Amaran satu pusingan.** Apabila pensyarah menyimpan keadaan di mana
kelas itu hanya akan ada SATU pusingan, papar kotak amaran sekali:
penilaian sekali sahaja memberi ukuran tetapi tidak memberi pengesanan
awal, dan masalah kumpulan hanya akan kelihatan selepas semuanya
berakhir. Butang teruskan dan butang tambah pusingan. Jangan halang,
dan jangan ulang amaran ini pada simpanan berikutnya.

**Amaran kumpulan dua orang.** Apabila mana-mana kumpulan peringkat kelas
hanya mempunyai dua ahli, papar amaran pada bahagian pusingan: setiap
ahli hanya menerima satu penilaian, jadi `r(i) = 1`, tiada pelarasan
dibuat dan kedua-duanya akan ditandakan SEMAK. Bahagian 5.4 dan 9.4
dokumen. Amaran sahaja, bukan sekatan.

**Bahagian keputusan.** Satu baris bagi setiap pelajar, dikumpulkan
mengikut kumpulan, diwarnakan mengikut bendera. Lajur: nama, kumpulan,
P, F, Fmod, bendera, SEMAK. Penapis: semua, MERAH sahaja, SEMAK sahaja,
kumpulan berisiko sahaja, belum hantar.

Penapis MERAH dan SEMAK itu ialah senarai kerja sebenar pensyarah
mengikut Bahagian 8.4, jadi jadikan ia mudah dicapai, bukan tersembunyi
dalam menu.

Justifikasi dipaparkan apabila satu baris dibuka, dikumpulkan mengikut
pelajar yang dinilai, TANPA nama penilai. Identiti penilai tidak pernah
dihantar ke pelayar, bukan sekadar disembunyikan dalam CSS.

Bahasa UI: Bahasa Inggeris, sepadan dengan bahagian dalam aplikasi
pendidik. Gaya: violet dan indigo, `rounded-xl`, sepadan dengan skrin
sedia ada.

## UI pelajar

Halaman baharu: `src/app/participant/peer-review/[roundId]/page.tsx`

Pautan masuk: sepanduk pada `src/app/participant/teams/page.tsx` dan
`src/app/participant/home/page.tsx` apabila ada pusingan terbuka yang
pelajar itu belum hantar. Sepanduk hilang selepas dihantar.

Borang: satu kad bagi setiap rakan sekumpulan. Lima kriteria, tiga
butang setiap satu, berlabel Never, Sometimes, Always. Kotak justifikasi
muncul secara automatik apabila mana-mana kriteria dipilih 0 atau 1, dan
butang hantar kekal mati sehingga ia diisi.

Diri sendiri TIDAK muncul dalam senarai. Bukan dikelabukan, bukan
dipaparkan sebagai dibaca sahaja. Tidak muncul.

Satu ayat di bahagian atas borang, dalam Bahasa Inggeris: penilaian ini
sulit, rakan anda tidak akan melihat skor atau siapa memberinya, dan
hanya pensyarah melihat data mentah. Ayat ini bukan hiasan. Bahagian 2.7
dokumen menunjukkan pelajar tidak menilai dengan jujur melainkan mereka
percaya ini benar.

Selepas hantar: skrin pengesahan ringkas sahaja. Tiada skor, tiada
keputusan, tiada apa-apa tentang rakan.

## Ujian penerimaan

Tiga contoh bekerja dalam Bahagian 6 dokumen ialah ujian yang mengikat.
Bina ujian yang menyemak nombor tepat ini.

**Ujian 1, Contoh A dokumen.** Kumpulan empat orang, matriks penilaian
seperti dalam dokumen, semua menghantar.

| Pelajar | T | r | P | F | Fmod | bendera | SEMAK |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Aisyah | 28 | 3 | 9.3333 | 1.1429 | 1.0000 | HIJAU | tidak |
| Baharu | 27 | 3 | 9.0000 | 1.1020 | 1.0000 | HIJAU | tidak |
| Chong | 28 | 3 | 9.3333 | 1.1429 | 1.0000 | HIJAU | tidak |
| Devi | 15 | 3 | 5.0000 | 0.6122 | 0.7000 | MERAH | YA |

Pbar = 8.1667. Kalau F Devi keluar sebagai 0.6124 atau apa-apa selain
0.6122, anda membundarkan P sebelum membahagi. Betulkan.

**Ujian 2, Contoh B dokumen.** Kumpulan tiga orang, semua memberi 9
kepada semua. Semua P = 9.0000, Pbar = 9.0000, semua F = 1.0000, semua
Fmod = 1.0000, semua HIJAU, tiada SEMAK. Instrumen tidak menghukum
kumpulan yang berfungsi.

**Ujian 3, Contoh C dokumen.** Kumpulan empat orang, Pbar = 7.5000.

| Pelajar | P | F | Fmod | bendera |
| --- | --- | --- | --- | --- |
| Farid | 9.0000 | 1.2000 | 1.0000 | HIJAU |
| Gina | 8.0000 | 1.0667 | 1.0000 | HIJAU |
| Hakim | 7.0000 | 0.9333 | 0.9333 | KUNING |
| Intan | 6.0000 | 0.8000 | 0.8000 | MERAH |

Intan ialah ujian sempadan yang paling penting. F dia tepat 0.8000, jadi
syarat `F < 0.80` adalah PALSU. Dia menjadi MERAH melalui syarat
`P <= 6.0` sahaja. Kalau Intan keluar sebagai KUNING, syarat P anda
salah. Tiada rekod dalam ujian ini ditandakan SEMAK, kerana tiada F
jatuh di bawah lantai 0.70.

**Ujian 4, ahli tidak sah.** Kumpulan empat orang di mana hanya seorang
menilai Ahli D, jadi `r(D) = 1`. Ahli D mesti: `valid = false`,
`p = NULL`, `f = NULL`, `f_mod = 1.0000`, `flag = NULL`,
`needs_review = true`. Dan Pbar mesti dikira daripada TIGA ahli lain
sahaja, bukan dibahagi empat.

**Ujian 5, `r(i)` bukan `n - 1`.** Kumpulan empat orang di mana seorang
ahli tidak menghantar borang langsung. Setiap ahli lain menerima dua
penilaian, bukan tiga. P mesti dikira dengan pembahagi 2. Kalau
pembahagi 3 digunakan, setiap P akan terlalu rendah kira-kira satu
pertiga dan tiada ralat akan muncul. Ini kegagalan senyap yang paling
mungkin berlaku dalam keseluruhan ciri ini.

**Ujian 6, kumpulan berisiko.** Kumpulan dengan dua ahli MERAH dalam
pusingan sama: `team_at_risk = true` bagi SEMUA ahli kumpulan itu,
termasuk yang HIJAU.

**Ujian 7, kerahsiaan.** Log masuk sebagai pelajar dan cuba baca
`qm_peer_ratings` di mana `ratee_id` ialah diri sendiri. Mesti
memulangkan sifar baris. Kemudian cuba `qm_peer_results` di mana
`user_id` ialah diri sendiri. Mesti memulangkan sifar baris. Jalankan
kedua-duanya melalui klien Supabase sebenar, bukan melalui UI, kerana UI
bukan yang kita uji di sini.

**Ujian 8, penilaian kendiri.** Cuba INSERT dengan
`rater_id = ratee_id`. Mesti ditolak oleh pangkalan data.

**Ujian 9, justifikasi.** INSERT dengan satu kriteria bernilai 1 dan
justifikasi kosong mesti ditolak. Dengan kelima-lima bernilai 2 dan
justifikasi kosong mesti diterima.

**Ujian 10, tetingkap masa.** INSERT sebelum `opens_at` dan selepas
`closes_at` mesti ditolak.

**Ujian 11, had pusingan.** Pusingan ketujuh dalam satu kelas mesti
ditolak dengan `QM_PEER_MAX_ROUNDS`, dan pensyarah melihat ayat Bahasa
Inggeris, bukan teks Postgres mentah.

**Ujian 12, pelan percuma.** Pensyarah pelan percuma melihat mesej pelan
yang betul apabila cuba mencipta pusingan, bukan ralat mentah.

**Ujian 13.** `npx tsc --noEmit` bersih dan `npm run build` berjaya.

Tulis ujian 1 hingga 6 sebagai skrip SQL dalam
`supabase/tests/penilaian-rakan.sql` yang boleh dijalankan berulang.
Skrip itu mencipta data ujiannya sendiri, menjalankan `qm_peer_compute`,
membandingkan dengan nilai yang dijangka, dan RAISE apabila tidak sepadan.
Saya akan menjalankannya pada pelayan sebelum kod ini disentuh oleh
sesiapa yang sebenar.

## Cara bekerja

- Repo tempatan: `C:\Users\Hariz\Projects\questmaster-v2`
- `git pull origin feat/live-quiz` DAHULU.
- Untuk gantian berbilang baris yang rumit, gunakan skrip Python, bukan
  sed atau perl satu baris. Keduanya kerap gagal pada inden dan petikan
  dalam projek ini.
- Komen kod dalam Bahasa Melayu, sepadan dengan gaya migrasi sedia ada.
- Jangan guna em dash di mana-mana, dalam kod, komen atau UI.
- Jangan menterjemah kandungan yang dimasukkan pengguna dalam pangkalan
  data. Hanya rentetan yang ditulis keras dalam `.ts` dan `.tsx`.
- Komit ke `feat/live-quiz` dengan komit konvensional. JANGAN push.
  Claude akan menyemak diff, menjalankan migrasi, menjalankan ujian SQL,
  membina dan melancarkan ke VPS. Anda tidak menyentuh pengeluaran.
- JANGAN jalankan migrasi. Tulis fail SQL sahaja.
- Kalau anda melaporkan bahawa spesifikasi ini bercanggah dengan kod,
  petik nombor baris dan fail. Laporan tanpa petikan akan ditolak. Ini
  berlaku pada kerja terdahulu: tiga percanggahan dilaporkan dan
  ketiga-tiganya tidak wujud dalam fail.
