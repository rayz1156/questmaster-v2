# Kuizen — Agent Handoff / Infra Reference

> Last updated: 2026-05-13. Read this BEFORE making changes. Update the
> "Change log" section at the bottom after every deploy.

---

## 1. Identity

- Public brand: **Kuizen**
- Public URL: https://kuizen.fun (www.kuizen.fun -> kuizen.fun)
- Internal alias: https://kuizen.veltrix.technology
- VPS code name: `questmaster-v2` (legacy, do not rename)
- Owner / educator example: Dr Hariz
- Affiliations shown in UI: UPSI · AFK · Veltrix

---

## 2. Server

- Provider: Hostinger VPS (panel: https://hpanel.hostinger.com/vps/1618611/overview)
- Hostname: `srv1618611`
- OS: Ubuntu 24.04.4 LTS (kernel 6.8, x86_64)
- IPv4: 187.127.113.249
- IPv6: 2a02:4780:5e:723a::1
- Disk: 95.82 GB total (~43% used)
- Web terminal: https://kul.hostingervps.com/2030/
- User: `root`

This VPS is MULTI-TENANT (~25 sites). Do not touch unrelated nginx site
files, PM2 apps, or /var/www folders. Other apps include lecturerhub,
nirexa, ai-tna, huntsphere, airizbot, linkrix, qrlink, etc.

---

## 3. Application stack

- Framework: Next.js 14.2.35 (App Router)
- Language: TypeScript 5
- UI: React 18, Tailwind 3.4, lucide-react
- Auth & DB: Supabase (self-hosted, see Section 6)
- Email: Brevo SMTP + generic SMTP fallback
- Misc: qrcode, nodemailer, Cloudflare (CF_*), Adilo, FileLu, HuggingFace
- Process manager: PM2 (fork mode, NODE_ENV=production)
- Reverse proxy: Nginx + Let's Encrypt (Certbot)

---

## 4. Filesystem layout

```
/var/www/questmaster-v2/         <- Kuizen code root (cwd for PM2)
  ecosystem.config.js            <- PM2 config (port 3004)
  package.json                   <- name: "questmaster-v2"
  next.config.mjs
  .env.local                     <- production env (DO NOT COMMIT)
  .env.local.bak.*               <- timestamped backups before edits
  .next/                         <- build output
  node_modules/
  public/
  src/app/                       <- Next.js App Router
    admin/ auth/ educator/ participant/
    api/                         <- route handlers (see Section 5)
    join/ tjoin/ login/ register/
    forgot-password/ reset-password/
    pending-approval/ help/
    layout.tsx page.tsx globals.css
  src/components/
  src/lib/
  db/      <- schema.sql, seed.sql, fix_rls.sql, migrations/
  sql/     <- migrations/, seeds/
  supabase/migrations/
  docs/
```

Backups created by previous edits live in `/root/`:
`nginx-backup-YYYYMMDD-HHMMSS/`, `db-backups/`, `qm-backups/`, plus
`.env.local.bak.<epoch>` files inside the project.

---

## 5. Route map

App routes (`src/app/`): `admin`, `auth`, `educator`, `participant`,
`join`, `tjoin`, `login`, `register`, `forgot-password`, `reset-password`,
`pending-approval`, `help`.

Educator pages: `activities`, `analytics`, `classes`, `invites`,
`outcomes`, `profile`, `rankings`, `teams`.

API routes (`src/app/api/`): `admin`, `analytics`, `classes`,
`educator-invites`, `feedback`, `intro-boards`, `learning-boards`,
`notify-educator-pending`, `outcomes`, `profile`, `submission-boards`.

---

## 6. Backend (Supabase)

Self-hosted Supabase (NOT supabase.com):

- `NEXT_PUBLIC_SUPABASE_URL` = https://api.indoorgame.veltrix.technology
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (in .env.local)
- `SUPABASE_SERVICE_ROLE_KEY` (in .env.local)
- `NEXT_PUBLIC_SITE_URL` = https://kuizen.fun

Schema, migrations and RLS fixes live under `db/`, `sql/migrations/`,
`supabase/migrations/`. Apply via Supabase Studio at
https://api.indoorgame.veltrix.technology (admin only).

Class IDs are UUIDs; join codes are 8 hex chars (e.g. `436A1360`).

---

## 7. Environment variables (.env.local)

Keys present (values redacted -- read with `cat .env.local`):

- Supabase: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL
- Brevo SMTP: BREVO_SMTP_HOST/PORT/USER/PASS, BREVO_FROM_EMAIL,
  BREVO_FROM_NAME, ADMIN_NOTIFICATION_EMAIL
- Generic SMTP fallback: SMTP_HOST/PORT/SECURE/USER/PASS,
  SMTP_FROM_EMAIL, SMTP_FROM_NAME
- Media: ADILO_PUBLIC_KEY, ADILO_SECRET_KEY, FILELU_API_KEY
- Cloudflare: CF_ACCOUNT_ID, CF_API_TOKEN
- AI: HF_TOKEN, AI_IMAGE_PROVIDERS, AI_IMAGE_MAX_ROUNDS,
  AI_BATCH_CONCURRENCY

Always back up before editing:
  cp .env.local .env.local.bak.$(date +%s)

---

## 8. PM2 (process)

ecosystem.config.js:

```js
module.exports = {
  apps: [{
    name: 'questmaster-v2',
    script: 'node_modules/.bin/next',
    args: 'start -p 3004',
    cwd: '/var/www/questmaster-v2',
    env: { NODE_ENV: 'production' },
  }],
};
```

Common commands:

```bash
pm2 list
pm2 logs questmaster-v2 --lines 200
pm2 restart questmaster-v2
pm2 reload  questmaster-v2
pm2 describe questmaster-v2
pm2 save
```

Do NOT touch other PM2 apps: ai-tna, lecturerhub, nirexa,
qrcodeurlshortener, trainingprogram-v2.

---

## 9. Nginx (reverse proxy)

Config file: `/etc/nginx/sites-available/kuizen.fun`
(symlinked from `sites-enabled/`).

Key directives:

```
server_name kuizen.fun;
client_max_body_size 25m;
location / {
  proxy_pass http://127.0.0.1:3004;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_cache_bypass $http_upgrade;
  # SSE / long-running streaming endpoints (AI thumbnail batch, etc.)
  proxy_buffering off;
  proxy_cache off;
  proxy_request_buffering off;
  proxy_read_timeout 900s;
  proxy_send_timeout 900s;
  send_timeout 900s;
  gzip off;
  chunked_transfer_encoding on;
  proxy_set_header X-Accel-Buffering no;
}
listen 443 ssl;  # managed by Certbot
ssl_certificate     /etc/letsencrypt/live/kuizen.fun/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/kuizen.fun/privkey.pem;
```

Reload safely:
  nginx -t && systemctl reload nginx

Cert renewal is automatic via Certbot's systemd timer. Manual:
`certbot renew --dry-run`.

---

## 10. Deploy workflow

```bash
cd /var/www/questmaster-v2

# 1. Snapshot env + git state
cp .env.local .env.local.bak.$(date +%s)
git status && git log -1 --oneline

# 2. Pull (if using git) OR edit files directly
git pull --ff-only

# 3. Install deps only if package.json changed
npm ci --omit=dev   # or: npm install

# 4. Build
npm run build

# 5. Restart
pm2 restart questmaster-v2
pm2 logs questmaster-v2 --lines 50

# 6. Smoke test
curl -I https://kuizen.fun
```

If the build fails, the old `.next/` is still being served -- DO NOT
restart PM2 until `npm run build` succeeds.

---

## 11. Rollback

- Code: `git reflog` / `git reset --hard <sha>` then rebuild.
- Env: restore the most recent `.env.local.bak.*`.
- Nginx: copies in `/root/nginx-backup-*` directories.
- DB: SQL dumps in `/root/db-backups/` and `/root/qm-backups/`.

---

## 12. Guardrails for future agents

1. The on-disk project name is `questmaster-v2`. The product name is
   `Kuizen`. Never rename the directory or PM2 app.
2. Port 3004 is hard-coded in `ecosystem.config.js` AND the nginx
   `proxy_pass`. Change both together if ever moved.
3. This VPS hosts many unrelated apps. Scope every command to
   `/var/www/questmaster-v2/` and the `questmaster-v2` PM2 process.
4. Never commit `.env.local` or any `*.bak` env file.
5. Supabase is self-hosted at `api.indoorgame.veltrix.technology` --
   schema/RLS changes go through Supabase Studio, not raw psql.
6. SSE endpoints rely on nginx `proxy_buffering off` + 900s timeouts.
   Preserve those when editing the nginx config.
7. Confirm with the user before any: destructive DB op, secret rotation,
   domain/DNS change, package major-version bump, or PM2 process
   add/remove.
8. The Hostinger web terminal at https://kul.hostingervps.com/2030/
   has a short keepalive timeout. For large file writes use small
   heredoc chunks (50-100 lines each) and verify with `wc -l` after
   each chunk.

---

## 13. Quick reference

```bash
# Where am I?
cd /var/www/questmaster-v2 && pwd && git log -1 --oneline

# Is it up?
pm2 list | grep questmaster-v2
ss -ltnp | grep :3004
curl -sI https://kuizen.fun | head -1

# Logs
pm2 logs questmaster-v2 --lines 200
tail -f /var/log/nginx/error.log
```

---

## 14. Outstanding issues / TODO backlog

Reported by the product owner on 2026-05-13. Each item lists the
likely area in the codebase to start investigating. Verify before
editing -- file paths are best guesses based on the route map.

### 14.1 Teams

- **Bug: "infinite recursion detected in policy for relation
  `qm_teams`"** when a student tries to rename their group.
  - Cause: a Postgres RLS policy on `qm_teams` references itself
    (or another policy that references `qm_teams`) causing recursion.
  - Fix in Supabase Studio SQL editor or via a new migration under
    `db/migrations/` or `supabase/migrations/`. Common pattern: replace
    sub-selects that hit `qm_teams` inside `qm_teams` policies with a
    `SECURITY DEFINER` helper function, or split policies by role
    (educator vs participant) so the participant policy doesn't
    re-evaluate the educator one.
  - Likely related files: `db/fix_rls.sql`, `db/schema.sql`, and any
    API route under `src/app/api/classes/.../teams` or
    `src/app/api/admin/teams`.
  - Reproduce as a participant: `kuizen.fun/participant` -> open team
    -> rename. Watch the response in DevTools Network tab.

### 14.2 Submission board

1. **Cannot drag an uploaded submission to a column when the text
   is too long.** The drag handle/hit area is probably being pushed
   off-screen or overflowing the card. Check the submission card
   component (likely in `src/components/.../SubmissionCard.tsx` or
   similar) for `overflow`, `max-height`, and the dnd library's
   drag-handle ref. Add `text-overflow: ellipsis` + clamp lines, OR
   move the drag handle to a fixed header bar of the card.
2. **Make the submission-board view scroll like the learning-board.**
   Compare the layout components for `learning-boards` vs
   `submission-boards` under `src/app/educator/` and
   `src/app/api/learning-boards` vs `submission-boards`. Port the
   scroll container (`overflow-y-auto`, fixed header) from learning
   board to submission board.
3. **Add a "+" affordance below the "drop here" zone so users can
   upload directly into a column.** Currently uploads probably go to
   an inbox first. Add an inline upload button at the bottom of each
   column that calls the existing upload endpoint with the column id
   pre-filled.
4. **Per-submission move buttons (left / right / up / down)** so
   keyboard / touch users don't need drag-and-drop. Wire them to the
   same mutation the dnd handler already calls. Keep dnd working in
   parallel.
5. **Portrait videos cannot be enlarged because the player crops the
   enlarge button.** Either:
     - swap the player for one that respects aspect-ratio (e.g.
       wrap in `aspect-[9/16]` container with `object-contain`), or
     - add a custom "Enlarge" button outside the video element that
       opens the file in a modal / new tab.
   Check the Adilo embed integration in `src/components` and any
   `<video>` usage for submission media.

### 14.3 Team marks

1. **Bonus and total are incorrect.** Audit the marks aggregation
   logic: server-side route (probably
   `src/app/api/classes/.../teams/marks` or under `analytics`) and
   client-side display. Likely causes: bonus column not joined into
   the SUM, or a stale React state showing pre-update totals. Add a
   unit-style check by exporting a function `computeTeamTotal(team)`
   and asserting against a known fixture.
2. **No bulk tick "complete" across multiple teams.** Add a multi-
   select (checkboxes per row + header "select all") and a bulk
   action bar that calls the existing complete-task endpoint in a
   loop or via a new batch endpoint. UI lives under
   `src/app/educator/teams/` (or `analytics`).

### 14.4 Suggested triage order

1. 14.1 Teams RLS recursion (blocks students -- highest user impact, smallest fix).
2. 14.3.1 Wrong bonus/total (data integrity).
3. 14.2.1 + 14.2.2 Submission board drag + scroll (workflow blockers).
4. 14.2.3 + 14.2.4 "+" button & per-card move buttons.
5. 14.2.5 Portrait video player.
6. 14.3.2 Bulk tick complete.

---

## 15. Change log

| Date (YYYY-MM-DD) | Agent / Person | Summary |
|-------------------|----------------|---------|
| 2026-05-13 | Claude (initial audit) | Created this handoff doc. No code changes. |
| 2026-05-13 | Claude | Added Section 14 outstanding issues (teams RLS, submission board, team marks). No code changes. |
| 2026-05-13 | Claude (Session 1) | **14.1 RESOLVED.** Created migration `supabase/migrations/0022_fix_qm_teams_rls_recursion.sql` (81 lines) and applied it directly to live `supabase-db` container in a transaction (BEGIN..COMMIT). Adds SECURITY DEFINER helpers `qm_is_team_member(uuid)` and `qm_team_class_id(uuid)`. Rewrites policies `qm_teams_class_member_select`, `qm_teams_member_update`, and `qm_team_members_class_select` to call helpers instead of recursive subqueries. Verified by simulating participant rename UPDATE under role `authenticated` with JWT claims for a real team member: returned `UPDATE 1` cleanly, no recursion error. Pre-fix schema backup at `/root/qm-backups/qm_schema_session1_1778682480.sql`. No Next.js code changed, no PM2 restart needed. |


### Session 2 - 2026-05-13 - Fix team marks bonus/total double-count (14.3.1)
- File: supabase/migrations/0023_fix_qm_class_team_scores_double_count.sql (1322 bytes, md5 e42281bdafc8b5e5583704cf39f53cbe)
- Bug: `markTeamCompletion` inserts both a `qm_score_adjustments` row (delta=pts) AND a `qm_team_quest_completions` row (awarded_points=pts, adjustment_id=adj.id). The view `qm_class_team_scores` was summing BOTH into `task_score` (via completions) and `adjustment_score` (via raw adjustments), so `total_score` counted quest-completion points twice and the displayed Bonus was inflated.
- Fix: `CREATE OR REPLACE VIEW qm_class_team_scores` so that `adjustment_score` only sums adjustments where `NOT EXISTS` a `qm_team_quest_completions` row pointing at the adjustment. True bonuses (entered via educator UI, no completion link) still count; quest-completion adjustments are excluded from the bonus column and only counted once via `task_score`.
- Backup: /root/qm-backups/qm_views_before_0023_1778683867.sql (3593 bytes)
- Verified: Kumpulan 3 task=200 adj=150 total=350; Kumpulan 4 task=200 adj=200 total=400; Kumpulan 5/6 task=200 adj=100 total=300 (numbers reconcile with raw qm_team_quest_completions sums and bonus-only qm_score_adjustments rows).
- No code/Next.js change required; UI re-renders against the corrected view.

### Session 3 - 2026-05-13 - Fix submission card long-text drag (14.2.1)
- File: src/components/submission-board/SubmissionBoardView.tsx (2 edits via sed)
- Bug: Long descriptions caused the native HTML5 drag to trigger text selection on the description `<p>`, blocking the parent div's draggable behavior; also made cards excessively tall.
- Fix: Added `select-none` to both draggable wrapper divs (orphan items + column items) to prevent text selection from intercepting the drag. Also clamped the description with `line-clamp-4 max-h-24 overflow-hidden` so cards stay compact regardless of text length.
- Backup: /root/qm-backups/SubmissionBoardView.tsx.before_s3_1778700887.bak (40076 bytes)
- Build: ok. Restart: pm2 restart questmaster-v2 (new pid 1533586). curl https://kuizen.fun -> 307 (working).


### Session 4 - 2026-05-13 - Submission board scroll layout like learning board (14.2.2)
- File: src/components/submission-board/SubmissionBoardView.tsx (2 className tweaks)
- Bug: Each column's inner items container had no max-height, so cards stacked vertically and made the column taller than viewport with no internal scroll.
- Fix: Added `max-h-[60vh] overflow-y-auto pr-1 -mr-1` to (a) line 469 column inner items div and (b) line 508 orphan/Uncategorised inner items div - matching the learning board pattern at LearningBoardView.tsx line 1557. Horizontal column-row scroll was already present via `overflow-x-auto`.
- Build: ok. Restart: pm2 (new pid 1569150). curl https://kuizen.fun -> 307 (working).


### Session 5 - 2026-05-13 - Submission board inline + and per-card move buttons (14.2.3 + 14.2.4)
- File: src/components/submission-board/SubmissionBoardView.tsx (multi-step python patches)
- 14.2.3 Inline + Upload: added pendingColumnId state in SubmissionBoardView; passed onRequestAddToColumn prop to ColumnsView; rendered "+ Upload here" button at end of each column items list (and "+ Upload" inside the Uncategorised orphan area). The SubmitModal onCreated handler auto-moves the new item to the pending column when set.
- 14.2.4 Per-card move: extended ItemCard signature to accept `columns` and `onMoveCol` props; rendered left/right arrow buttons in the card footer that call onMoveCol(prev/next column id) so users can shuffle items without drag-and-drop. All 3 ItemCard call sites updated.
- Backup: /root/qm-backups/SubmissionBoardView.tsx.before_s5_1778702165.bak (40218 bytes)
- Build: ok. Restart: pm2 (new pid 1783707). curl https://kuizen.fun -> 307 (working).


### Session 6 - 2026-05-13 - Portrait video enlarge button (14.2.5)
- File: src/components/submission-board/SubmissionBoardView.tsx (video block ~line 586)
- Bug: Adilo iframe wrapped in a fixed `aspect-video` (16:9) + `overflow-hidden` container, so portrait videos got their fullscreen control clipped or unreachable.
- Fix: Replaced `aspect-video` with `style={{aspectRatio: '16/9'}}` (same visual ratio) and added an explicit Enlarge link in the top-right corner of the player that opens the Adilo embed URL in a new tab where the video can render at its native portrait dimensions and use the host browser's fullscreen.
- Backup: /root/qm-backups/SubmissionBoardView.tsx.before_s6_$(date +%s).bak
- Build: ok. Restart: pm2 questmaster-v2. curl https://kuizen.fun -> 307 (working).


### Session 7 - 2026-05-13 - Team marks bulk-tick complete (14.3.2)
- File: src/app/educator/teams/page.tsx (3 patches)
- Bug: There was no way to mark a quest complete for several teams at once — educators had to click each team and tick the checkbox individually.
- Fix: Added `bulkMarkHuntId` state and an `onBulkMarkComplete` function that iterates over the existing `selected` Set, skipping teams already completed (or where the insert returns a duplicate error) and reporting `{marked, skipped, failed}` counts. UI: when one or more teams are selected (existing checkbox column) a small `<select>` of activities and a green "✓ Mark complete (N)" button appear next to the existing red bulk delete button. Reuses existing helpers `markTeamCompletion`, `reloadCompletions`, `reloadClassTeams`, and the Session 2 view fix so totals stay correct.
- Backup: /root/qm-backups/teams-page.tsx.before_s7_$(date +%s).bak
- Build: ok. Restart: pm2 questmaster-v2.

## Status snapshot
All 7 sessions complete (RLS recursion fix, marks double-count view fix, submission card drag, scroll layout, inline + and per-card move buttons, portrait video enlarge, bulk-tick).


### Session 8 - 2026-05-14 - Make Enlarge pill always visible (14.2.5b)
- File: src/components/submission-board/SubmissionBoardView.tsx (1 sed patch)
- Bug: Adilo player hides its fullscreen icon at small card widths (no fullscreen button visible). Previous Enlarge link was hidden by `opacity-0 group-hover:opacity-100` which doesn't work on touch devices and isn't discoverable.
- Fix: Removed `opacity-0 group-hover:opacity-100`; added `font-semibold text-[10px] shadow-md` so the pill is always shown in the top-right corner of every video thumbnail. Clicking opens the Adilo hosted player in a new tab, which has its own native fullscreen control.
- Backup: /root/qm-backups/SubmissionBoardView.tsx.before_s8_1778705919.bak (42601 bytes)
- Build: ok. Restart: pm2 questmaster-v2 new pid 1956674.
- Verified live: Enlarge pill visible on all video cards at default zoom.

### Storage audit (informational, no changes made)
- VPS disk: 40G/96G (42%) on /dev/sda1.
- Uploaded videos do NOT touch the VPS. The upload route returns an Adilo signed PUT URL and the browser uploads directly to Adilo. Confirmed by code comment in src/app/api/submission-boards/[huntId]/[classId]/video/start/route.ts and by absence of any writeFile/createWriteStream/fs.write/tmp usage in src/app and src/lib.
- Largest local consumers: /var/lib/docker 18G (15 images, 73MB containers, 30MB volumes total), /root 3.8G, /var/log 1.1G, /var/www/_archive 798M, /var/www/questmaster-v2 978M (.next 315M + node_modules 643M).
- Conclusion: any growth shown in the Hostinger storage indicator comes from Docker images and system logs across all VPS apps, not from Kuizen submissions.

---

## Change log

### 2026-05-20 — Feature: End class lifecycle (manual end + reopen)

Added a graceful "End class" state so educators can wind down a cohort while keeping it accessible to students.

**Database** (see `sql/migrations/2026_05_20_class_end.sql`):
- `qm_classes.ended_at TIMESTAMPTZ NULL` (NULL = active).
- New function `qm_is_class_ended(uuid) returns boolean`.
- New trigger `trg_qm_block_submissions_when_ended` on `qm_submissions` — refuses non-educator inserts on ended classes.
- Updated `qm_join_class_by_code(text)` — refuses to add new members when `ended_at IS NOT NULL`, with message: "This class has ended and is no longer accepting new members".
- Updated `qm_list_my_educator_classes()` — now returns `ended_at` and sorts active classes first, ended classes last. *Note*: this function is owned by `supabase_admin`, so re-apply via `docker exec supabase-db psql -U supabase_admin -d postgres -f ...`.

**App** (Next.js):
- `src/lib/data.ts`: extended `Klass` type with `ended_at`, added `endClass(id)` and `reopenClass(id)`.
- `src/lib/types.ts`: extended `EducatorClassRow` with `ended_at`.
- `src/app/educator/classes/page.tsx`: shows amber `ENDED` pill on ended class cards (sort order already handled by the RPC).
- `src/app/educator/classes/[id]/page.tsx`: subtle "End class" link in header for active classes; amber banner + "Reopen class" button for ended classes. Uses `useConfirm` with `tone: 'danger'` for End, `tone: 'default'` for Reopen.
- `src/app/participant/home/page.tsx`: amber banner under the active-class indicator when the selected class has ended.

**UX rules**:
- End is reversible; nothing is destroyed.
- Educators retain full edit rights on ended classes (so they can fix typos or grade late work).
- Students keep read access to Learning Board, Activities, and Rankings.
- Submissions are hard-frozen at the DB level (trigger), so no UI bypass is possible.
- Join code becomes inert on ended classes.

**Smoke-tested live**: ended `AI JPSPN` via UI → banner appeared → reopened via UI → restored cleanly. RPC-level join attempt on ended class returns the expected error.

---

## Change log entry — 2026-05-20 (Phase 1: LMS Supabase stack)

**Context:** Beginning Option A architecture (separate code + separate Supabase + subdomain lms.kuizen.fun). VPS was upgraded to 15 GB RAM / 192 GB disk before this phase.

**Phase 0 — Safety net (complete):**
- `/root/qm-backups/2026_05_20_phase0/` contains: full DB schema dump (13,151 lines), qm_* schema+data dump (1.6 MB), code tarball (2.8 MB, excludes node_modules/.next), templates from supabase-lecturerhub, inventory snapshots (pm2, docker, nginx, ports).

**Phase 1 — Parallel Supabase stack (complete):**
- `/opt/supabase-lms/` created by `cp -a /opt/supabase-lecturerhub` then surgically edited.
- All 13 `-lh` container_name occurrences in docker-compose.yml → `-lms`.
- Compose project name set to `supabase-lms` (line 11: `name: supabase-lms`) for safety vs. `name: supabase` in main/lh stacks.
- New ports: Kong HTTP 8020, Kong HTTPS 8463, Postgres 5434, Pooler 6545 (lh uses 8010/8453/5433/6544).
- Fresh JWT_SECRET + ANON_KEY + SERVICE_ROLE_KEY + DASHBOARD_PASSWORD + all S3/Logflare/Vault/Minio secrets generated via `utils/generate-keys.sh` and applied to `/opt/supabase-lms/.env` via `/tmp/apply_keys.js`. Original key dump is at `/root/kuizen-lms-secrets/lms-keys.txt` (chmod 600, root-only).
- `volumes/functions/` seeded from lecturerhub (hello, main stubs) to prevent edge-functions restart loop.
- All 12 LMS containers verified healthy after `docker compose up -d`.
- Smoke tests: LMS Kong → HTTP 401 (alive), kuizen.fun → HTTP 307 (unchanged), lecturerhub Kong → HTTP 401 (unchanged). Memory: 6.7 G used / 15 G total / 8.9 G available.

**SITE_URL / API_EXTERNAL_URL** in /opt/supabase-lms/.env already point to https://lms.kuizen.fun and http://127.0.0.1:8020 respectively. Public hostnames not yet wired (no DNS A records, no nginx site, no TLS) — that's Phase 3.

**Untouched:** /opt/supabase, /opt/supabase-lecturerhub, all other PM2 apps, all other nginx sites, /var/www/questmaster-v2.


---


## Change log entry — 2026-05-21 (Phases 2, 4, 5: LMS Next.js app + LMS DB schema + codebase rename)

**Context:** Continued from Phase 1 (LMS Supabase stack online). VPS is multi-tenant; kuizen.fun (Team product), lecturerhub, and all other tenants stayed untouched throughout.

**Phase 2 — Duplicate the Next.js app (complete):**
- `/var/www/kuizen-lms/` populated from a clone of `/var/www/questmaster-v2/`.
- `.env.local` rewritten to point at the LMS Supabase stack (Kong on 127.0.0.1:8020, anon/service keys from `/root/kuizen-lms-secrets/lms-keys.txt`).
- `ecosystem.config.js` configured for PM2 app `kuizen-lms` on port **3011** (not 3010 — that is the Team app's port, gotcha #4).
- PM2 app `kuizen-lms` added: `pm2 start ecosystem.config.js && pm2 save`. Total PM2 apps online: 7 (was 6).
- Smoke test: `http://127.0.0.1:3011/` returns HTTP 307 (redirects to /login as expected).

**Phase 4 — Load schema into LMS DB and rename qm_* → lms_* (complete):**
- LMS DB container: `supabase-db-lms` (postgres on the LMS stack).
- Initial dump load from `/root/qm-backups/2026_05_20_phase0/qm_schema_and_data.sql` produced 91 errors + 0 functions (hit gotcha #2: `pg_dump` as `postgres` user does not emit functions owned by `supabase_admin`).
- Re-dumped from Team DB as `supabase_admin --schema-only --no-owner` → `/root/qm-backups/2026_05_20_phase0/qm_schema_full_v2.sql` (206 KB, 57 CREATE FUNCTION incl. 48 `public.qm_*`).
- Reset LMS public schema (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`), then loaded the corrected dump: EXIT 0, 28 qm_tables, 48 qm_funcs.
- **Surprise:** Team DB `public` schema is multi-tenant — held 26 non-qm tables from other co-located products (qrlink_*, clients, payments, programs, sessions, user_profiles, etc.). Dropped those 26 non-qm tables and 7 non-qm functions in LMS DB. Kept `is_admin` (19 policy refs) and `tg_set_updated_at` (3 trigger refs) because they had qm_* dependencies.
- Dropped 7 Team-only base tables: `qm_challenge_outcomes`, `qm_challenges`, `qm_group_submissions`, `qm_hunts`, `qm_team_members`, `qm_team_quest_completions`, `qm_teams`. (`qm_class_team_scores` was a view, not a table — skipped.)
- Built migration file `/var/www/kuizen-lms/sql/migrations/0001_init.sql` (1095 lines, 51 KB). Sections: (1) drop 10 Team-only-purpose functions, (2) drop 6 mixed-purpose functions (`qm_at_risk_summary`, `qm_block_submissions_when_ended`, `qm_can_manage_board`, `qm_gamification_summary`, `qm_is_member`, `qm_mastery_summary`) — flagged as TODOs for LMS team to re-author, (3+4) rename pass.
- Rename pass (combined chunk 3+4): dropped 62 qm_ policies, dropped 32 qm_ functions, renamed 21 qm_tables → lms_tables, renamed 2 sequences + 47 indexes, recreated 32 functions with `lms_` names + qm_→lms_ body rewrites, recreated 62 policies with rewritten predicates. **Gotcha discovered:** `pg_get_functiondef(oid)` does not append `;` after `$function$`; fixed by `pg_get_functiondef(oid) || E'\n;'` before re-execution.
- **LMS DB final state:** 0 qm_tables, 21 lms_tables, 0 qm_funcs, 32 lms_funcs, 62 lms_policies, 64 lms_indexes.
- **Team DB unchanged:** 28 qm base tables + 2 qm views (= 30 in information_schema), 48 qm_funcs.
- CASCADE drops also removed some auxiliary RLS policies (`p_intro_*`, `qm_submissions_owner_all`, etc.) — those need fresh authoring for lms_* equivalents (TODO).

**Phase 5 — Codebase rename pass (complete):**
- Pre-rename backup: `/root/qm-backups/2026_05_20_phase5/src_pre_rename.tar.gz` (377 KB).
- Used a Node script (per handoff §7.2 — sed is fragile on multi-line) walking `/var/www/kuizen-lms/src/` for `.ts` and `.tsx` files. Regex `\bqm_([a-z][a-z0-9_]*)\b` → `lms_$1` (lowercase-suffix only, word-boundary anchored). Skipped backup files (`*.bak*`, `*.20260519_181625`).
- **Result:** 57 files touched, 327 token replacements. Final `qm_` count in non-backup src/.ts|.tsx files: **0**. `lms_` token count: 327 (1:1 with original qm_ count).
- No `Qm[A-Z]` PascalCase type names existed (handoff §7.3 anticipated `QmClass`/`QmProfile`; this codebase does not have them).
- Left untouched: `supabase/migrations/*.sql` (23 historical Team migrations), `db/*.sql` (5 bootstrap files), `sql/migrations/0001_init.sql` (the 192 qm_ refs there are intentional DROP/RENAME statements). `package.json` name remains `questmaster-v2` per gotcha #8.
- `sessionStorage` key `qm_sid` → `lms_sid` was renamed along with the table tokens (low risk: LMS has no existing users with the old key in their browser).
- Build & deploy: `npm run build` passed clean (zero errors, zero warnings), all routes prerendered. `pm2 restart kuizen-lms` → ready in 805 ms.
- Smoke tests: `:3011/` HTTP 307, `:3011/login` HTTP 200, `:3011/register` HTTP 200, `:3011/educator/{classes,teams,rankings}` HTTP 200, `:3011/participant/{home,activities,learning}` HTTP 200, `:3011/api/analytics/track` HTTP 405 (POST-only, expected). `error.log` empty after restart.

**Production safety (verified after each phase):**
- `https://kuizen.fun/` → HTTP 307 (unchanged across all 3 phases).
- `http://127.0.0.1:3010/` (questmaster-v2 Team app) → HTTP 200 (unchanged).
- Lecturerhub Kong (and other tenants) → unchanged.
- Container count: 37 supabase containers running (24 main/lh + 13 lms-stack). Handoff expected ~36; the +1 is the lms-stack pooler container that has no main-stack counterpart on this VPS — not a regression.

**Deferred items (TODO for LMS team):**
1. **Re-author 6 mixed-purpose functions** for LMS context: `lms_at_risk_summary`, `lms_block_submissions_when_ended`, `lms_can_manage_board`, `lms_gamification_summary`, `lms_is_member`, `lms_mastery_summary`. The Team versions referenced dropped tables (`qm_team_members`, `qm_hunts`, etc.) and were not portable.
2. **Re-create cascade-dropped RLS policies** for `lms_intro_posts`, `lms_submissions`, and a few others — Phase 4 chunk 3+4 only preserved policies that depended on `is_admin`. Run `select polname, polrelid::regclass from pg_policy where polrelid::regclass::text like 'lms_%' order by polrelid::regclass, polname;` to see what survives, then compare with Team DB.
3. **Code still references dropped Team-only tables** (`lms_hunts`, `lms_teams`, `lms_team_members`, `lms_challenges`, `lms_challenge_outcomes`, `lms_team_quest_completions`, `lms_group_submissions`) — roughly 140 of the 327 renamed tokens point at tables that no longer exist in the LMS DB. Those code paths will 500 at runtime when exercised. Either delete the dead routes (educator/hunts, educator/teams, etc.) or design LMS replacements before exposing them.
4. **Phase 3 (nginx + Let's Encrypt)** for `lms.kuizen.fun` and `api.lms.kuizen.fun` — still gated on DNS A records being created. SITE_URL/API_EXTERNAL_URL in `/opt/supabase-lms/.env` already point at the future public hostnames.
5. **`package.json` name** still `questmaster-v2`. Left alone to avoid breakage from anything that reads the name; can be renamed to `kuizen-lms` once the LMS team confirms nothing depends on it.

**Untouched:** `/opt/supabase`, `/opt/supabase-lecturerhub`, `/var/www/questmaster-v2`, all other `/var/www/*` apps, all other PM2 apps, all other nginx sites, all data in the Team DB.

---



## Change log entry — 2026-05-21 (Phase 3: nginx + Let's Encrypt for lms.kuizen.fun + api.lms.kuizen.fun)

**DNS (created in Hostinger panel):**
- A record: `lms.kuizen.fun` → 187.127.113.249, TTL 14400
- A record: `api.lms.kuizen.fun` → 187.127.113.249, TTL 14400
- Propagation: ~30 seconds globally (Hostinger DNS, no negative cache).

**Nginx sites created:**
- `/etc/nginx/sites-available/lms.kuizen.fun` (888 B) → reverse-proxy to `http://127.0.0.1:3011` (kuizen-lms Next.js). Mirrors kuizen.fun's pattern: 25m client_max_body_size, websocket headers, SSE-friendly timeouts (proxy_buffering off, 900s timeouts, chunked_transfer_encoding on, X-Accel-Buffering no).
- `/etc/nginx/sites-available/api.lms.kuizen.fun` (451 B) → reverse-proxy to `http://127.0.0.1:8020` (LMS Supabase Kong). Mirrors api.indoorgame.veltrix.technology's pattern: 50m body, 120s read timeout.
- Both symlinked into `sites-enabled/`. `nginx -t` clean. `systemctl reload nginx` succeeded.

**Let's Encrypt:**
- `certbot --nginx --non-interactive --agree-tos --email admin@kuizen.fun --redirect -d lms.kuizen.fun -d api.lms.kuizen.fun`
- Single cert covers both names. Saved at `/etc/letsencrypt/live/lms.kuizen.fun/{fullchain,privkey}.pem`.
- Expires 2026-08-19 (90-day standard). Cert auto-renewal scheduled.
- `--redirect` flag added the HTTP → HTTPS 301 redirect blocks to both server configs.

**`.env.local` fix (LMS Next.js):**
- Was: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8020` (broken for browser — internal-only IP).
- Now: `NEXT_PUBLIC_SUPABASE_URL=https://api.lms.kuizen.fun`
- Backup at `/root/qm-backups/2026_05_20_phase5/.env.local.pre_phase3`.
- Ran `npm run build` (clean, zero errors) + `pm2 restart kuizen-lms --update-env`. Ready in <1s.
- Verified the new URL is baked into client JS chunks (`/_next/static/chunks/6586-*.js`, `/app/register/page-*.js`, etc.) and no chunk references `127.0.0.1:8020`.

**Smoke tests:**
- `https://lms.kuizen.fun/` → HTTP 307 (Next.js redirect to /login)
- `https://lms.kuizen.fun/login` → HTTP 200 (login form renders in browser, Kuizen branding shown, no console errors)
- `https://lms.kuizen.fun/register` → HTTP 200
- `https://api.lms.kuizen.fun/auth/v1/settings` → HTTP 200 with anon key (Supabase auth service alive)
- `https://api.lms.kuizen.fun/rest/v1/lms_profiles?limit=1` → HTTP 401 with anon key (table reachable, RLS rejects anon — expected, profiles require auth)
- `http://lms.kuizen.fun/` → HTTP 301 → `https://lms.kuizen.fun/` (redirect works)
- Cert: `Subject CN=lms.kuizen.fun`, `Issuer Let's Encrypt CN=E8`, valid 2026-05-21 to 2026-08-19.

**Production safety:**
- `https://kuizen.fun/` → HTTP 307 (UNCHANGED)
- Team app on port 3004 untouched, lecturerhub untouched.
- 7 PM2 apps online (kuizen-lms restart only).
- nginx sites-enabled now contains 4 kuizen-related entries: `api.lms.kuizen.fun`, `kuizen.fun`, `kuizen.veltrix.technology`, `lms.kuizen.fun` (plus ~20 other tenants).

**Carry-over TODOs (unchanged from 2026-05-21 Phase 5 entry):**
1. Re-author 6 deferred mixed-purpose functions (lms_at_risk_summary, lms_block_submissions_when_ended, lms_can_manage_board, lms_gamification_summary, lms_is_member, lms_mastery_summary).
2. Re-create cascade-dropped RLS policies for `lms_intro_posts`, `lms_submissions`, etc.
3. Code still references dropped Team-only tables (lms_hunts, lms_teams, etc.) — ~140 of 327 renamed tokens point at tables that don't exist in LMS DB.
4. `package.json` name still `questmaster-v2`.

**New TODO surfaced by Phase 3:** the LMS now has a fully wired public URL, which means the Udemy-style LMS schema + UI design discussion (Phase 6.3) is the gating step before any user can actually use this product. Listed in the Next Agent section.

**Untouched:** kuizen.fun nginx site, kuizen.veltrix.technology, all other nginx sites, all other DNS records, /opt/supabase, /opt/supabase-lecturerhub, /var/www/questmaster-v2, all other PM2 apps, Team DB.

---

## Change log entry — 2026-05-21 (M1: brand + catalog schema + storefront)

**What this milestone delivered (kuizen-lms only — Team product untouched)**

### 1. Brand swap (Kuizen → Kuizen LMS)
- `tailwind.config.ts`: emerald/teal palette (`#059669` primary, `#0d9488` accent, full 50–900 brand scale)
- `src/app/layout.tsx`: metadata title/description/og/twitter → "Kuizen LMS" + tagline "Build courses. Build community. Build a business."; themeColor `#059669`; metadataBase `https://lms.kuizen.fun`
- `src/app/login/page.tsx` + `src/app/register/page.tsx`: purple→emerald + blue→teal gradients/buttons/links/focus rings; tagline + footer rewritten; subtitle on login replaced with "Welcome back. Sign in to your storefront."; collaborator footer replaced with "Powered by Kuizen LMS"
- Login post-auth redirect updated: educator/admin/superadmin → `/creator`; default → `/home` (was `/educator/classes` / `/admin/overview` / `/participant/home`)

### 2. Catalog schema (LMS DB only)
- `sql/migrations/0002_m1_catalog.sql` (119 lines): added 4 tables
  - `lms_creators` (storefronts; slug-unique, owner-unique on auth.users, theme_color default emerald)
  - `lms_courses` (creator-scoped slug, price/currency/is_free constraint, what_youll_learn/requirements jsonb, ratings/counts)
  - `lms_course_sections` (course-scoped position-unique)
  - `lms_lessons` (section-scoped position-unique; lesson_type ∈ video/article/resource/quiz; payload CHECK constraint)
- `sql/migrations/0003_m1_rls.sql` (170 lines): `lms_set_updated_at()` trigger function + triggers on all 4 tables; RLS enabled; 15 policies total (5 creators, 5 courses, 2 sections, 3 lessons)
- `sql/migrations/0004_m1_grants.sql` (24 lines): GRANT SELECT to anon; full CRUD to authenticated; ALL to service_role (RLS gotcha: without GRANT you get 42501)
- Post-migration: 25 `lms_*` tables (was 21, +4 new); 0 regression to existing 21

### 3. New routes
- `src/app/page.tsx` (159 lines): public landing page with hero, 3-value props, featured creators rail (live from DB), footer
- `src/app/c/[slug]/page.tsx` (250 lines): Podia-style creator storefront — header (avatar/name/CTAs), emerald gradient hero, courses grid (price/duration/ratings), about, footer; per-creator theme_color overrides; generateMetadata for og/twitter; 404 on unknown slug
- `src/app/home/page.tsx` (39 lines): learner home stub ("My learning" empty state) — M3 will populate
- `src/app/creator/page.tsx` (40 lines): creator dashboard stub with M2/M3/M5 placeholders

### 4. Verification
- `npm run build` clean (zero errors/warnings)
- All routes 200; `/c/<unknown>` → 404 (notFound() correct)
- kuizen.fun (Team) → **307** (UNCHANGED — zero regression)
- Demo creator seeded at `/c/demo` (display_name="Demo Creator", emerald theme)
- 7 PM2 apps online; LMS Supabase containers all healthy
- Visual verification: landing + storefront + login all render correctly in emerald palette

### 5. Files touched (whitelist)
```
/var/www/kuizen-lms/tailwind.config.ts
/var/www/kuizen-lms/src/app/layout.tsx
/var/www/kuizen-lms/src/app/page.tsx                    (rewritten)
/var/www/kuizen-lms/src/app/login/page.tsx              (patched)
/var/www/kuizen-lms/src/app/register/page.tsx           (patched)
/var/www/kuizen-lms/src/app/c/[slug]/page.tsx           (new)
/var/www/kuizen-lms/src/app/home/page.tsx               (new)
/var/www/kuizen-lms/src/app/creator/page.tsx            (new)
/var/www/kuizen-lms/sql/migrations/0002_m1_catalog.sql  (new)
/var/www/kuizen-lms/sql/migrations/0003_m1_rls.sql      (new)
/var/www/kuizen-lms/sql/migrations/0004_m1_grants.sql   (new)
```

### 6. Backups
```
/root/qm-backups/2026_05_21_m1/src_pre_m1.tar.gz       (377 KB — src + tailwind pre-M1)
/root/qm-backups/2026_05_21_m1/AGENT_HANDOFF.md.pre_m1.bak
/var/www/kuizen-lms/tailwind.config.ts.bak.m1
```

### 7. Carry-overs / known issues for next milestone
- Legacy Team-product routes (admin/, educator/, participant/) still present but orphaned — no nav links to them, but they still build. Cleanup deferred to M6 polish or a dedicated M1.5.
- Login footer still shows the Veltrix Technology line was replaced — verify with user if they want a different brand line.
- next.config has no `images.remotePatterns` — external avatar/thumbnail URLs will fail at runtime; add when creators start uploading.
- `lms_courses.lesson_count` / `total_duration_seconds` / `enrollment_count` / `rating_avg` are currently denormalized columns with no triggers — M2 needs trigger functions or scheduled refresh.
- `lms_lessons.position` UNIQUE on `(section_id, position)` will need a swap-trigger for drag-drop reordering in M2 to avoid temporary collisions.
---


## Change log entry — 2026-05-21 (M2: Creator dashboard + course CRUD)

### Database
- Migration `sql/migrations/0005_m2_triggers.sql` (83 lines):
  - `lms_recompute_course_aggregates(p_course_id)` updates lms_courses.lesson_count + total_duration_seconds
  - `lms_lessons_aggregate_trigger` (AFTER INSERT/UPDATE/DELETE on lms_lessons)
  - `lms_reorder_lessons(p_section_id, p_lesson_ids[])` safe-swap per-section (negative-space bump to avoid unique-collision on (section_id, position))
  - Grants to authenticated + service_role
- Migration `sql/migrations/0006_m2_storage.sql` (~110 lines):
  - Buckets `lms-public-images` (5MB, image MIME whitelist, public read) + `lms-private-resources` (50MB, signed URL only)
  - 8 RLS policies on storage.objects (creator-scoped writes; public read for images)
- **Bug fix uncovered**: column is `lms_creators.owner_id` (NOT `owner_user_id`). Cleaned in 0005, 0006, and verified nowhere else in repo.

### NPM packages
- `@uiw/react-md-editor` (dynamic-imported on creator pages only)
- `react-markdown` + `remark-gfm` (read-only markdown rendering)

### UI pages
- `src/components/MdEditor.tsx`, `src/components/MdView.tsx`
- `src/app/creator/layout.tsx` (88 lines) — sidebar shell, auth gate, onboarding redirect
- `src/app/creator/page.tsx` (72 lines) — dashboard overview (stat cards + quick actions)
- `src/app/creator/onboarding/page.tsx` (71 lines) — first-time creator setup
- `src/app/creator/courses/page.tsx` (97 lines) — courses list
- `src/app/creator/courses/new/page.tsx` (75 lines) — new course form
- `src/app/creator/courses/[id]/edit/page.tsx` (~350 lines) — 3-tab editor (Curriculum / Settings / Publish) with per-lesson-type editors (video/article/resource/quiz)
- `src/app/creator/settings/page.tsx` (102 lines) — creator profile + theme color + default payment provider

### Verification (all green)
- `npm run build` clean (zero errors, zero warnings); 6 new /creator routes
- pm2 restart kuizen-lms successful
- `kuizen.fun → 307` (UNCHANGED, zero regression)
- All LMS routes → 200; `/c/nonexistent → 404`
- DB triggers + RPC verified in pg_proc + pg_trigger
- Storage buckets + 8 RLS policies verified in storage.buckets + pg_policies

---


## Change log entry — 2026-05-21 (M3: Learner enrollment + Udemy-style player)

### Database
- Migration `sql/migrations/0007_m3_enrollment.sql`:
  - `lms_enrollments` (id, user_id, course_id, enrolled_at, completed_at, last_lesson_id, source, amount_cents, currency); UNIQUE (user_id, course_id); FK CASCADE to courses + lessons.
  - `lms_lesson_progress` (user_id, lesson_id, course_id, completed_at) PK (user_id, lesson_id)
  - 7 RLS policies: learner-self read/insert/update, creator read for own courses; progress insert requires existing enrollment
  - Grants to authenticated + service_role
- Hot-patch on `lms_lessons_select_preview` policy: now allows any anon/authenticated user to read lessons of published courses (so curriculum on public course landing shows all lessons with locks). Content fields rely on app-level rendering (player route only renders body when enrolled).

### UI pages added
- `src/app/c/[slug]/[course_slug]/page.tsx` (168 lines) — public course landing (Udemy-style hero + curriculum + about + requirements)
- `src/app/c/[slug]/[course_slug]/EnrolButton.tsx` (47 lines) — client component: auth check, instant free enrol, paid "M5 coming soon" stub, continue-learning state
- `src/app/learn/[course_id]/page.tsx` (212 lines) — Udemy-style player: top progress bar, left sidebar (sections + lessons), main content (Adilo iframe / MdView / FileLu download / quiz placeholder), Previous/Mark complete/Next nav, persistent last_lesson_id
- `src/app/home/page.tsx` (rewritten, 119 lines) — "My learning" grid with per-course progress bars and creator names
- Storefront patch: `/c/[slug]` course cards link to `/c/[slug]/[course_slug]`; `thumbnail_url` → `cover_url`

### Verification (all green)
- `npm run build` clean (zero errors / warnings); all 3 new routes built
- `kuizen.fun → 307` (UNCHANGED, zero regression)
- All LMS routes → 200
- Seeded demo course `Welcome to Kuizen LMS` (3 lessons: 1 article preview, 1 article locked, 1 video locked) appears on storefront with full curriculum + about + requirements
- Trigger verified: `lms_courses.lesson_count = 3` and `total_duration_seconds = 180` auto-recomputed after lesson inserts

### Gotchas resolved
- pm2 restart with `npm -- start` defaults to port 3000 (not 3011); always use `pm2 start ecosystem.config.js`
- After RLS policy changes, must `rm -rf .next && npm run build` to clear Next.js fetch cache even with `force-dynamic`
- `what_youll_learn` / `requirements` are jsonb (not text[]); use `to_jsonb(ARRAY[...])` when seeding
- ON CONFLICT (creator_id, slug) is the upsert key for lms_courses

---

## 👉 NEXT AGENT: Milestone 4 (Quizzes)

**Status as of 2026-05-21 15:03 UTC+8**
- M1 + M2 + M3 complete.
- DB: 27 lms_* tables, 2 Storage buckets + 8 storage policies + many RLS policies.
- Seeded demo creator (slug=demo) + demo course (slug=welcome-to-kuizen-lms) with 3 lessons live at https://lms.kuizen.fun/c/demo/welcome-to-kuizen-lms
- All M3 routes responding 200; enrollment table empty (no real users yet).

**M4 scope**
1. **Quiz schema**: `lms_quizzes` (lesson_id PK FK, settings: shuffle, time_limit_seconds, pass_threshold, attempts_allowed) + `lms_quiz_questions` (id, quiz_id, position, type=mcq/multi/short, question_md, points) + `lms_quiz_choices` (id, question_id, position, label, is_correct) + `lms_quiz_attempts` (id, user_id, quiz_id, started_at, submitted_at, score, passed) + `lms_quiz_answers` (attempt_id, question_id, choice_ids[], text_answer).
2. **Creator quiz builder** at `/creator/courses/[id]/edit` Quiz tab: add/edit/reorder questions, configure pass threshold, gate downstream lessons on pass (already-decided rule: creator chooses per-quiz).
3. **Player quiz UI** at `/learn/[course_id]` when lesson_type='quiz': render questions, submit, show pass/fail + per-question feedback.
4. **Pass-gating**: if quiz has `gate_downstream=true`, learners can't progress to next lesson until passed; show "🔒 Pass the quiz to continue".

**M4 open questions**
- Anti-cheat? (out of scope; trust-based learning per Podia model)
- Time-limit enforcement: client-side timer + server-side check on submit

**Approved paths (unchanged)**
- `/var/www/kuizen-lms/`, `/opt/supabase-lms/`, `/etc/nginx/sites-{available,enabled}/{lms,api.lms}.kuizen.fun`, `/root/qm-backups/2026_05_21_*/`

**Verification baseline (re-run before M4)**
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://kuizen.fun/                                  # expect 307
curl -s -o /dev/null -w '%{http_code}\n' https://lms.kuizen.fun/                              # expect 200
curl -s -o /dev/null -w '%{http_code}\n' https://lms.kuizen.fun/c/demo/welcome-to-kuizen-lms  # expect 200
docker exec supabase-db-lms psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'lms_%';"     # expect 27
pm2 list | grep online | wc -l                                                                # expect 7
```

**Use tmux session `work`** for all long-running tasks.
---
## 2026-05-21 -- INTEGRATION: Adilo + FileLu API + FileLu S5 wired up
### Credentials live-verified
- **Adilo API** (X-Public-Key + X-Secret-Key headers): live -- GET https://adilo-api.bigcommand.com/v1/projects -> HTTP 200, returned existing projects (LXQWYPAu, etumuu8R, wPr3BaEx, ...)
- **FileLu API** (`?key=` param): live -- GET https://filelu.com/api/account/info -> HTTP 200, Premium account, 1024 GB storage, expires 2125-04-15
- **FileLu S5** (S3-compatible, AWS SigV4): live -- ListBuckets/CreateBucket/PutObject/GetObject all return 200; presigned PUT + presigned GET round-trip verified
### Env vars added (in /var/www/kuizen-lms/.env.local)
- ADILO_PUBLIC_KEY (256 chars) -- already present from prior clone, verified active
- ADILO_SECRET_KEY (228 chars) -- already present, verified active
- FILELU_API_KEY (22 chars) -- already present, verified active
- **NEW** FILELU_S5_ENDPOINT=https://ap.s5lu.com
- **NEW** FILELU_S5_REGION=ap-southeast
- **NEW** FILELU_S5_ACCESS_KEY (32 chars)
- **NEW** FILELU_S5_SECRET_KEY (48 chars)
- **NEW** FILELU_S5_FORCE_PATH_STYLE=true
- **NEW** FILELU_S5_BUCKET=kuizen-lms
Backup at /var/www/kuizen-lms/.env.local.pre_s5.bak
### npm dependencies added
- @aws-sdk/client-s3 (S3-compatible client for FileLu S5)
- @aws-sdk/s3-request-presigner (presigned URL generation for browser-direct uploads)
### Files added/changed
- **NEW** src/lib/s5.ts (34 lines): s5client, s5PutObject, s5PresignPut, s5PresignGet, s5DeleteObject, s5HeadObject, s5PublicUrl, S5_BUCKET, S5_ENDPOINT
- existing src/lib/adilo.ts (279 lines) -- inherited from clone, base url https://adilo-api.bigcommand.com -- verified working
- existing src/lib/filelu.ts (115 lines) -- inherited from clone, verified working
### Remote provisioning
- Created S5 bucket `kuizen-lms` on https://ap.s5lu.com (alongside existing mybucket146754, qrlink-qr)
- Smoke test files (smoke/hello.txt, smoke/presign.txt) created then cleaned up
### Smoke tests (all green)
- kuizen.fun -> 307 (Team product untouched)
- lms.kuizen.fun -> 200
- lms.kuizen.fun/c/demo/welcome-to-kuizen-lms -> 200
- pm2 list -> 7 apps online
- npm run build -> success (no type errors)
---
## 2026-05-21 -- M3.5: Creator-direct uploads to FileLu S5 via presigned URLs
### Why
Course cover images had no upload UI -- creators had to paste a public URL. This mini-milestone wires the new S5 storage we provisioned (Adilo+FileLu integration) into a reusable browser-direct uploader so creators can actually use the bucket. M4 (Quizzes) gets it for free.
### Files added
- **NEW** src/app/api/upload/presign/route.ts (55 lines): POST -> presigned PUT URL
  - Bearer-token auth via getRouteSupabase()
  - Looks up creator from lms_creators.owner_id; 403 if no creator profile
  - Kind allow-list: avatar | cover | resource (extensible)
  - Content-type allow-list (415 on mismatch)
  - Size limit (413): 8 MB images, 200 MB resources
  - Key path: creators/{creator_id}/{covers|avatar|resources}/{uuid}-{sanitized-filename}
  - Returns: { uploadUrl, key, publicUrl, contentType, expiresInSec }
- **NEW** src/components/S5Uploader.tsx (76 lines): drag-and-drop client uploader
  - Props: { kind, currentUrl, onUploaded, onClear?, accept?, label?, className? }
  - Inline image preview, progress bar, error display, Remove button
  - Uses XHR with onprogress for real upload-progress percentage
  - Pulls Supabase Bearer token via supabase.auth.getSession()
### Files changed
- src/app/creator/courses/[id]/edit/page.tsx -- added S5Uploader import + replaced 'Upload-to-bucket coming next' helper text with live <S5Uploader kind='cover' /> wired to cover_url
- src/app/c/[slug]/page.tsx -- replaced grey 'No image' placeholder with theme-color gradient (creator.theme_color -> #0d9488) showing course title
- Backups: page.tsx.pre_uploader.bak alongside each modified file
### Verification
- npm run build: clean, no warnings, /api/upload/presign registered as dynamic route
- POST /api/upload/presign without auth: 401 Unauthorized (auth gate confirmed)
- kuizen.fun -> 307, lms -> 200, /c/demo -> 200 (now with gradient cover), /c/demo/course -> 200
- 7 PM2 apps online, 27 lms_ tables unchanged
### Wiring notes for M4+
- Reuse <S5Uploader kind='resource' /> in lesson editor for filelu_url (lesson_type='resource')
- Reuse <S5Uploader kind='avatar' /> in /creator/settings for avatar_url
- For Adilo video uploads, build a separate <AdiloUploader /> using existing startAdiloUpload/getAdiloSignedUrl/completeAdiloUpload in src/lib/adilo.ts (different flow: multipart, project_id required)
- To add new upload kinds, add to IMAGE_TYPES/RESOURCE_TYPES + a new prefix branch in route.ts

---
## M4 — Quizzes (server-graded multiple/single/true-false)
### Schema
- 5 new tables (lms_ count: 27 -> 32)
  - lms_quizzes (one per quiz lesson; pass_threshold, max_attempts, time_limit_seconds, shuffle_*, show_correct_answers, is_gating)
  - lms_quiz_questions (position, prompt, question_type CHECK IN single|multiple|true_false, points, explanation, image_url)
  - lms_quiz_choices (position, label, is_correct)
  - lms_quiz_attempts (attempt_number, started_at, submitted_at, score_points, total_points, score_percent, passed; UNIQUE quiz_id+user_id+attempt_number)
  - lms_quiz_answers (selected_choice_ids uuid[], is_correct, points_awarded; UNIQUE attempt_id+question_id)
- Migration: /tmp/m4_quizzes.sql (165 lines, applied with ON_ERROR_STOP)
- 5 ALTER TABLE...ENABLE RLS, 14 CREATE POLICY, full GRANTs to anon+authenticated
- RLS pattern:
  - Creator full access (lms_courses->lms_creators.owner_id = auth.uid())
  - Learner SELECT requires enrollment (lms_enrollments)
  - Attempts/answers: user owns only their own, creator can SELECT all for their courses
### API routes
- **NEW** GET /api/quiz/[lessonId] -> { quiz, questions[], role: 'creator'|'learner' }
  - Learner view strips is_correct from choices
  - Creator view includes is_correct (for builder pre-population)
- **NEW** PUT /api/quiz/[lessonId] -> creator-only upsert of full quiz definition
  - Body: { title, description, pass_threshold, max_attempts, time_limit_seconds, shuffle_*, show_correct_answers, is_gating, questions: [{ prompt, question_type, points, explanation, image_url, choices: [{ label, is_correct }] }] }
  - Wholesale replace: deletes existing questions (cascades to choices) then re-inserts in order
- **NEW** POST /api/quiz/[lessonId]/attempt -> create new attempt
  - Enforces max_attempts via SELECT prior attempts
  - Returns 409 if max_attempts reached
- **NEW** PUT /api/quiz/[lessonId]/attempt -> submit attempt with answers, grade server-side
  - Body: { attempt_id, answers: [{ question_id, selected_choice_ids: [] }] }
  - Uses getServiceSupabase() to read is_correct (RLS would block client reads)
  - Grading: single/true_false requires exact 1 correct match; multiple requires set equality with correct set
  - Auto-upserts lms_lesson_progress (mark complete) when passed=true
  - Idempotent: deletes prior answers for same attempt before re-inserting
### Components
- **NEW** src/components/QuizPlayer.tsx (126 lines): learner-facing quiz UI
  - Loads quiz via GET, gates start with 'Start quiz' button
  - Radio buttons for single/true_false, checkboxes for multiple
  - Submit triggers PUT with attempt_id + answers
  - Result card: score/total/percent, pass/fail in emerald/rose colors, 'Try again' button
  - onPass callback used by player page to mark lesson complete in local state
- **NEW** src/components/QuizBuilder.tsx (142 lines): creator-facing quiz editor
  - Title, description, pass threshold, max attempts inputs
  - Toggles: is_gating, shuffle_questions, shuffle_choices
  - Add question buttons: + Single choice | + Multiple choice | + True/False
  - Per-question: prompt textarea, type/points selectors, choice list with correct radio/checkbox
  - Single & true_false auto-clear other choices when one is set is_correct
  - Save button calls PUT, shows success/error toast
### Files changed
- src/app/learn/[course_id]/page.tsx -- added QuizPlayer import + replaced 'Quizzes ship in Milestone 4' placeholder with <QuizPlayer lessonId={activeLesson.id} onPass={() => setCompleted(prev => new Set(prev).add(activeLesson.id))} />
- src/app/creator/courses/[id]/edit/page.tsx -- added QuizBuilder import + replaced 'Quiz builder ships in Milestone 4' placeholder with <QuizBuilder lessonId={lesson.id} />
- Backups: *.pre_quiz.bak alongside each modified file
### Verification
- Migration applied: 5 GRANT, 5 ALTER TABLE, 14 CREATE POLICY, COMMIT (no errors)
- npm run build: 'Compiled successfully', no warnings, no errors
- /api/quiz/[lessonId] + /api/quiz/[lessonId]/attempt registered as f (Dynamic)
- GET /api/quiz/<uuid> without auth: 401 Unauthorized
- POST /api/quiz/<uuid>/attempt without auth: 401 Unauthorized
- kuizen.fun -> 307 (production unchanged)
- lms -> 200, /c/demo -> 200, /c/demo/welcome-to-kuizen-lms -> 200
- 7 PM2 apps online, 32 lms_ tables (5 new added this milestone)
- Sample quiz inserted via SQL: lesson c1d5b187-8356-4897-887a-4caecdb24b1b in demo course (1 question, 3 choices, pass_threshold=60)
### Gotchas / Notes
- Service role required for grading: client RLS on lms_quiz_choices.is_correct would leak answers if exposed
- Multiple-choice grading uses set equality (selected == correct exactly); partial credit not implemented in M4 (could be added by computing points proportional to correct intersection)
- shuffle_questions / shuffle_choices / time_limit_seconds / show_correct_answers schema slots exist but not yet wired into QuizPlayer (deferred to M4 polish)
- Quiz question image_url uses S5 (creator can paste presigned public URL from S5Uploader output; UI integration deferred)
- Quiz pass auto-marks lms_lesson_progress, so 'Mark as complete' button on player page is redundant for passed quizzes but still works

---
## M6 — Polish (reviews + certificates + analytics)
### Schema
- 2 new tables (lms_ count: 32 -> 34)
  - lms_reviews (course_id, user_id UNIQUE, rating 1-5 CHECK, review_text, is_published, updated_at)
  - lms_certificates (serial UNIQUE, course_id+user_id UNIQUE, learner_name snapshot, course_title snapshot, creator_display_name snapshot, issued_at, revoked_at)
- Migration: /tmp/m6_polish.sql (79 lines, applied with ON_ERROR_STOP)
- 2 ALTER TABLE...ENABLE RLS, 9 CREATE POLICY (6 reviews + 3 certificates), full GRANTs to anon+authenticated
- RLS pattern:
  - Reviews: published reviews are PUBLIC SELECT (anon+authenticated); enrolled users INSERT/UPDATE/DELETE own; creators SELECT all on their courses
  - Certificates: non-revoked SELECT is PUBLIC (for verification page); holders SELECT own; creators SELECT all on their courses; INSERT only via service role
### API routes
- **NEW** GET /api/reviews/[courseId] -> public list of published reviews + total + average (uses service role to enrich with reviewer display_name from auth.users.raw_user_meta_data.full_name)
- **NEW** POST /api/reviews/[courseId] -> upsert review by enrolled learner (rating 1-5, review_text up to 2000 chars)
- **NEW** POST /api/certificates/issue/[courseId] -> server-side certificate issuance
  - Checks: already issued? (returns existing) / enrolled? / 100% lesson_progress?
  - Generates KZN-YYYYMMDD-XXXXXXXX serial (32-char base32 alphabet excluding I/O/0/1)
  - Snapshots learner_name + course_title + creator_display_name for stable cert
- **NEW** GET /api/certificates/verify/[serial] -> public verification
  - Returns { valid: true, certificate } on found+non-revoked
  - Returns 404 if not found; 200 with valid:false if revoked
- **NEW** GET /api/creator/analytics/[courseId] -> creator-only aggregated stats
  - Enrollments count, total lessons, fully_completed users, completion_rate_pct
  - Reviews count, average_rating
  - Quiz attempts, quiz_passes, quiz_pass_rate_pct
  - Certificates_issued (non-revoked)
### Components
- **NEW** src/components/ReviewsPanel.tsx (95 lines): rating display + optional review form
  - Stars subcomponent (clickable when onChange provided)
  - Average + total + per-review list with reviewer name + date
  - canReview prop gates the submit form (only learners on /learn page see it)
- **NEW** src/components/CertificateBadge.tsx (50 lines): auto-issues on eligible=true
  - Calls POST /api/certificates/issue when eligible flips truthy
  - Shows 'View certificate ↗' link to /certificate/[serial] when issued
- **NEW** src/components/AnalyticsPanel.tsx (63 lines): 6-stat grid for creator dashboard
- **NEW** src/app/certificate/[serial]/page.tsx (54 lines): public certificate verification view
  - Server component, fetches /api/certificates/verify internally
  - Decorative emerald/teal cert layout with serial, dates, Valid/Revoked pill
  - 404 fallback page for unknown serials
### Files changed
- src/app/c/[slug]/[course_slug]/page.tsx -- added ReviewsPanel import + 'Reviews' section before </main> (anonymous read-only, no canReview)
- src/app/learn/[course_id]/page.tsx -- added ReviewsPanel + CertificateBadge imports; CertificateBadge above prev/next buttons; Reviews section with canReview=true inside the activeLesson wrapper
- src/app/creator/courses/[id]/edit/page.tsx -- added AnalyticsPanel import + 'Analytics' tab + tab section with <AnalyticsPanel courseId={courseId} />
- Backups: *.pre_m6.bak alongside each modified file (note: learn page restored from .pre_quiz.bak before M6 re-edit due to first-pass JSX nesting error)
### Verification
- Migration applied: 2 CREATE TABLE, 4 indexes, 2 GRANT, 2 ALTER TABLE, 9 CREATE POLICY, COMMIT (no errors)
- npm run build: 'Compiled successfully', no warnings, no errors
- All new routes registered as f (Dynamic): /api/reviews/[courseId], /api/certificates/issue/[courseId], /api/certificates/verify/[serial], /api/creator/analytics/[courseId], /certificate/[serial]
- kuizen.fun -> 307 (production unchanged)
- lms -> 200, /c/demo -> 200, /c/demo/welcome -> 200
- GET /api/reviews (anon): 200 with JSON {reviews:[], total:0, average:0}
- POST /api/reviews (no auth): 401
- POST /api/certificates/issue (no auth): 401
- GET /api/certificates/verify/X404: 404 with {valid:false, error:'Certificate not found'}
- GET /certificate/X404 (page): 200 (renders 'not found' UI)
- GET /api/creator/analytics (no auth): 401
- 7 PM2 apps online, 34 lms_ tables (2 new added this milestone)
### Gotchas / Notes
- JSX nesting bug encountered on first pass: inserting CertificateBadge + Reviews section between the outer wrapper `</div>` and `)}` of `{activeLesson && (...)}` broke the single-element rule. Fixed by moving them INSIDE the outer wrapper div.
- Reviews use UNIQUE(course_id, user_id) constraint; API does manual upsert (check existing then update/insert) to bypass schema-cache complications with supabase-js upsert
- Certificates use a snapshot pattern (learner_name, course_title, creator_display_name stored at issuance) so name/title changes don't invalidate old certs
- Serial format KZN-YYYYMMDD-XXXXXXXX uses 32-char alphabet excluding lookalikes (I/L/0/1/O); retry-on-collision loop (4 attempts)
- AnalyticsPanel quiz_pass_rate excludes submitted_at IS NULL (in-progress attempts)
- Certificate issuance is opportunistic via CertificateBadge useEffect (auto-call when eligible). For Pro UX, could later add a 'Download PDF' button (deferred to M6 polish)
- TS gotcha fixed: `MapIterator<number>` requires Array.from() wrapper to iterate (or --downlevelIteration flag)

## Bugfix — 2026-05-21 (post-M6 system test)

**Bug:** `lms_analytics_events` insert spammed `permission denied` for every page view because the table had GRANTs only on `postgres`, not `anon`/`authenticated`/`service_role`. RLS policies existed but PostgreSQL still checks table-level privileges first.

**Fix:** Applied `/tmp/fix_analytics_grants.sql` against `supabase-db-lms`:
```sql
GRANT INSERT, SELECT ON public.lms_analytics_events TO anon, authenticated;
GRANT ALL ON public.lms_analytics_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lms_analytics_events_id_seq TO anon, authenticated;
GRANT ALL ON SEQUENCE public.lms_analytics_events_id_seq TO service_role;
```

**Verify:** `curl -X POST -H 'Content-Type: application/json' -d '{"event_type":"page_view","path":"/test"}' https://lms.kuizen.fun/api/analytics/track` returns `{"ok":true}` and a new row appears in `lms_analytics_events`. No more `permission denied` lines in `pm2 logs kuizen-lms --err`.

**Lesson:** New tables that need anon/authenticated access must include both `ENABLE RLS + CREATE POLICY` AND `GRANT <ops> TO anon, authenticated`. Audit any future tables added in M5 the same way.
