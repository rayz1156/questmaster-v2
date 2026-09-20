# questmaster-v2 (Kuizen)

Next.js 14 App Router, TypeScript, Tailwind, self-hosted Supabase. Runs on the
Hostinger VPS as PM2 process `questmaster-v2` on port 3004, served at
**https://kuizen.fun**. `cendekia.airiz.tech` is the old domain and now 301s.

VPS access, the deploy sequence, the Supabase container-name collision and the
web-terminal traps are in the `hostinger-vps` skill. This file is only about
this codebase.

## Before you write code

```bash
cd /var/www/questmaster-v2 && git branch --show-current && git status --short && git log --oneline -5
```

Feature branches carry real work and are not always merged. Check which branch
is actually built and running before assuming `main` is current.

## Auth: the mistake everyone makes

Authentication is **localStorage-based, not cookie-based**. The Supabase client
is created with `createClient` and `storageKey: 'qm-auth'`.

Server routes that need the user's identity must read the
`Authorization: Bearer <access_token>` header. **Do not use the `@supabase/ssr`
cookie helpers.** They compile, they look right, and they return
"Not authenticated" at runtime.

The working pattern:

```ts
// client
const { data: { session } } = await supabase.auth.getSession();
fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });

// server
const owner = await requireClassMember(req, params.classId); // or requireUser(req)
if (owner.response) return owner.response;
```

`requireUser` and `requireClassMember` live in `src/lib/supabase-route.ts` and
return `{ user, supa, response }`. `getServiceSupabase()` gives a service-role
client for the public schema.

## Schema traps

Table and column names do not match what you would guess.

| Guess | Reality |
|---|---|
| `qm_classes.title` | `qm_classes.name` |
| `qm_class_educators.user_id` | `qm_class_educators.educator_id` |
| `qm_class_educators.id`, `qm_class_members.id` | no `id` column, composite keys |
| "quests" | `qm_hunts`, questions inside are `qm_challenges` |
| submissions have a `score` | they do not; time is `created_at`, linked by `challenge_id` |

Board hierarchy: `qm_learning_boards` then `qm_learning_columns` then
`qm_learning_cards`.

Roles live in `qm_profiles.role`: participant, educator, admin, superadmin.
The same table carries `suspended`, `approved`, `can_upload_files`.

**`qm_challenges.answer` is the answer key.** Never `select("*")` on that table
in anything a participant can reach. Use the explicit column list in
`src/lib/mcp/schema.ts` (`COLUMNS.challengeSafe`).

## Learning board route contracts

The casing flips between routes. This costs an hour if you assume consistency.

**Create a card**, `POST /api/learning-boards/[classId]/cards`, body is
**camelCase**: `columnId`, `cardType`, `title`, `description`, `linkUrl`,
`imageUrl`, `fileUrl`, `fileluFileCode`, `chatbotUrl`, `youtubeUrl`,
`insertIndex`. Both `columnId` and `cardType` are required. Valid `cardType`:
`link image text file chatbot youtube`, and `youtube` is stored as
`card_type: 'video'`.

**Update a card**, `PATCH /api/learning-boards/[classId]/cards/[cardId]`, body
is **snake_case**: `title`, `description`, `link_url`, `image_url`,
`column_id`, `position`.

Routes are keyed on **`classId`, never `boardId`**. Map board to class first.

Position is computed by the create route as `MAX(position)+1`, and
`insertIndex` shifts existing cards. Anything that writes cards directly to
Supabase bypasses this and every card lands at position 0. Call the route.

Existing rows can have tied positions. The app orders by `position` alone, so
ties display in arbitrary order. Renumber a column when it matters.

## Storage is FileLu S5, not Supabase Storage

`src/lib/s5.ts` wraps an S3-compatible endpoint (`FILELU_S5_*` env vars).
Helpers: `s5PutObject`, `s5PutStream`, `s5PresignPut`, `s5PresignGet`,
`s5HeadObject`, `s5ObjectKey`, `s5FileCode`, `s5PublicUrl`.

Object keys are always server-generated as `qm/{uuid}-{safeName}`. A
`file_code` is `s5__` plus base64url of the key, and
`/api/learning-boards/{classId}/file-redirect/{fileCode}` streams it back with
the right content type.

**The S3 client sets `requestChecksumCalculation: 'WHEN_REQUIRED'` on purpose.**
Without it the AWS SDK v3 uses `Content-Encoding: aws-chunked` for streamed
bodies, FileLu answers `NotImplemented`, and every streaming upload fails with
a 500. Do not remove it.

## Uploads

Three paths, in order of preference.

1. **Signed ticket**, for files on someone's computer.
   `POST /api/learning-boards/[classId]/upload/ticket` returns a presigned PUT
   URL valid 15 minutes, the client PUTs straight to storage, then
   `POST .../upload/finalize` verifies the object exists before returning a
   `file_code`. Tickets are single use, enforced by a conditional update on
   `consumed_at`. This bypasses Nginx and Node entirely, so size is unlimited.
2. **`sourceUrl`**, for files already on the web. `POST .../upload-file` with a
   JSON body. SSRF defences live in `src/lib/upload-guard.ts`: https only,
   private and reserved ranges blocked on the resolved address via a `lookup`
   hook, every redirect hop revalidated, streamed to disk with a free-space
   check, no credentials sent outbound, type sniffed from the bytes.
3. **multipart**, the original UI path.

`MAX_UPLOAD_BYTES` is an env-var valve that defaults to unlimited. Disk space
is the real limit.

## MCP server

Lives at `https://kuizen.fun/api/mcp`, full OAuth 2.1, tools filtered by role.

- `src/lib/mcp/session.ts`: `getSession` returns `McpSession` including
  `accessToken`, which tools use to call the app's own routes as the user.
- `src/lib/mcp/api.ts`: `callApi` and `uploadFile`.
- `src/lib/mcp/tools.ts`: tool definitions, each declaring `roles` and `write`.
- `src/lib/mcp/schema.ts`: table and safe-column constants.
- OAuth tables live in the `mcp` schema (migration `0014`), tickets in `0016`.

**The rule for tools: if the app already has a route, call it.** Do not copy the
route's business logic into a tool. That is how the position-0 bug happened.

`content_base64` on `upload_board_file` is capped at 16 KB. Base64 costs about
4 tokens per character when a model generates it, so a 71 KB file costs about
380,000 tokens. The cap makes that fail fast rather than slowly.

## Migrations

Numbered SQL in `migrations/`, applied by hand:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres < migrations/00NN_name.sql
```

End every migration that creates a table with `notify pgrst, 'reload schema';`
or PostgREST will not see it. Keep them idempotent
(`create table if not exists`) so a repeated paste is harmless.

## Other things worth knowing

Pages reading query params must wrap the `useSearchParams()` consumer in
`<Suspense>` and usually `export const dynamic = "force-dynamic"`, or the build
fails at prerender.

Email goes out through **Emailit** over SMTP. The routes read `SMTP_*` first
and fall back to `BREVO_SMTP_*`, so the provider can be switched back by
editing `.env.local` alone. Host `smtp.emailit.com`, port 587, STARTTLS,
username is the literal string `emailit`, password is an API key starting
`secret_`. DKIM selector is `emailit`.

The live sender is `noreply@veltrix.technology` with the From name `Kuizen`. It was
chosen over `airizintelligence.com` because its apex SPF already includes Emailit
and it carries exactly one DMARC record, where airizintelligence.com carries
two and is therefore treated as having none. `kuizen.fun` has no email DNS at
all and cannot send until it is added to Emailit and given all five records.
Brevo was the original provider and is why mail went to spam: the From domain
`airizintelligence.com` never had a Brevo `include` in its SPF and had no
Brevo DKIM selector, so every message failed both SPF and DKIM. The same domain
was already fully set up for Emailit on the `emailit.` subdomain.

Two things bite here. Emailit puts MX and SPF on the `emailit.` subdomain and
leaves the apex alone, so the apex SPF and DMARC are yours to add. And a domain
carrying **two** DMARC TXT records is treated as having no DMARC at all, which
is its own deliverability failure; check the count, not just the presence.

Link previews decode HTML entities at extraction time in
`src/app/api/learning-boards/link-preview/route.ts`. The decode is deliberately
**single pass**, so `&amp;lt;script&amp;gt;` becomes `&lt;script&gt;` and not
`<script>`. The card write path stores raw text and must stay that way.

Translate hardcoded strings in source only. Never translate user-entered
content stored in the database, including class names and educator bios. If a
string appears in a `.tsx` or `.ts` file it is fair game; if it only exists in
DB rows, leave it alone.

## Kuiz Langsung (live quiz), mod pemain individu

Ciri gaya Kahoot: pendidik cipta set soalan aneka pilihan, mula satu sesi,
peserta masuk guna kod 6 aksara dan menjawab secara individu. Markah ikut betul
dan kelajuan. Spesifikasi penuh ada di `docs/live-quiz-spec.md`.

Lima jadual `qm_live_*` (migrasi `0017_live_quiz.sql`): `qm_live_quizzes`,
`qm_live_questions`, `qm_live_sessions`, `qm_live_players`, `qm_live_answers`.
Tiada jadual sedia ada diubah.

`qm_live_questions.correct_key` ialah kunci jawapan. Jangan sekali `select("*")`
pada jadual itu dalam apa-apa yang peserta boleh capai. Laluan
`/api/live/play/**` menggunakan senarai lajur eksplisit dan hanya mengambil
`correct_key` dalam pertanyaan berasingan di dalam blok reveal.

Tiada WebSocket. Peserta dan hos meninjau setiap 2 saat dengan cap jari (`fp`);
bila tiada perubahan, pelayan balas `{ noChange: true, fp }`.

### Perangkap: Next.js men-cache panggilan Supabase dalam route handler

Ini memakan satu pusingan ujian penuh. `export const dynamic = 'force-dynamic'`
**tidak mencukupi**. Next.js tetap men-cache panggilan `fetch` yang dibuat oleh
klien Supabase di dalam route handler, jadi laluan tinjauan membeku: `status`
kekal `asking` walaupun pangkalan data sudah `revealed`, dan jawapan pemain
tidak pernah muncul. Gejalanya nampak seperti kuiz tergantung, bukan seperti
masalah cache.

Setiap `route.ts` di bawah `src/app/api/live/` mesti ada:

```ts
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
```

Mana-mana laluan tinjauan baharu memerlukan kedua-duanya.

### Perangkap: pendidik bukan dalam qm_class_members

`qm_class_members` ialah jadual **peserta** (`class_id, user_id, joined_at`).
Pendidik ada dalam `qm_class_educators` (`class_id, educator_id, role,
invited_by, invited_at, accepted_at`). Menyemak kebenaran pendidik terhadap
`qm_class_members` memberi setiap pelajar dalam kelas hak penuh mengawal sesi.
Semak `educator_id` dan pastikan `accepted_at` tidak null, kerana jemputan yang
belum diterima tidak sepatutnya memberi hak.

### Binaan tempatan tanpa .env.local

`npm run build` pada mesin tanpa `.env.local` gagal dengan kira-kira 36 ralat
"Error occurred prerendering page" pada `/admin/*`, `/educator/*`,
`/participant/*` dan `/login`. Itu bukan masalah repo. Halaman tersebut
menghubungi Supabase semasa prerender. Binaan di VPS (yang ada `.env.local`)
lulus dengan sifar ralat. Jangan buang masa memburu ralat ini pada mesin
pembangunan; sahkan binaan di pelayan.

### Perangkap plpgsql: tiga yang memakan satu pusingan ujian

Fungsi `qm_live_join_player` (migrasi 0018) mengunci baris sesi lalu membuat
satu sisipan bersyarat, supaya had pemain dikuatkuasa tanpa perlumbaan. Ia
ditulis dengan betul dari segi logik tetapi gagal sepenuhnya pada masa jalan
tiga kali berturut-turut. Ketiga-tiganya lulus semakan kod dan hanya muncul
apabila fungsi itu benar-benar dipanggil.

**SQLSTATE mesti TEPAT lima aksara.** `using errcode = 'LIVE05'` ada enam
aksara, jadi Postgres menganggapnya nama keadaan dan menukarnya kepada `42704`
sambil membuang mesej asal. Kesannya sesi penuh dipulangkan sebagai 500, bukan
409. Guna lima aksara seperti `LV005`.

**`gen_random_bytes` tidak boleh dicapai.** pgcrypto dipasang dalam skema
`extensions`, bukan `public`. Fungsi dengan `set search_path = public` tidak
nampak ia langsung. Guna `gen_random_uuid()` yang sebahagian teras Postgres:
`substr(replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''),1,32)`.

**Parameter `returns table` berada dalam skop seluruh badan fungsi.** Kalau
namanya sama dengan lajur jadual, rujukan dalam klausa `RETURNING` menjadi
samar pada masa jalan. Layakkan lajur dengan nama jadual:
`returning qm_live_players.id, qm_live_players.player_token into v_id, v_token`.
Menukar nama sasaran `INTO` sahaja TIDAK mencukupi.

Nota keempat: `returns table` memerlukan `return next`. `return` kosong
memulangkan sifar baris walaupun sisipan berjaya.

Pengajaran am: fungsi plpgsql tidak disahkan oleh `npx tsc` mahupun
`npm run build`. Panggil ia terhadap pangkalan data sebenar sebelum percaya ia
berfungsi.

## Istilah antara muka: "Quiz", bukan "Kuiz"

Antara muka Kuizen berbahasa Inggeris (Classes, Activities, Teams). Keputusan
Dr Hariz, 20 September 2026: modul kuiz langsung mesti sepadan, jadi semua
teks yang dilihat pengguna menggunakan **Quiz** dan **Live Quiz**. "Kuiz" hanya
untuk kandungan Bahasa Melayu, bukan untuk UI.

Ini termasuk mesej ralat API, kerana klien memaparkan `json.error` terus kepada
pengguna, dan mesej `raise exception` dalam plpgsql, kerana mesej sesi penuh
dan nama bertindih sampai ke skrin pemain (migrasi `0019`).

Komen sumber, nama pemboleh ubah dan nama fungsi dalaman kekal Bahasa Melayu.
Jangan menterjemah nama seperti `soalanSemasa` atau `SenaraiKuiz`: ia bukan
teks pengguna dan menukarnya hanya menambah risiko tanpa faedah.

## Import CSV soalan

Pendidik memuat turun templat dari `GET /api/live/quiz-template` (tanpa auth,
fail kosong), mengisinya dalam Excel, dan memuat naik ke
`POST /api/live/quizzes/[quizId]/import-csv` sebagai `{content}` teks.

Lajur: `question, option_a..option_f, correct, points, seconds`. Hanya
`question`, `option_a`, `option_b` dan `correct` wajib.

Tiga perkara yang sengaja dibuat begini:

**Semua atau tiada.** Satu baris rosak bermakna TIADA soalan dimasukkan dan
balasan 400 membawa `errors: [{row, message}]`. Import separuh jalan adalah
lebih teruk daripada gagal: pendidik tidak tahu baris mana yang sudah masuk.

**Nombor baris mengikut Excel.** `parseCsvRows` MENGEKALKAN baris kosong
supaya "Row 7" dalam mesej ralat benar-benar baris 7 dalam Excel. Jangan
tapis baris kosong di dalam pemecah itu.

**BOM UTF-8 pada templat.** Tanpa BOM, Excel di Windows membaca fail sebagai
ANSI dan merosakkan aksara beraksen apabila pendidik menyimpan semula.

Had: 100 soalan dan ~500 KB setiap muat naik. Ingat `client_max_body_size`
nginx ialah 1 MB; had 500 KB berada di bawahnya dengan sengaja.

Pemecah CSV ditulis sendiri (RFC 4180, mengesan pembatas `,` `;` atau tab).
Tiada kebergantungan baharu ditambah: VPS membina dengan `npm run build` dan
setiap pakej baharu ialah satu lagi perkara yang boleh gagal di sana.

## Pengiraan mata Live Quiz

Satu tempat sahaja: `scoreAnswer()` dalam `src/lib/live-quiz.ts`. Laluan
jawapan memanggilnya. Jangan sekali-kali menyalin formula ke tempat lain.

**Mod kira detik (lalai) sepadan TEPAT dengan Kahoot**, bukan lebih kurang:

    mata = bulat( (1 - (masa / had) / 2) * mata_penuh )

Jadi betul serta-merta dapat 1000, betul pada saat akhir dapat 500, salah dapat
0. Seperti Kahoot, jawapan betul di bawah 0.5 saat sentiasa dapat mata penuh,
supaya kelewatan rangkaian tidak menghukum pemain. `scripts/selftest-live-quiz.ts`
menguji padanan ini pada lapan titik masa; kalau ia gagal, formula sudah
terpesong daripada penanda aras.

**Mod tanpa kira detik** (`use_countdown = false`, migrasi 0020) tiada had masa
dan tiada jam pada skrin pemain, tetapi kelajuan masih dikira:

    mata = bulat( mata_penuh * (0.5 + 0.5 * rentak / (rentak + masa)) )

Lengkung ini menghampiri 50% tanpa pernah rata, jadi dua pemain yang menjawab
pada saat ke-30 dan ke-90 tetap berbeza markah. Dalam mod ini `time_limit_sec`
bukan had, ia rentak rujukan sahaja.

**Jawapan lewat kini dapat sifar.** Sebelum ini jawapan selepas had masa masih
mendapat 500 kerana nisbah diapit pada 0. Klien melumpuhkan butang, tetapi
pelayan tidak, jadi klien yang diubah suai boleh menjawab lewat dan tetap
mendapat separuh mata. Kelonggaran 1.5 saat diberi untuk rangkaian, selepas itu
sifar. `masa` sentiasa dikira di pelayan daripada `question_started_at`; masa
daripada badan permintaan TIDAK pernah dipercayai.

Jalankan `npx tsx scripts/selftest-live-quiz.ts` selepas menyentuh pemarkahan
atau pemecah CSV. `npx tsc` dan `npm run build` tidak menangkap kesilapan
formula.
