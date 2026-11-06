# Kuizen Arena

Kuizen Arena ialah ciri kuiz permainan berasaskan peta untuk Kuizen. Pendidik membina **set soalan**, kemudian membuka **sesi** dengan kod 6 aksara. Peserta menyertai tanpa akaun (nama samaran sahaja) dan menjawab soalan sama ada dalam senarai kad atau dengan berjalan di peta 2D.

## Jenis soalan (6)

| Jenis | Keterangan | Bentuk `data` |
|---|---|---|
| `multiple` | Aneka pilihan (2-6 pilihan; lebih daripada satu betul = pilih semua) | `choiceList[{key,text,isAnswer}]` |
| `subjective` | Jawapan pendek; mana-mana varian dalam senarai dikira betul | `answerList[{key,text}]`, `ignoreCase?`, `ignoreSpaces?` |
| `ox` | Betul (o) / Salah (x) | `answer: 'o' \| 'x'` |
| `essay` | Esei; digred manual oleh pendidik | `rubric?`, `maxLength?` |
| `match` | Padankan kiri dengan kanan | `leftItems`, `rightItems`, `answerPairs[{left,right}]` |
| `order` | Susun mengikut turutan betul | `items[{key,text}]` (turutan tatasusunan = jawapan) |

Kunci jawapan (`qm_arena_questions.data`) **tidak pernah** dihantar kepada peserta; laluan peserta hanya memulangkan `PublicQuestion` (`toPublicQuestion()`).

## Mod permainan (5)

- **sequencing**: soalan dijawab ikut turutan (boleh langkau jika `allowPass`).
- **freestyle**: jawab mana-mana soalan, ikut suka.
- **round**: guru menggerakkan soalan serentak (Seterusnya/Sebelumnya); jawapan pantas dapat bonus.
- **team**: markah dikumpul ikut pasukan (2-4 pasukan).
- **coop**: seluruh kelas mengejar sasaran markah bersama (`coopTargetPct`, lalai 70%).

## Paparan: senarai vs peta

- **list**: kad soalan biasa, sesuai untuk telefon.
- **map**: peta 2D (Canvas 2D, peta `kampus` dan `pulau`). Avatar berjalan ke objek soalan; sentuh objek untuk membuka soalan. Soalan yang sudah dijawab dilukis kelabu, soalan berkunci tidak boleh dibuka.

## Peraturan kehadiran

Pemain **tidak pernah dibuang** apabila terputus (pengajaran penting). Status dikira daripada `last_seen_at`:
`online` (< 20 s), `away` (< 120 s), `offline` (lebih lama). Pemain kekal dalam senarai dan markahnya kekal; sambung semula dengan `playerToken` yang sama (disimpan dalam localStorage kunci `arena:KOD`).

## Laluan API

Pendidik (header `Authorization: Bearer <token>`, pemilik set atau admin):

| Kaedah | Laluan | Catatan |
|---|---|---|
| GET / POST | `/api/arena/sets` | senarai set / cipta set |
| GET / PATCH / DELETE | `/api/arena/sets/[setId]` | set + soalan penuh (dengan kunci jawapan) |
| POST / PUT | `/api/arena/sets/[setId]/questions` | tambah soalan (satu atau `{questions:[]}`) / susun semula `{order}` |
| PATCH / DELETE | `/api/arena/questions/[questionId]` | ubah / padam soalan |
| GET / POST | `/api/arena/sets/[setId]/sessions` | senarai sesi / buka sesi `{mode, view, mapId?, teamCount?}` |
| GET | `/api/arena/sessions/[sessionId]` | papan pemuka hos (pemain, jawapan, pasukan, coop) |
| POST | `/api/arena/sessions/[sessionId]/control` | `start`, `end`, `freeze`, `unfreeze`, `next`, `prev`, `restart` (Start Together), `set_time_limit` |
| PATCH | `/api/arena/answers/[answerId]/grade` | gred esei `{isCorrect, score?}` |
| POST | `/api/arena/sets/[setId]/ai-generate` | jana soalan AI (tidak disimpan) |
| GET | `/api/arena/template` | muat turun templat CSV import (tanpa auth, tiada data pengguna) |
| POST | `/api/arena/sets/[setId]/import` | import soalan `{format, content}` (pemilik set sahaja) |

Peserta (header `x-player-token`, tanpa akaun):

| Kaedah | Laluan | Catatan |
|---|---|---|
| POST | `/api/arena/play/[code]/join` | `{nickname, avatar?, team?, playerToken?}`; 409 jika nama diambil / sesi tamat |
| GET | `/api/arena/play/[code]/state` | keadaan sesi, pemain, ranking (tinjauan berkala) |
| GET | `/api/arena/play/[code]/questions` | soalan awam + `available` / `locked` |
| POST | `/api/arena/play/[code]/answer` | `{questionId, answer, elapsedMs?, pass?}` |
| POST | `/api/arena/play/[code]/move` | `{x, y}` (peta) |

## Import soalan

Pendidik boleh menambah banyak soalan sekali gus melalui tiga format, dalam bahagian
"Import soalan" pada editor set (`/educator/arena/[setId]`).

- **Templat CSV / Excel**: muat turun `GET /api/arena/template` (BOM UTF-8 supaya Excel
  Windows membaca aksara beraksen dengan betul), isikan dalam Excel, muat naik fail
  `.xlsx` atau `.csv` (CSV dari Excel Malaysia boleh guna pembatas `;`).
- **Aiken**: format teks piawai Moodle, sama seperti Live Quiz. Tampal terus atau muat
  naik fail `.txt`.

Pengepala templat (padanan tidak peka huruf besar/kecil dan ruang):

```
jenis,soalan,pilihan_a,pilihan_b,pilihan_c,pilihan_d,pilihan_e,pilihan_f,jawapan,markah,masa_saat,petunjuk
```

Cara mengisi `jawapan` ikut `jenis`:

| `jenis` | `jawapan` |
|---|---|
| `aneka` (multiple) | huruf pilihan yang betul, satu atau lebih dipisah koma (contoh `A` atau `A,C`); pilihan dalam `pilihan_a..f` |
| `pendek` (subjective) | jawapan yang diterima, dipisah `|` (contoh `Hijau|hijau muda`) |
| `betul_salah` (ox) | `Betul` atau `Salah` (juga `B`/`S`, `O`/`X`, `True`/`False`) |
| `esei` (essay) | rubrik gred (pilihan; dipaparkan kepada pendidik sahaja) |
| `padanan` (match) | diabaikan; setiap `pilihan_x` berbentuk `kiri = kanan` (2-5 pasangan) |
| `susunan` (order) | tiada; `pilihan_a..e` dalam turutan BETUL (2-5 item) |

`markah` lalai 100 (1-10000), `masa_saat` lalai 30 (5-600), `petunjuk` pilihan (teks).
Baris kosong dilangkau; nombor baris ralat ikut baris Excel (pengepala = baris 1).

Had dan tingkah laku (`POST /api/arena/sets/[setId]/import`, pemilik set atau admin):

- CSV/Aiken: 500,000 aksara; xlsx: 2 MB selepas nyahkod base64; jumlah XML selepas
  inflate dihadkan 20 MB (lindung bom zip); maksimum 200 soalan setiap import.
- **Semua atau tiada** untuk xlsx/csv: satu baris rosak memulangkan 400
  `{error:'Some rows are invalid.', errors:[{row,message}]}` dan TIADA soalan disisip.
- Aiken: blok rosak dilangkau; balas `{created, skipped}`. Soalan diimport sebagai
  `origin:'manual'`, `order_idx` bersambung selepas soalan terakhir.
- Fail `.xlsx` dibaca oleh penghurai ZIP sendiri (`src/lib/arena/import.ts`):
  lembaran pertama sahaja, entri dibaca dalam memori, tiada kebergantungan npm baharu.
- Balasan hanya kiraan (`created`, `skipped`); tiada kunci jawapan keluar dari laluan ini.

## Penjanaan soalan AI

`POST /api/arena/sets/[setId]/ai-generate` dengan badan:
`{topic, sourceText?, count? (1-20, lalai 10), types?, language? ('ms'|'en', lalai 'ms'), difficulty? ('mudah'|'sederhana'|'sukar')}`.

- Memanggil Claude Messages API (`fetch` biasa, tiada SDK). Model lalai `claude-sonnet-5-5`, effort `low`, had masa 60 s.
- `sourceText` (dipotong kepada ~12,000 aksara) menjadi satu-satunya sumber fakta.
- Bahasa Melayu ikut gaya DBP; perkataan Bahasa Indonesia dilarang dalam arahan sistem.
- Setiap soalan disahkan dengan `validateQuestion`; yang gagal dikira dalam `rejected`. Kunci pilihan/padanan/turutan dijana semula supaya tidak membocorkan jawapan.
- Respons: `{questions, model, rejected}`. Soalan **tidak disimpan**; UI pendidik menyemak dahulu lalu menghantar ke `/questions`.
- Tiada kunci API: 503 `AI generation not configured: set ANTHROPIC_API_KEY`. Kegagalan lain: 502 (sebab dicatat dalam log pelayan).

## Pangkalan data

Migrasi: `supabase/migrations/0075_arena.sql` (jadual `qm_arena_sets`, `qm_arena_questions`, `qm_arena_sessions`, `qm_arena_players`, `qm_arena_answers`). RLS hidup **tanpa polisi**, jadi semua akses melalui klien service-role di pelayan (`getServiceSupabase`).

Cara memasang:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/migrations/0075_arena.sql
```

Pastikan nama bekas (`supabase-db`) ialah stack Supabase yang betul untuk Kuizen sebelum menjalankannya.

## Pemboleh ubah persekitaran

| Nama | Wajib | Keterangan |
|---|---|---|
| `ANTHROPIC_API_KEY` | Untuk AI sahaja | Kunci Claude API. Tanpanya, penjanaan AI memulangkan 503; ciri lain berfungsi seperti biasa. |
| `ARENA_AI_MODEL` | Tidak | Tukar model AI (lalai `claude-sonnet-5-5`). |

## Had yang diketahui

- **Tinjauan berkala (polling), bukan websocket**: keadaan dan posisi pemain dikemas kini setiap beberapa saat, jadi pergerakan di peta tidak selancar permainan masa nyata sepenuhnya.
- **Canvas 2D, bukan Phaser**: enjin peta ringkas (tiada fizik, animasi asas, dua peta sahaja).
- Penjanaan AI tidak menyimpan soalan dan tidak menyemak fakta secara automatik; pendidik mesti menyemak setiap soalan sebelum disimpan.
- Bonus laju hanya untuk mod `round`; esei perlu digred manual sebelum markah muktamad.
