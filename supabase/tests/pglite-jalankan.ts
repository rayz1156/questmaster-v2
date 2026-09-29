/**
 * Pengalan PGlite untuk ujian SQL BEGIN/ROLLBACK (contoh supabase/tests/V2-008.sql).
 *
 * Tujuan (temuan CTO V2-008-baiki.md): jalankan fail ujian terhadap skema
 * production SEBELUM komit, tanpa menyentuh pangkalan data sebenar.
 *
 * Susunan penyediaan:
 *   1. Skema auth minimum (dump skema-production.sql tiada skema auth tetapi
 *      FK dan fungsi merujuk auth.users / auth.uid()). Struktur auth.users
 *      di sini adalah tapisan minimum Supabase; sisipan auth.users yang
 *      sebenar telah terbukti lulus di VPS (kegagalan VPS berlaku pada
 *      qm_profiles.plan, bukan auth.users).
 *   2. Dump production penuh (skema-production.sql), dilaksanakan
 *      kenyataan demi kenyataan secara toleran; ralat objek yang tidak
 *      berkaitan direkodkan sahaja.
 *   3. Pengganti migrasi 0040 yang diperlukan oleh ujian: lajur
 *      plan_expires_at, CHECK empat pelan, qm_effective_plan(p_user uuid)
 *      dan qm_set_plan(p_user uuid, p_plan text, p_expires timestamptz).
 *      Semantik diambil daripada dokumentasi tiket V2-008, kod pelayan
 *      (src/app/api/integrations/email/route.ts:26-28) dan ujian V2-002a
 *      (kes h1: pro tamat tempoh => free). Ini bukan migrasi sebenar;
 *      kuatkuasa sebenar kekal di VPS.
 *   4. Fail ujian dijalankan secara ketat; RAISE EXCEPTION menghentikan.
 *
 * Guna: npx tsx supabase/tests/pglite-jalankan.ts <fail-ujian.sql>
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Pemecah kenyataan SQL yang sedar tentang rentetan, komen dan dollar quote. */
function pecahKenyataan(sql: string): string[] {
  const hasil: string[] = [];
  let i = 0;
  let mula = 0;
  while (i < sql.length) {
    const c = sql[i];
    // Komen satu baris.
    if (c === "-" && sql[i + 1] === "-") {
      const j = sql.indexOf("\n", i);
      i = j === -1 ? sql.length : j + 1;
      continue;
    }
    // Komen blok (bersarang).
    if (c === "/" && sql[i + 1] === "*") {
      let dalam = 1;
      i += 2;
      while (i < sql.length && dalam > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") { dalam++; i += 2; }
        else if (sql[i] === "*" && sql[i + 1] === "/") { dalam--; i += 2; }
        else i++;
      }
      continue;
    }
    // Rentetan berpetik tunggal (padanan petik dua kali melarikan).
    if (c === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // Dollar quote: $$ atau $tag$.
    if (c === "$") {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const j = sql.indexOf(tag, i + tag.length);
        i = j === -1 ? sql.length : j + tag.length;
        continue;
      }
    }
    if (c === ";") {
      hasil.push(sql.slice(mula, i));
      i++;
      mula = i;
      continue;
    }
    i++;
  }
  hasil.push(sql.slice(mula));
  return hasil.map((s) => s.trim()).filter((s) => s.length > 0);
}

async function jalanToleran(
  db: PGlite,
  sql: string,
  label: string,
): Promise<number> {
  const kenyataan = pecahKenyataan(sql);
  let gagal = 0;
  for (const k of kenyataan) {
    try {
      await db.exec(k);
    } catch (e) {
      gagal++;
      if (gagal <= 20) {
        const mesej = String((e as Error).message ?? e).split("\n")[0];
        console.log(`  [LANGKAU] ${label}: ${mesej}`);
      }
    }
  }
  return gagal;
}

async function main() {
  const failUjian = resolve(process.argv[2] ?? "supabase/tests/V2-008.sql");
  const dump = "C:/Users/Hariz/hermes-briefs/kuizen/skema-production.sql";
  const db = new PGlite();

  // RAISE NOTICE dihantar melalui opsyen onNotice setiap panggilan exec
  // (PGlite 0.5.x tidak menyokong cangkuk konstruktor untuk notis).
  let lulus = 0;
  let gagal = 0;
  const terimaNotis = (n: unknown) => {
    const m = (n ?? {}) as { message?: string };
    const mesej = typeof n === "string" ? n : m.message ?? JSON.stringify(n);
    console.log(`  ${mesej}`);
    if (mesej.includes("LULUS")) lulus++;
    if (mesej.includes("GAGAL")) gagal++;
  };

  // 1. Peranan Supabase yang dirujuk GRANT/REVOKE dalam dump.
  const peranan = ["anon", "authenticated", "service_role", "supabase_admin", "authenticator"];
  for (const p of peranan) {
    try {
      await db.exec(`create role ${p} nologin;`);
    } catch {
      // Sudah wujud: abaikan.
    }
  }

  // 2. Skema auth minimum: auth.users dan auth.uid().
  // Skema extensions juga dicipta dahulu kerana dump merujuknya.
  await db.exec(`
    create schema if not exists auth;
    create schema if not exists extensions;
    create table if not exists auth.users (
      id uuid primary key,
      aud varchar(255) not null default 'authenticated',
      role varchar(255) not null default 'authenticated',
      email varchar(255),
      encrypted_password varchar(255),
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb not null default '{}'::jsonb,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz default now() not null,
      updated_at timestamptz default now() not null
    );
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$
        select nullif(
          coalesce(
            current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''
          ), ''
        )::uuid;
      $$;
    create or replace function auth.role() returns text
      language sql stable
      as $$
        select coalesce(
          current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''
        );
      $$;
  `);
  console.log("PROTOKOL: skema auth minimum sedia.");

  // 3. Dump production, toleran terhadap objek di luar skop ujian.
  const sqlDump = readFileSync(dump, "utf8");
  const gagalDump = await jalanToleran(db, sqlDump, "dump");
  console.log(`PROTOKOL: dump selesai, ${gagalDump} kenyataan dilangkau.`);

  // 3a. Sahkan jadual kunci benar-benar terbina dan plan NOT NULL.
  const semak = await db.exec(`
    select count(*)::int as bil,
           bool_or(not a.attnotnull) as ada_boleh_null
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'qm_profiles'
      and a.attname = 'plan' and a.attnum > 0;
  `);
  const barisSemak = (semak[0]?.rows?.[0] ?? {}) as { bil?: number; ada_boleh_null?: boolean | null };
  if (barisSemak.bil !== 1 || barisSemak.ada_boleh_null) {
    throw new Error("qm_profiles.plan tiada atau boleh null selepas muat dump: muatkan gagal");
  }
  console.log("PROTOKOL: qm_profiles.plan NOT NULL disahkan (skema production).");

  // Dump menetapkan client_min_messages = warning (baris 16) yang menekan
  // RAISE NOTICE ujian; pulihkan supaya notis LULUS/GAGAL sampai.
  await db.exec("set client_min_messages = notice;");

  // 4. Pengganti migrasi 0040 (bukan migrasi sebenar; lihat kepala fail).
  await db.exec(`
    alter table public.qm_profiles
      add column if not exists plan_expires_at timestamptz;
    alter table public.qm_profiles drop constraint if exists qm_profiles_plan_chk;
    alter table public.qm_profiles
      add constraint qm_profiles_plan_chk
      check (plan in ('free','pro','institution','unlimited'));

    create or replace function public.qm_effective_plan(p_user uuid) returns text
      language sql stable security definer
      set search_path = public
      as $$
        select case
          when p.id is null then null
          when p.role in ('admin','superadmin') then 'pro'
          when p.plan = 'pro' and p.plan_expires_at is not null
               and p.plan_expires_at < now() then 'free'
          else p.plan
        end
        from public.qm_profiles p where p.id = p_user;
      $$;

    create or replace function public.qm_set_plan(
      p_user uuid, p_plan text, p_expires timestamptz default null
    ) returns void
      language plpgsql security definer
      set search_path = public
      as $$
      begin
        if not public.qm_is_admin() then
          raise exception 'QM_FORBIDDEN: hanya pentadbir boleh menukar pelan'
            using errcode = 'P0001';
        end if;
        if p_plan not in ('free','pro','institution','unlimited') then
          raise exception 'QM_BAD_PLAN: pelan mesti free, pro, institution atau unlimited'
            using errcode = 'P0001';
        end if;
        update public.qm_profiles
           set plan = p_plan, plan_expires_at = p_expires
         where id = p_user;
      end;
      $$;
  `);
  console.log("PROTOKOL: pengganti 0040 sedia (plan_expires_at, CHECK empat pelan, qm_effective_plan, qm_set_plan).");

  // 5. Fail ujian dijalankan secara ketat.
  const sqlUjian = readFileSync(failUjian, "utf8");
  const kenyataan = pecahKenyataan(sqlUjian);
  console.log(`PROTOKOL: ${kenyataan.length} kenyataan ujian; pertama: ${kenyataan[0]?.slice(0, 60) ?? "TIADA"}`);
  try {
    for (const k of kenyataan) {
      await db.exec(k, { onNotice: terimaNotis });
    }
  } catch (e) {
    gagal++;
    console.log(`  RALAT: ${String((e as Error).message ?? e).split("\n")[0]}`);
  }

  console.log(`RINGKASAN: LULUS=${lulus} GAGAL=${gagal} (dump dilangkau=${gagalDump})`);
  await db.close();
  process.exit(gagal > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});