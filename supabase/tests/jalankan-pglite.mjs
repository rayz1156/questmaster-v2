/**
 * Menjalankan fail SQL ujian terhadap PGlite (Postgres dalam WASM).
 *
 * Guna: node supabase/tests/jalankan-pglite.mjs <fail.sql>
 * Skema dimuat: skema-production.sql (dump) + 0040, 0041, 0042, 0043.
 * PGlite ialah superuser tunggal; set_config('role', ...) dijalan seperti biasa.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, '..', '..');
const brief = 'C:/Users/Hariz/hermes-briefs/kuizen';

const fail = process.argv[2];
if (!fail) {
  console.error('Guna: node jalankan-pglite.mjs <fail.sql>');
  process.exit(2);
}

const db = new PGlite();

// Kumpul RAISE NOTICE dari setiap pernyataan untuk laporan LULUS/GAGAL.
const notis = [];
db.onNotice = (n) => notis.push(n.message ?? String(n));

async function jalankan(sql, label) {
  notis.length = 0;
  try {
    await db.exec(sql);
  } catch (e) {
    console.error(`RALAT [${label}]: ${e.message}`);
    // PGlite: ralat berlapis (e.cause) membawa baris dan konteks asal
    let punca = e;
    while (punca.cause) {
      punca = punca.cause;
      console.error('   punca:', punca.message ?? punca);
      if (punca.where) {
        console.error('   where:', String(punca.where).split('\n').slice(0, 4).join(' | '));
      }
    }
    // Petik baris SQL yang bermasalah untuk memudahkan pembetulan
    const baris = String(sql).split('\n');
    const n = Number((e.message.match(/line (\d+)/i) || [])[1] || 0);
    if (n > 0) {
      console.error(`   ${n}: ${baris[n - 1] ?? ''}`);
    }
    for (const t of notis) console.log('NOTIS:', t);
    process.exit(1);
  }
  for (const t of notis) console.log('NOTIS:', t);
}

// PGlite sudah ada skema public; buang CREATE SCHEMA public pendua dalam dump.
const skema = readFileSync(path.join(brief, 'skema-production.sql'), 'utf8')
  .replace(/^CREATE SCHEMA public;$/m, 'CREATE SCHEMA IF NOT EXISTS public;');
// Dump merujuk peranan VPS yang tiada dalam PGlite; cipta supaya dump lulus.
await jalankan(`DO $roles$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['supabase_admin','service_role','anon','authenticated','authenticator','supabase_storage_admin','pgsodium_keyholder','pgsodium_keyiduser','pgsodium_keyholder_user'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
  ALTER ROLE supabase_admin LOGIN SUPERUSER;
END $roles$;`, 'peranan');
await jalankan(`CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE OR REPLACE FUNCTION extensions.uuid_generate_v4() RETURNS uuid
  AS $$ SELECT gen_random_uuid() $$ LANGUAGE sql;
-- auth.uid() merujuk request.jwt.claims yang diikat oleh pembantu ujian.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  AS $fn$ SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $fn$
  LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  AS $fn$
  DECLARE v_claims text := current_setting('request.jwt.claims', true);
  BEGIN
    IF v_claims IS NULL OR v_claims = '' THEN RETURN NULL; END IF;
    RETURN COALESCE(
      substr(v_claims, position('"sub"' in v_claims) + 7, 36)::uuid, NULL);
  END;
  $fn$ LANGUAGE plpgsql STABLE;
-- Jadual auth.users minimum (FK qm_profiles merujuknya).
CREATE TABLE IF NOT EXISTS auth.users (id uuid primary key, email text);
INSERT INTO auth.users (id, email) VALUES
  ('11111111-0000-0000-0000-0000000000a1', 'ed@u.t'),
  ('11111111-0000-0000-0000-0000000000a2', 'ed2@u.t'),
  ('11111111-0000-0000-0000-0000000000b1', 'p1@u.t'),
  ('11111111-0000-0000-0000-0000000000b2', 'p2@u.t'),
  ('11111111-0000-0000-0000-0000000000b3', 'p3@u.t')
ON CONFLICT (id) DO NOTHING;
-- Jadual storage minimum untuk polisi bucket migrasi sijil.
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text,
  owner uuid, metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`, 'skema-extensions');
await jalankan(skema, 'skema');
for (const m of ['0040_pelan_v2.sql', '0041_kuota_storan.sql', '0042_sijil.sql', '0043_minat_pelan.sql']) {
  await jalankan(readFileSync(path.join(repo, 'supabase', 'migrations', m), 'utf8'), m);
}
await jalankan(readFileSync(path.join(repo, 'supabase', 'tests', fail), 'utf8'), fail);
console.log('SELESAI: semua SQL dijalankan tanpa ralat');
await db.close();
