# Handoff — Continue Kuizen LMS build from Phase 2

**Written:** 2026-05-20 by previous agent
**Read first:** `/var/www/questmaster-v2/AGENT_HANDOFF.md` (the master handoff — ~500 lines, covers the whole Kuizen platform and every prior change). This file is a focused supplement for picking up the LMS-clone work.

---

## 1. Who you are and what you're doing

You are continuing a multi-phase project to create **Kuizen LMS**, a brand-new product targeting course creators, hosted at `https://lms.kuizen.fun` with its own Supabase at `https://api.lms.kuizen.fun`. It is a fully isolated clone of the existing **Kuizen Team** product (live at https://kuizen.fun, code at `/var/www/questmaster-v2`, talks to the main Supabase at `/opt/supabase`).

Architecture chosen by the user ("Option A"):
- Separate code (`/var/www/kuizen-lms`)
- Separate Supabase stack (`/opt/supabase-lms`)
- Separate subdomain (`lms.kuizen.fun` + `api.lms.kuizen.fun`)
- Schema renamed: `qm_*` (in Team) → `lms_*` (in LMS)
- Drop Team-only tables in the LMS DB; add LMS-specific tables later (lms_courses, lms_lessons, lms_enrollments, lms_progress, lms_quiz_*, lms_certificates, lms_purchases)

The user likes Udemy's video-learning UI and wants that incorporated into the LMS later.

---

## 2. What is already done (don't redo this)

### Phase 0 — Safety net (complete)
- Backups at `/root/qm-backups/2026_05_20_phase0/`:
  - `schema_live_predump.sql` — full DB schema (13,151 lines)
  - `qm_schema_and_data.sql` — 28 qm_* tables schema + data (1.6 MB)
  - `questmaster-v2_code.tar.gz` — code snapshot (2.8 MB, no node_modules/.next)
  - `qm_tables_list.txt` — list of all 28 qm_* table names
  - Inventory: pm2_ls.txt, docker_ps.txt, nginx_sites_enabled.txt, listening_ports.txt, memory.txt, disk.txt

### Phase 1 — LMS Supabase stack (complete)
- `/opt/supabase-lms/` running, all 12 containers healthy.
- Compose project name: `supabase-lms` (line 11 of docker-compose.yml).
- Container names all suffixed `-lms` (e.g. supabase-db-lms, supabase-kong-lms, supabase-auth-lms, etc.).
- Ports: Kong HTTP **8020**, Kong HTTPS **8463**, Postgres **5434**, Pooler **6545**.
- Fresh secrets at `/root/kuizen-lms-secrets/lms-keys.txt` (chmod 600, root-only). Contains JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, DASHBOARD_PASSWORD, POSTGRES_PASSWORD, S3/Logflare/Vault/Minio keys.
- `volumes/functions/` seeded with hello + main stubs (don't remove or edge-functions-lms will restart-loop).
- SITE_URL=https://lms.kuizen.fun, API_EXTERNAL_URL=http://127.0.0.1:8020 already set in `/opt/supabase-lms/.env`.
- Verified untouched: kuizen.fun, lecturerhub, all other 25 tenants.

### What the user expects from you now
Continue Phase 2 → Phase 6 to completion. The user said "continue phase 2 until the end." Push through unless you hit a true blocker.

---

## 3. Hard constraints (don't break these)

- **Multi-tenant VPS, ~25 sites.** Do NOT touch any nginx site file, PM2 app, /var/www folder, or /opt/* folder that isn't yours. The sites you may create/edit: `/etc/nginx/sites-available/lms.kuizen.fun`, `/etc/nginx/sites-available/api.lms.kuizen.fun`. Your code lives at `/var/www/kuizen-lms`. Your Supabase lives at `/opt/supabase-lms`. Everything else is off-limits.
- **Legacy name preserved.** The Team app folder `/var/www/questmaster-v2` and PM2 process `questmaster-v2` stay named that way. Do NOT rename them.
- **Some Postgres functions are owned by `supabase_admin`, not `postgres`.** If you get "must be owner of function X" when running migrations, switch to `docker exec -u root supabase-db-lms psql -U supabase_admin -d postgres`.
- **No destructive ops without a backup.** You already have Phase 0 backups; if you do anything risky, snapshot first.
- **Every deploy must append a Change-log entry to `/var/www/questmaster-v2/AGENT_HANDOFF.md` (master) and `/var/www/kuizen-lms/AGENT_HANDOFF.md` (LMS, once it exists).**
- **DNS records are external.** The user must add `lms.kuizen.fun` and `api.lms.kuizen.fun` A records pointing to `187.127.113.249` at the registrar. Until they do, Phase 3 (Let's Encrypt) will fail. Phases 2, 4, 5 do not depend on DNS — do them first.
- **Port collisions are the #1 risk.** Before binding any new host port, run `ss -tlnp | grep :PORT` to confirm it's free. Current allocations: 3002, 3003, 3004 (questmaster-v2), 3005, 3006, 3007, 3008, 3010, 5433 (lh pg), 5434 (lms pg), 6544 (lh pooler), 6545 (lms pooler), 8000/8443 (main supabase), 8010/8453 (lh supabase), 8020/8463 (lms supabase). **Use port 3011 for the LMS Next.js app.**

---

## 4. Stack reference (memorize this)

**Kuizen Team (existing, do not break):**
- Code: `/var/www/questmaster-v2`
- PM2: `questmaster-v2` on port 3004
- Stack: Next.js 14.2.35 + TypeScript 5 + React 18 + Tailwind 3.4 + lucide-react + @supabase/ssr
- Supabase: `/opt/supabase` → Kong `https://api.indoorgame.veltrix.technology` (8000)
- DB: 30 `qm_*` tables in shared Postgres
- Public URL: https://kuizen.fun

**Kuizen LMS (you are building):**
- Code: `/var/www/kuizen-lms` (does not exist yet — Phase 2 creates it)
- PM2: `kuizen-lms` on port **3011**
- Same Next.js stack
- Supabase: `/opt/supabase-lms` → Kong `http://127.0.0.1:8020` internal / `https://api.lms.kuizen.fun` public (Phase 3)
- DB: will hold `lms_*` tables after Phase 4 rename
- Public URL (after Phase 3): https://lms.kuizen.fun
- Keys to use: see `/root/kuizen-lms-secrets/lms-keys.txt`

---

## 5. Phase 2 — Duplicate the Next.js app (do this first)

Goal: stand up a running LMS Next.js app pointing at the new LMS Supabase, before any schema rename. It will fail to query data (no lms_* tables yet) but the app shell should boot.

### 5.1 Clone the code
```
cp -a /var/www/questmaster-v2 /var/www/kuizen-lms
rm -rf /var/www/kuizen-lms/.next /var/www/kuizen-lms/node_modules
```

### 5.2 Find the env file used by the Team app
It's likely `.env.local` or `.env.production` at the repo root. Look for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`. Whatever file the Team uses, copy it and overwrite those four keys with the LMS values:
```
NEXT_PUBLIC_SITE_URL=https://lms.kuizen.fun
NEXT_PUBLIC_SUPABASE_URL=https://api.lms.kuizen.fun
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from /root/kuizen-lms-secrets/lms-keys.txt: ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<from /root/kuizen-lms-secrets/lms-keys.txt: SERVICE_ROLE_KEY>
```
IMPORTANT: until Phase 3 wires `api.lms.kuizen.fun`, the public URL won't resolve. For the FIRST boot you can set `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8020` so the app can reach the LMS Kong via loopback. Switch it back to the public hostname after Phase 3.

### 5.3 Find and update the PM2 ecosystem config
Look for `ecosystem.config.js` or `ecosystem.config.cjs` in the repo root. Change:
- `name: 'questmaster-v2'` → `name: 'kuizen-lms'`
- `PORT: 3004` (or wherever) → `PORT: 3011`
If the original uses `cwd`, make sure it points at `/var/www/kuizen-lms`.

### 5.4 Install, build, start
```
cd /var/www/kuizen-lms
npm install
npm run build
pm2 start ecosystem.config.js   # or .cjs
pm2 save
```
Verify with `curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3011/` (expect 200 or 307).

---

## 6. Phase 4 — Load schema into LMS DB and rename qm_* → lms_*

Do Phase 4 BEFORE Phase 5 (code rename), so you can verify the new tables exist before you make the code reference them.

### 6.1 Load the existing schema into the LMS Postgres
The LMS DB is empty. Load the schema-only dump (NOT the data dump — LMS is a fresh product, no Team data carries over):
```
docker exec -i supabase-db-lms psql -U postgres -d postgres < /root/qm-backups/2026_05_20_phase0/qm_schema_and_data.sql
```
The dump includes data, but for a fresh LMS DB that's fine — you can truncate after, or use `--schema-only` filtering. Easier: load it all, then `TRUNCATE` the qm_* tables before rename:
```
docker exec supabase-db-lms psql -U postgres -d postgres -c "DO \$\$ DECLARE r record; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE tablename LIKE 'qm\_%') LOOP EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END \$\$;"
```

### 6.2 Drop Team-only tables
Team-specific tables that the LMS doesn't need (per architecture decision):
- `qm_hunts`
- `qm_class_team_scores` (if exists — check first)
- `qm_team_members`, `qm_team_quest_completions`, `qm_teams` (Team is about teams; LMS is course creator → individual learner)
- `qm_challenges`, `qm_challenge_outcomes`, `qm_group_submissions` (team-based gameplay)

Review each before dropping. The full list of 28 qm_* tables is in `/root/qm-backups/2026_05_20_phase0/qm_tables_list.txt`. Drop with:
```
docker exec supabase-db-lms psql -U postgres -d postgres -c "DROP TABLE IF EXISTS public.qm_hunts CASCADE; DROP TABLE IF EXISTS public.qm_teams CASCADE; ..."
```
Use CASCADE so foreign-key dependencies drop cleanly.

### 6.3 Rename qm_* → lms_* on the LMS DB
Write a SQL migration file at `/var/www/kuizen-lms/sql/migrations/0001_init.sql` that:
1. Renames every remaining `qm_<name>` table to `lms_<name>` via `ALTER TABLE ... RENAME TO`.
2. Renames every RPC function (qm_join_class_by_code, qm_list_my_educator_classes, qm_is_class_ended, qm_block_submissions_when_ended, and ~20 more — enumerate from the schema dump) to lms_*.
3. Renames sequences, indexes, types, triggers, policies that reference qm_.
4. Updates `search_path`-style hardcoded references inside function bodies (search the schema dump for `qm_` to find them).

Fastest enumeration: `docker exec supabase-db-lms psql -U postgres -d postgres -tAc "SELECT 'ALTER TABLE public.' || tablename || ' RENAME TO ' || replace(tablename,'qm_','lms_') || ';' FROM pg_tables WHERE tablename LIKE 'qm\_%';"` gives you the rename statements; pipe to a file, review, then apply.

For functions: `SELECT 'ALTER FUNCTION public.' || proname || '(...) RENAME TO ' || replace(proname,'qm_','lms_') || ';' FROM pg_proc WHERE proname LIKE 'qm\_%';` — but function rename needs signature, so use `pg_get_function_identity_arguments(oid)` to build the full signature.

**Function bodies** reference qm_ tables internally — you must DROP and CREATE each function with the lms_ table names. Run as `supabase_admin` for functions originally owned by supabase_admin.

### 6.4 Verify
```
docker exec supabase-db-lms psql -U postgres -d postgres -tAc "SELECT tablename FROM pg_tables WHERE tablename LIKE 'lms\_%' ORDER BY tablename" | wc -l
# expect ~20 (28 minus the ~8 Team-only tables you dropped)
docker exec supabase-db-lms psql -U postgres -d postgres -tAc "SELECT tablename FROM pg_tables WHERE tablename LIKE 'qm\_%' ORDER BY tablename" | wc -l
# expect 0
```

---

## 7. Phase 5 — Codebase rename pass

Do this on `/var/www/kuizen-lms` ONLY. Never touch /var/www/questmaster-v2.

### 7.1 Find all qm_ references in source
```
cd /var/www/kuizen-lms
grep -rIn 'qm_' src/ --include='*.ts' --include='*.tsx' --include='*.sql' | wc -l
```

### 7.2 Controlled replace
Write a Node script (don't use sed for multi-line patterns — we learned that the hard way in the Team "End Class" work). Walk every .ts/.tsx file, replace `qm_` with `lms_` ONLY when it's inside a string literal that references a table/RPC/column, NOT in unrelated identifiers like variable names that happen to start with qm_ (rare but check).

Safer approach: replace specific known prefixes:
- `'qm_` → `'lms_` (single-quoted)
- `"qm_` → `"lms_` (double-quoted)
- `` `qm_ `` → `` `lms_ `` (template literal)
- `from('qm_X')` patterns in supabase-js calls
- `.rpc('qm_X')` patterns

### 7.3 Type names
There are TypeScript types like `Klass`, `EducatorClassRow`, etc. that don't need renaming. But there may be types like `QmClass`, `QmProfile` — if so, rename to `LmsClass`, `LmsProfile`. Search `grep -rn 'Qm[A-Z]' src/`.

### 7.4 Build, restart, smoke-test
```
cd /var/www/kuizen-lms
npm run build   # must pass with zero errors
pm2 restart kuizen-lms
pm2 logs kuizen-lms --lines 50   # check for runtime errors
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3011/
```

---

## 8. Phase 3 — Nginx + Let's Encrypt (do this AFTER user confirms DNS)

Do NOT attempt this until the user confirms `lms.kuizen.fun` and `api.lms.kuizen.fun` resolve to 187.127.113.249. Verify with `dig +short lms.kuizen.fun @8.8.8.8`.

### 8.1 Look at an existing site config for the template
```
cat /etc/nginx/sites-available/kuizen.fun
cat /etc/nginx/sites-available/lecturerhub.veltrix.technology
```
Mimic that structure exactly (HTTP → HTTPS redirect, proxy_pass, security headers, etc.).

### 8.2 Create two new site files
`/etc/nginx/sites-available/lms.kuizen.fun` → proxy_pass http://127.0.0.1:3011
`/etc/nginx/sites-available/api.lms.kuizen.fun` → proxy_pass http://127.0.0.1:8020

### 8.3 Enable and reload
```
ln -s /etc/nginx/sites-available/lms.kuizen.fun /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/api.lms.kuizen.fun /etc/nginx/sites-enabled/
nginx -t   # must pass
systemctl reload nginx
```

### 8.4 Get certificates
```
certbot --nginx -d lms.kuizen.fun -d api.lms.kuizen.fun --non-interactive --agree-tos -m <user-email-if-known-else-prompt>
```
Note: certbot will modify your nginx files to add the cert paths. That's fine, but verify with `nginx -t` and `systemctl reload nginx`.

### 8.5 Switch the LMS app env back to the public URL
Edit `/var/www/kuizen-lms/.env.local`: set `NEXT_PUBLIC_SUPABASE_URL=https://api.lms.kuizen.fun`. Rebuild and restart:
```
cd /var/www/kuizen-lms && npm run build && pm2 restart kuizen-lms
```

### 8.6 Smoke-test publicly
```
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' https://lms.kuizen.fun/
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' https://api.lms.kuizen.fun/
```

---

## 9. Phase 6 — Document, verify, hand back

### 9.1 Verify zero regression on the Team product
```
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' https://kuizen.fun/
pm2 ls   # questmaster-v2 still online
docker ps | grep -v lms | grep -v lh | grep supabase   # main stack still healthy
```

### 9.2 Append Change-log entries
Append a dated entry to BOTH:
- `/var/www/questmaster-v2/AGENT_HANDOFF.md` (Team's master log)
- `/var/www/kuizen-lms/AGENT_HANDOFF.md` (LMS's own log; create if not exists)

Document: what phases ran today, files changed, ports used, schema rename outcome, any deferred polish items.

### 9.3 Tell the user what's next
The LMS shell is up. The natural next session is to build the LMS-specific schema and the Udemy-style learner UI:
- New tables: `lms_courses`, `lms_lessons`, `lms_enrollments`, `lms_progress`, `lms_quiz_questions`, `lms_quiz_attempts`, `lms_certificates`, `lms_purchases`
- New educator pages: course builder, lesson editor, video upload
- New learner pages: course catalog, video player, progress tracker, certificate viewer

Do NOT start that work without explicit user direction — the user wants to discuss the schema/UI before you build it.

---

## 10. Known gotchas (things that bit us before)

1. **Terminal disconnects.** The Hostinger web terminal at `https://kul.hostingervps.com/2030/` drops sessions silently. If you see "connection closed unexpectedly," reconnect (the tab ID may change). All your work survives — it's just the SSH session that died.
2. **`docker exec supabase-db psql -U postgres` fails for some functions** with "must be owner." The fix is `docker exec -u root supabase-db-lms psql -U supabase_admin -d postgres`. The reason: gotrue and a few other Supabase-internal functions are owned by supabase_admin, not the postgres role.
3. **`docker compose down` does NOT delete bind-mount volumes.** Volumes are at `./volumes/db/data` (relative to compose dir). Data persists across down/up. Use `docker compose down -v` only if you intentionally want a clean Postgres init.
4. **Port 3010 looks free in lsof briefly but isn't.** Another tenant's next-server uses it. Use 3011 for LMS.
5. **`docker compose down` removed `volumes/functions/` content during the first up/down cycle in Phase 1.** If edge-functions-lms restart-loops with "could not find an appropriate entrypoint," re-copy from lecturerhub: `cp -a /opt/supabase-lecturerhub/volumes/functions /opt/supabase-lms/volumes/` and restart the container.
6. **`sed` regex often misses multi-line patterns** (especially TypeScript type definitions). Use Node.js with `findIndex` and line-based replacement for surgical edits.
7. **The Team app uses `description:` not `message:` in its ConfirmOptions type.** If you copy/paste confirm() calls, use `description`.
8. **The user wants the Team product folder kept as `questmaster-v2` forever** (no rename), and the Team PM2 process name stays `questmaster-v2`. The user-facing branding (Kuizen / Kuizen Team) is decoupled from the internal name.

---

## 11. Rollback plan (if anything goes sideways)

Your blast radius is contained: you only touch `/opt/supabase-lms`, `/var/www/kuizen-lms`, and two new nginx site files. To undo everything in order:

```
# 1. Stop and remove the LMS Next.js app
pm2 delete kuizen-lms
pm2 save

# 2. Remove nginx sites (if added)
rm -f /etc/nginx/sites-enabled/lms.kuizen.fun /etc/nginx/sites-enabled/api.lms.kuizen.fun
rm -f /etc/nginx/sites-available/lms.kuizen.fun /etc/nginx/sites-available/api.lms.kuizen.fun
nginx -t && systemctl reload nginx

# 3. Stop and remove the LMS Supabase stack (data preserved)
cd /opt/supabase-lms && docker compose down

# 4. (Optional, destructive) Nuke everything
rm -rf /var/www/kuizen-lms /opt/supabase-lms
```

The Team product, lecturerhub, and all other tenants remain untouched throughout.

---

## 12. Final checklist before handing back to user

- [ ] `/var/www/kuizen-lms` exists, builds, and PM2 shows `kuizen-lms` online on port 3011
- [ ] `/opt/supabase-lms` has no qm_* tables, has lms_* tables
- [ ] `curl http://127.0.0.1:3011/` returns 200/307
- [ ] If DNS ready: `https://lms.kuizen.fun/` returns 200/307 and `https://api.lms.kuizen.fun/` returns 401
- [ ] kuizen.fun still returns 307 (unchanged)
- [ ] `pm2 ls` shows 7 apps online (was 6, +1 for kuizen-lms)
- [ ] `docker ps | grep -c supabase` returns 36 (12 main + 12 lh + 12 lms)
- [ ] AGENT_HANDOFF.md entries appended in both repos
- [ ] No new files outside the four allowed paths (/var/www/kuizen-lms, /opt/supabase-lms, /etc/nginx/sites-{available,enabled}/{lms,api.lms}.kuizen.fun, /root/qm-backups/2026_05_20_phase*/)

Good luck. The user is technical and wants you to keep moving — don't ask for permission on contained, reversible operations.

