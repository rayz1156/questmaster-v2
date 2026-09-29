/**
 * Menjalankan fail SQL ujian terhadap PGlite (Postgres dalam WASM).
 *
 * Guna: node supabase/tests/jalankan-pglite.mjs <fail.sql>
 * Skema dimuat: skema-production.sql (dump) + 0040, 0041, 0042, 0043, 0044.
 * Penemuan 2 (kzqa): db.onNotice TIDAK menangkap RAISE NOTICE pada pglite
 * 0.5.8, jadi keputusan LULUS/GAGAL dibaca terus dari pg_temp.qm_verdicts
 * SEBELUM ROLLBACK (pelari membuang ROLLBACK terakhir fail ujian, membaca
 * jadual keputusan, mencetak ringkasan, kemudian membatalkan sendiri).
 * Kod keluar 1 jika ada semakan GAGAL.
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

async function jalankan(sql, label) {
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
    process.exit(1);
  }
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
-- Jadual auth.users minimum (FK qm_profiles merujuknya). Lajur pelengkap
-- dipadankan dengan INSERT seed ujian sijil (V2-003b.sql) supaya seed yang
-- sama boleh lari di psql VPS dan di PGlite.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid primary key,
  email text,
  encrypted_password text,
  aud text,
  role text,
  email_confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now());
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
for (const m of ['0040_pelan_v2.sql', '0041_kuota_storan.sql', '0042_sijil.sql', '0043_minat_pelan.sql', '0044_sijil_emel.sql']) {
  await jalankan(readFileSync(path.join(repo, 'supabase', 'migrations', m), 'utf8'), m);
}
// Buang ROLLBACK terakhir fail ujian supaya jadual keputusan masih boleh
// dibaca; pelari membatalkan transaksi sendiri pada akhir.
const barisAsal = readFileSync(path.join(repo, 'supabase', 'tests', fail), 'utf8').split('\n');
let akhir = barisAsal.length - 1;
while (akhir >= 0 && barisAsal[akhir].trim() === '') akhir--;
if (akhir >= 0 && /^ROLLBACK\b/i.test(barisAsal[akhir].trim())) {
  barisAsal.splice(akhir, 1);
}
await jalankan(barisAsal.join('\n'), fail);

// Baca keputusan LULUS/GAGAL dari pg_temp.qm_verdicts (dibuat oleh fail ujian).
let gagal = 0;
try {
  const hasil = await db.query(
    'select k, ok, detail from pg_temp.qm_verdicts order by k');
  for (const r of hasil.rows) {
    if (!r.ok) gagal++;
    console.log(`${r.ok ? 'LULUS' : 'GAGAL'} ${r.k}: ${r.detail}`);
  }
  if (hasil.rows.length === 0) {
    console.log('RINGKASAN: tiada keputusan dalam pg_temp.qm_verdicts');
  } else if (gagal === 0) {
    console.log(`RINGKASAN: semua ${hasil.rows.length} semakan LULUS`);
  } else {
    console.log(`RINGKASAN: ${gagal} daripada ${hasil.rows.length} semakan GAGAL`);
  }
} catch (e) {
  console.log('RINGKASAN: tiada jadual pg_temp.qm_verdicts (' + e.message + ')');
}

await db.exec('ROLLBACK');
await db.close();
if (gagal > 0) process.exit(1);
console.log('SELESAI: transaksi dibatalkan, tiada data kekal');
