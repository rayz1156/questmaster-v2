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
