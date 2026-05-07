# Storage JWT signature verification fix (2026-05-07)

## Symptom
`signature verification failed` when uploading via Supabase Storage,
while DB queries via PostgREST keep working.

## Root cause
- `supabase-storage` container had a stale AUTH_JWT_SECRET that did NOT
  match GOTRUE_JWT_SECRET used by supabase-auth to sign user JWTs.
- The stale value came from a leaked shell env var (JWT_SECRET=...)
  that overrode the value in /opt/supabase/supabase/docker/.env when
  running `docker compose up`. Compose precedence: shell env > .env.
- Side-effect: after force-recreate the storage role password no longer
  matched POSTGRES_PASSWORD in .env, causing 28P01 auth_failed loops.

## Fix
1. unset JWT_SECRET ANON_KEY SERVICE_ROLE_KEY SERVICE_KEY POSTGRES_PASSWORD
2. As `supabase_admin`:
   ALTER USER supabase_storage_admin WITH PASSWORD '<value-from-.env>';
3. cd /opt/supabase/supabase/docker && docker compose up -d --force-recreate storage
4. Verify: docker exec supabase-storage env | grep AUTH_JWT_SECRET
   must equal GOTRUE_JWT_SECRET from supabase-auth.
