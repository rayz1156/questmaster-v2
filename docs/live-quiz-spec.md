# Spesifikasi: Kuiz Langsung (Live Quiz) — mod pemain individu

Status: spesifikasi muktamad. Ikut fail ini, jangan reka ganti.
Branch kerja: `feat/live-quiz`. Jangan sentuh branch lain.

## 1. Apa yang dibina

Mod kuiz langsung gaya Kahoot untuk Kuizen. Pendidik cipta satu set soalan
aneka pilihan, mulakan satu sesi langsung, peserta masuk guna kod 6 aksara dan
menjawab seorang demi seorang (individu, bukan pasukan). Markah dikira ikut
betul dan kelajuan. Papan pendahulu dipaparkan selepas setiap soalan.

Ini ciri BARU dan berasingan. Jangan ubah `qm_hunts`, `qm_challenges`,
`qm_submissions` atau mana-mana jadual sedia ada. Semua jadual baharu guna
awalan `qm_live_`.

## 2. Peraturan keselamatan yang tidak boleh dilanggar

Ini bahagian paling penting. Satu kesilapan di sini merosakkan seluruh ciri.

1. **Kunci jawapan tidak boleh sampai ke pelanggan peserta.** Jangan sekali
   guna `select("*")` pada `qm_live_questions` dalam mana-mana laluan yang
   peserta boleh capai. Guna senarai lajur eksplisit tanpa `correct_key`.
2. **Pemarkahan di pelayan sahaja.** Jangan terima markah atau masa daripada
   pelanggan. Kira `ms_taken` daripada `question_started_at` yang disimpan
   dalam pangkalan data, bukan daripada jam pelanggan.
3. **Satu jawapan satu soalan.** Kuatkuasa dengan kekangan unik pada
   `(session_id, player_id, question_id)`, bukan semakan aplikasi sahaja.
4. Jawapan ditolak jika soalan itu bukan soalan semasa atau sesi sudah
   `revealed`/`ended`.
5. Jangan log `correct_key` ke konsol atau log pelayan.

## 3. Skema pangkalan data

Fail: `migrations/0017_live_quiz.sql`. Mesti idempoten
(`create table if not exists`). Akhiri fail dengan
`notify pgrst, 'reload schema';`.

### qm_live_quizzes
| Lajur | Jenis | Nota |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| class_id | uuid not null | fk `qm_classes(id)` on delete cascade |
| owner_id | uuid not null | fk `qm_profiles(id)` on delete cascade |
| title | text not null | |
| description | text | |
| created_at | timestamptz not null | `now()` |

### qm_live_questions
| Lajur | Jenis | Nota |
|---|---|---|
| id | uuid pk | |
| quiz_id | uuid not null | fk `qm_live_quizzes(id)` on delete cascade |
| order_idx | integer not null | mula 0 |
| prompt | text not null | |
| options | jsonb not null | array `[{"key":"A","text":"..."}]`, 2 hingga 6 item |
| correct_key | text not null | **rahsia** |
| points | integer not null | default 1000 |
| time_limit_sec | integer not null | default 20 |

Indeks: `(quiz_id, order_idx)`.

### qm_live_sessions
| Lajur | Jenis | Nota |
|---|---|---|
| id | uuid pk | |
| quiz_id | uuid not null | fk cascade |
| host_id | uuid not null | fk `qm_profiles(id)` |
| code | text not null unique | 6 aksara huruf besar, elak 0/O/1/I |
| status | text not null | `lobby` `asking` `revealed` `ended` |
| current_index | integer not null | default -1 |
| question_started_at | timestamptz | |
| created_at | timestamptz not null | `now()` |
| ended_at | timestamptz | |

Semakan: `status in ('lobby','asking','revealed','ended')`.

### qm_live_players
| Lajur | Jenis | Nota |
|---|---|---|
| id | uuid pk | |
| session_id | uuid not null | fk cascade |
| nickname | text not null | 1 hingga 24 aksara |
| user_id | uuid | boleh null, peserta tanpa akaun dibenarkan |
| player_token | text not null | rawak 32 aksara, rahsia pemain |
| score | integer not null | default 0 |
| total_ms | integer not null | default 0 |
| joined_at | timestamptz not null | `now()` |
| last_seen_at | timestamptz not null | `now()` |

Unik: `(session_id, lower(nickname))` supaya nama tidak bertindih.
Indeks: `(session_id, score desc)`.

### qm_live_answers
| Lajur | Jenis | Nota |
|---|---|---|
| id | uuid pk | |
| session_id | uuid not null | fk cascade |
| player_id | uuid not null | fk cascade |
| question_id | uuid not null | fk cascade |
| choice_key | text not null | |
| is_correct | boolean not null | |
| ms_taken | integer not null | |
| points_awarded | integer not null | |
| created_at | timestamptz not null | `now()` |

**Unik: `(session_id, player_id, question_id)`.** Ini yang menghalang jawapan
berulang.

### RLS
Hidupkan RLS pada kelima-lima jadual. Dasar:
- Pemilik dan pendidik kelas: akses penuh pada kuiz dan soalan miliknya
  (guna corak `qm_is_class_educator(class_id)` seperti `qm_hunts`).
- Admin: akses penuh (`qm_is_admin()`).
- Peserta tanpa akaun tidak melalui RLS langsung. Semua laluan peserta guna
  `getServiceSupabase()` di pelayan dan menapis lajur sendiri.

## 4. Pemarkahan

Gaya Kahoot. Jawapan salah atau tiada jawapan dapat 0.

```
ratio  = max(0, 1 - ms_taken / (time_limit_sec * 1000))
points = round(question.points * (0.5 + 0.5 * ratio))
```

Jadi jawapan betul paling laju dapat penuh, jawapan betul saat terakhir dapat
separuh. Kira semuanya di pelayan.

## 5. Kontrak API

Semua di bawah `src/app/api/live/`. Balasan JSON.

### Laluan hos (perlu Bearer token, peranan educator atau admin)

Guna `requireUser(req)` dari `src/lib/supabase-route.ts`, kemudian sahkan
pengguna ialah pendidik kelas berkenaan.

| Kaedah | Laluan | Badan | Balasan |
|---|---|---|---|
| POST | `/api/live/quizzes` | `{classId,title,description?}` | kuiz |
| GET | `/api/live/quizzes?classId=` | | senarai kuiz |
| GET | `/api/live/quizzes/[quizId]` | | kuiz + soalan (hos nampak `correct_key`) |
| PATCH | `/api/live/quizzes/[quizId]` | `{title?,description?}` | kuiz |
| DELETE | `/api/live/quizzes/[quizId]` | | `{ok:true}` |
| POST | `/api/live/quizzes/[quizId]/questions` | soalan | soalan |
| PATCH | `/api/live/questions/[questionId]` | separa | soalan |
| DELETE | `/api/live/questions/[questionId]` | | `{ok:true}` |
| POST | `/api/live/quizzes/[quizId]/import-aiken` | `{content}` | `{created:n}` |
| POST | `/api/live/quizzes/[quizId]/sessions` | | `{sessionId,code}` |
| GET | `/api/live/sessions/[sessionId]` | | keadaan hos penuh |
| POST | `/api/live/sessions/[sessionId]/control` | `{action}` | keadaan hos |

`action` yang sah: `start` `next` `reveal` `end` `reset`.
- `start`: `lobby` ke `asking`, `current_index` jadi 0, set `question_started_at`
- `next`: ke soalan berikut, status `asking`, set semula `question_started_at`
- `reveal`: status `revealed`, tutup jawapan bagi soalan semasa
- `end`: status `ended`, set `ended_at`
- `reset`: status kembali `lobby`, `current_index` -1, padam `qm_live_answers`
  dan set semula skor pemain kepada 0 (jangan padam pemain)

### Laluan peserta (tiada Bearer token, guna `player_token`)

Guna `getServiceSupabase()`. Kod sesi dalam laluan URL.

**POST `/api/live/play/[code]/join`**
Badan `{nickname}`. Balas `{playerId, playerToken, sessionId, status}`.
Tolak jika sesi `ended`, atau nama sudah diambil (balas 409 dengan mesej jelas).

**GET `/api/live/play/[code]/state?playerId=&fp=`**
Ditinjau setiap 2 saat. Balasan bila tiada perubahan: `{noChange:true, fp}`.
Balasan penuh:
```json
{
  "fp": "<cap jari>",
  "status": "asking",
  "questionIndex": 0,
  "totalQuestions": 10,
  "serverNow": "<iso>",
  "questionStartedAt": "<iso>",
  "timeLimitSec": 20,
  "question": { "id": "...", "prompt": "...", "options": [{"key":"A","text":"..."}] },
  "myAnswer": { "choiceKey": "B", "locked": true },
  "reveal": null
}
```
`question` **tidak sekali-kali** mengandungi `correct_key`.
Apabila `status` ialah `revealed`, isi `reveal`:
`{"correctKey":"C","myChoice":"B","isCorrect":false,"pointsAwarded":0,"rank":7,"score":2400}`.
Barulah kunci jawapan dihantar, selepas soalan ditutup.

Cap jari (`fp`) ialah hash pendek bagi
`status + current_index + question_started_at + kiraan pemain`. Jika `fp` yang
dihantar sama, balas `noChange`.

**POST `/api/live/play/[code]/answer`**
Badan `{playerId, playerToken, questionId, choiceKey}`.
Sahkan `playerToken` padan dengan pemain. Sahkan `questionId` ialah soalan
semasa dan `status` ialah `asking`. Kira `ms_taken` daripada
`question_started_at`. Balas `{ok:true, locked:true}` tanpa memberitahu betul
atau salah. Betul atau salah hanya didedahkan semasa `reveal`.

**GET `/api/live/play/[code]/leaderboard`**
Balas 20 teratas: `[{rank, nickname, score}]`. Tiada ID dalaman.

## 6. Halaman UI

Ikut gaya sedia ada dalam repo (Tailwind, komponen yang sudah wujud).
Semua teks antara muka dalam Bahasa Melayu.

| Laluan | Untuk | Kandungan |
|---|---|---|
| `/educator/live` | pendidik | senarai kuiz langsung, butang cipta |
| `/educator/live/[quizId]` | pendidik | editor soalan, import Aiken, butang mula sesi |
| `/educator/live/session/[sessionId]` | pendidik | panel kawalan hos |
| `/live` | peserta | borang masuk kod |
| `/live/[code]` | peserta | skrin main |

Panel kawalan hos memaparkan: kod sesi besar, bilangan pemain dalam lobi,
soalan semasa, taburan jawapan (berapa pilih A/B/C/D), butang
Mula / Dedah / Seterusnya / Tamat / Set semula, dan papan pendahulu.
Tinjau `/api/live/sessions/[sessionId]` setiap 2 saat.

Skrin peserta: papar soalan dan pilihan sebagai butang besar, pemasa kira
detik, kunci selepas hantar, papar keputusan semasa `reveal`, papar papan
pendahulu antara soalan, dan skrin akhir dengan jumlah markah dan pangkat.
Tinjau `state` setiap 2 saat dengan `fp`.

Halaman yang membaca parameter pertanyaan mesti bungkus pengguna
`useSearchParams()` dalam `<Suspense>` dan `export const dynamic = "force-dynamic"`,
jika tidak binaan gagal pada prerender.

## 7. Import Aiken

Format sama seperti Moodle:
```
Apakah ibu negara Malaysia?
A. Johor Bahru
B. Kuala Lumpur
C. Ipoh
ANSWER: B
```
Pecah ikut baris kosong. Baris pertama ialah soalan (boleh berbilang baris
sehingga jumpa baris pilihan pertama). Pilihan bermula dengan huruf diikuti
`.` atau `)`. Baris `ANSWER:` menentukan `correct_key`. Langkau blok yang
rosak dan laporkan bilangan yang dilangkau, jangan gagalkan keseluruhan import.

## 8. Kriteria penerimaan

1. `npx tsc --noEmit` lulus tanpa ralat.
2. `npm run build` berjaya.
3. Tiada `correct_key` dalam mana-mana balasan laluan `/api/live/play/`.
   Sahkan dengan `grep -rn "correct_key" src/app/api/live/play/` dan pastikan
   ia hanya muncul dalam logik pemarkahan pelayan dan blok `reveal`.
4. Dua penyemak imbas boleh masuk sesi yang sama dengan nama berbeza, menjawab,
   dan melihat papan pendahulu yang betul.
5. Menghantar jawapan dua kali untuk soalan sama ditolak.
6. Migrasi boleh dijalankan dua kali tanpa ralat.
