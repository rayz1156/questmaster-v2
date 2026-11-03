/**
 * Ujian sendiri untuk KZ-043 (dwibahasa fasa 4).
 *
 * Jalankan:  npx tsx scripts/selftest-kz043.ts
 *
 * Semakan (mengikut tiket A7):
 *   (a) terjemahRalat en/ms dan sandaran rentetan tiada padanan,
 *   (b) setiap literal pertama dalam ralatJson(...) pada SEMUA
 *       route.ts di bawah src/app/api wujud dalam RALAT_MS (0 hilang),
 *   (c) tiada em dash dalam ralat-api.ms.ts, emel.ts dan kamus,
 *   (d) templat e-mel en/ms: subjek tidak kosong dan <script> di-escape,
 *   (e) migrasi 0074 wujud dan mengandungi semakan bahasa ('en','ms').
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { RALAT_MS } from '../src/lib/i18n/kamus/ralat-api.ms';
import { terjemahRalat } from '../src/lib/i18n/ralatApi';
import {
  emelSijil,
  emelJemputanKelas,
  emelJemputanPendidik,
  emelPendidikMenunggu,
  escapeHtml,
} from '../src/lib/i18n/emel';
import { en } from '../src/lib/i18n/kamus/en';
import { ms } from '../src/lib/i18n/kamus/ms';

let pass = 0;
let fail = 0;
function check(nama: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log('PASS ' + nama);
  } else {
    fail++;
    console.log('FAIL ' + nama + ' :: ' + JSON.stringify(extra));
  }
}

const AKAR = path.resolve(__dirname, '..');

/* ===== (a) terjemahRalat ===== */

check('terjemahRalat: en kekal English', terjemahRalat('en', 'Forbidden') === 'Forbidden');
check('terjemahRalat: ms diterjemah', terjemahRalat('ms', 'Forbidden') === 'Akses ditolak.');
check(
  'terjemahRalat: ms sandaran rentetan tiada padanan',
  terjemahRalat('ms', 'PLAN_LIMIT') === 'PLAN_LIMIT'
);
check(
  'terjemahRalat: ms sandaran ralat mesin Supabase',
  terjemahRalat('ms', 'duplicate key value violates unique constraint') ===
    'duplicate key value violates unique constraint'
);

/* ===== (b) imbasan ralatJson dalam semua laluan API ===== */

function senaraiRoute(dir: string): string[] {
  const keluar: string[] = [];
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const penuh = path.join(dir, entri.name);
    if (entri.isDirectory()) keluar.push(...senaraiRoute(penuh));
    else if (entri.name === 'route.ts') keluar.push(penuh);
  }
  return keluar;
}

// Literal pertama dalam ralatJson(...): petikan ' atau ", atau backtick
// TANPA interpolasi (backtick dengan ${...} sengaja dibiarkan English
// mengikut tiket B3, jadi ia tidak diwajibkan dalam RALAT_MS).
function literalRalat(kandungan: string): string[] {
  const keluar: string[] = [];
  const re = /ralatJson\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(kandungan)) !== null) {
    if (m[1] === '`' && m[2].includes('${')) continue;
    keluar.push(m[2]);
  }
  return keluar;
}

const failRoute = senaraiRoute(path.join(AKAR, 'src', 'app', 'api'));
const hilangRalat = new Set<string>();
let jumlahRalat = 0;
for (const f of failRoute) {
  const kandungan = fs.readFileSync(f, 'utf8');
  for (const lit of literalRalat(kandungan)) {
    jumlahRalat++;
    if (!(lit in RALAT_MS)) hilangRalat.add(lit);
  }
}
check(
  `ralatJson: semua ${jumlahRalat} literal ada dalam RALAT_MS (0 hilang)`,
  hilangRalat.size === 0,
  Array.from(hilangRalat)
);

/* ===== (c) tiada em dash ===== */

const failEmDash = [
  'src/lib/i18n/kamus/ralat-api.ms.ts',
  'src/lib/i18n/emel.ts',
  'src/lib/i18n/kamus/en.ts',
  'src/lib/i18n/kamus/ms.ts',
];
for (const rel of failEmDash) {
  const kandungan = fs.readFileSync(path.join(AKAR, rel), 'utf8');
  check(`em dash: ${rel}`, !kandungan.includes('\u2014'));
}
// Nilai kamus (bukan hanya fail ralat) turut disemak melalui kumpulan en/ms.
function kumpulNilai(kamus: unknown, keluar: string[] = []): string[] {
  if (typeof kamus !== 'object' || kamus === null) return keluar;
  for (const nilai of Object.values(kamus as Record<string, unknown>)) {
    if (typeof nilai === 'string') keluar.push(nilai);
    else kumpulNilai(nilai, keluar);
  }
  return keluar;
}
check(
  'em dash: tiada dalam nilai kamus en',
  kumpulNilai(en).every((v) => !v.includes('\u2014'))
);
check(
  'em dash: tiada dalam nilai kamus ms',
  kumpulNilai(ms).every((v) => !v.includes('\u2014'))
);

/* ===== (d) templat e-mel en/ms ===== */

const SAKIT = '<script>alert(1)</script>';
for (const bahasa of ['en', 'ms'] as const) {
  const sijil = emelSijil(bahasa, {
    program: SAKIT,
    kod: 'ABC123',
    senaraiUrl: 'https://kuizen.fun/participant/certificates',
    sahUrl: 'https://kuizen.fun/sijil/ABC123',
    adaLampiran: true,
  });
  check(`emel sijil ${bahasa}: subjek tidak kosong`, sijil.subject.length > 0, sijil.subject);
  check(
    `emel sijil ${bahasa}: <script> di-escape dalam html`,
    !sijil.html.includes('<script>') && sijil.html.includes('&lt;script&gt;')
  );

  const jemputan = emelJemputanKelas(bahasa, {
    namaKelas: SAKIT,
    pautan: 'https://kuizen.fun/join/ABCDEF',
  });
  check(
    `emel jemputan kelas ${bahasa}: subjek tidak kosong`,
    jemputan.subject.length > 0,
    jemputan.subject
  );
  check(
    `emel jemputan kelas ${bahasa}: <script> di-escape dalam html`,
    !jemputan.html.includes('<script>') && jemputan.html.includes('&lt;script&gt;')
  );

  const pendidik = emelJemputanPendidik(bahasa, {
    namaPenghantar: 'Dr Hariz',
    namaKelas: SAKIT,
    emelPenerima: 'guru@contoh.com',
    kod: 'ABCD1234',
    pautanTerima: 'https://kuizen.fun/educator/invites?code=ABCD1234',
    pautanSesi: 'https://kuizen.fun/educator/invites',
  });
  check(
    `emel jemputan pendidik ${bahasa}: subjek tidak kosong`,
    pendidik.subject.length > 0,
    pendidik.subject
  );
  check(
    `emel jemputan pendidik ${bahasa}: <script> di-escape dalam html`,
    !pendidik.html.includes('<script>') && pendidik.html.includes('&lt;script&gt;')
  );
  check(
    `emel jemputan pendidik ${bahasa}: badan teks ada`,
    pendidik.text.length > 0
  );

  const menunggu = emelPendidikMenunggu(bahasa, {
    nama: SAKIT,
    emel: 'baru@contoh.com',
    tarikhDaftar: '2026-11-04 10:00',
    pautanSemak: 'https://kuizen.fun/admin/users',
  });
  check(
    `emel pendidik menunggu ${bahasa}: subjek tidak kosong`,
    menunggu.subject.length > 0,
    menunggu.subject
  );
  check(
    `emel pendidik menunggu ${bahasa}: <script> di-escape dalam html`,
    !menunggu.html.includes('<script>') && menunggu.html.includes('&lt;script&gt;')
  );
}
check(
  'escapeHtml: & < > " \' di-escape',
  escapeHtml('&<">\'') === '&amp;&lt;&quot;&gt;&#39;'
);

/* ===== (e) migrasi 0074 ===== */

const pMigrasi = path.join(AKAR, 'supabase', 'migrations', '0074_bahasa_profil.sql');
check('migrasi 0074 wujud', fs.existsSync(pMigrasi), pMigrasi);
if (fs.existsSync(pMigrasi)) {
  const kandungan = fs.readFileSync(pMigrasi, 'utf8');
  check(
    'migrasi 0074: semakan bahasa (en, ms)',
    kandungan.includes("check (bahasa in ('en','ms'))"),
    kandungan
  );
}

/* ===== Ringkasan ===== */

console.log('');
console.log(`LULUS ${pass} / ${pass + fail}`);
if (fail > 0) process.exit(1);
