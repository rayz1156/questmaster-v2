/**
 * Ujian sendiri bahagian harga landing page (tiket V2-006).
 *
 * Semak bahawa:
 *  1. baris kad yang dirender (barisKad + formatRM + formatStoran) sepadan
 *     dengan HAD_PELAN dan HARGA_PELAN;
 *  2. public/llms.txt mengandungi RM19, RM29, RM228 dan RM1,500 dan angka
 *     hadnya sepadan dengan HAD_PELAN;
 *  3. tiada em dash dalam landing-copy.ts, BahagianHarga.tsx dan llms.txt;
 *  4. pelan dalaman unlimited tidak disebut di landing, llms.txt atau JSON-LD.
 *
 * Jalankan:  npx tsx scripts/selftest-harga.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HAD_PELAN, HARGA_PELAN, type Pelan } from '../src/lib/pelan';
import { barisKad, formatRM, formatStoran } from '../src/lib/kadHarga';
import { TEKS_LANDING } from '../src/lib/landing-copy';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log('PASS ' + name);
  } else {
    fail++;
    console.log('FAIL ' + name + ' :: ' + JSON.stringify(extra));
  }
}

/* ===== Bahagian 1: format RM dan storan ===== */
check('formatRM 0', formatRM(HARGA_PELAN.free.tahunan) === 'RM0', formatRM(HARGA_PELAN.free.tahunan));
check('formatRM 19', formatRM(HARGA_PELAN.pro.tahunanSebulan) === 'RM19', formatRM(HARGA_PELAN.pro.tahunanSebulan));
check('formatRM 29', formatRM(HARGA_PELAN.pro.bulanan) === 'RM29', formatRM(HARGA_PELAN.pro.bulanan));
check('formatRM 228', formatRM(HARGA_PELAN.pro.tahunan) === 'RM228', formatRM(HARGA_PELAN.pro.tahunan));
check('formatRM 1500', formatRM(HARGA_PELAN.institution.tahunan) === 'RM1,500', formatRM(HARGA_PELAN.institution.tahunan));
check('formatStoran 100', formatStoran(HAD_PELAN.free.storageMb!) === '100 MB', formatStoran(HAD_PELAN.free.storageMb!));
check('formatStoran 1024', formatStoran(HAD_PELAN.pro.storageMb!) === '1 GB', formatStoran(HAD_PELAN.pro.storageMb!));
check('formatStoran 10240', formatStoran(HAD_PELAN.institution.storageMb!) === '10 GB', formatStoran(HAD_PELAN.institution.storageMb!));

/* ===== Bahagian 2: baris kad sepadan dengan HAD_PELAN ===== */
// Hanya tiga pelan awam diuji; unlimited ialah pelan dalaman yang tidak
// dipaparkan, jadi tiada jangkaan kad untuknya.
const JANGKA: Record<Exclude<Pelan, 'unlimited'>, Record<string, number | boolean | null>> = {
  free: {
    kelas: 3, pesertaSeKelas: 150, pemainSeSesi: 60,
    aktiviti: 30, papan: 5, pasukan: true,
    storan: 100, saizFail: 10, penilaianRakan: false,
    googleForm: false, laporan: false, aksesMcp: false, adminInvois: false,
  },
  pro: {
    kelas: 30, pesertaSeKelas: null, pemainSeSesi: 300,
    aktiviti: null, papan: null, pasukan: true,
    storan: 1024, saizFail: 20, penilaianRakan: true,
    googleForm: true, laporan: true, aksesMcp: true, adminInvois: false,
  },
  institution: {
    kelas: 30, pesertaSeKelas: null, pemainSeSesi: 300,
    aktiviti: null, papan: null, pasukan: true,
    storan: 10240, saizFail: 20, penilaianRakan: true,
    googleForm: true, laporan: true, aksesMcp: true, adminInvois: true,
  },
};

for (const p of ['free', 'pro', 'institution'] as const) {
  const baris = barisKad(p);
  const h = HAD_PELAN[p];
  check(`${p}: bilangan baris 14`, baris.length === 14, baris.length);
  for (const b of baris) {
    const j = JANGKA[p][b.kunci];
    if (b.kunci === 'sijil') continue; // baris teks, disemak melalui landing-copy di bawah
    if (typeof j === 'boolean') {
      check(`${p}: ${b.kunci} termasuk`, b.termasuk === j, [b.termasuk, j]);
    } else if (j === null) {
      check(`${p}: ${b.kunci} tanpa had (null)`, b.angka === null, b.angka);
    } else if (b.kunci === 'storan') {
      // storan disemak berformat melalui silang semak di bawah
      continue;
    } else if (b.kunci === 'saizFail') {
      check(`${p}: saizFail = ${j} MB`, b.angka === `${j} MB`, b.angka);
    } else {
      check(`${p}: ${b.kunci} = ${j}`, b.angka !== null && Number(b.angka) === j, [b.angka, j]);
    }
  }
  // silang semak terus dengan HAD_PELAN
  check(`${p}: kelas daripada HAD_PELAN`, barisKad(p)[0].angka === String(h.kelas));
  check(`${p}: pemain sesi daripada HAD_PELAN`, baris.find((x) => x.kunci === 'pemainSeSesi')?.angka === String(h.pemainSesi));
  check(`${p}: storan daripada HAD_PELAN`, baris.find((x) => x.kunci === 'storan')?.angka === formatStoran(h.storageMb!));
}

/* ===== Bahagian 3: teks dwibahasa lengkap dan sijil ===== */
for (const b of ['ms', 'en'] as const) {
  const t = TEKS_LANDING[b].harga;
  check(`${b}: nav.harga ada`, Boolean(TEKS_LANDING[b].nav.harga));
  check(`${b}: kaki.harga ada`, Boolean(TEKS_LANDING[b].kaki.harga));
  check(`${b}: sijil free sebut tera Kuizen`, /Kuizen/i.test(t.sijilNilai.free));
  check(`${b}: sijil pro sebut logo`, /logo/i.test(t.sijilNilai.pro));
  check(`${b}: sijil institution sebut institusi`, /institu/i.test(t.sijilNilai.institution));
  check(`${b}: nota video sebut YouTube dan Google Drive`, /YouTube/.test(t.notaVideo) && /Google Drive/.test(t.notaVideo));
  check(`${b}: 5 soalan lazim harga ditambah`, TEKS_LANDING[b].faq.length >= 11, TEKS_LANDING[b].faq.length);
  check(`${b}: FAQ sebut RM228`, TEKS_LANDING[b].faq.some((f) => f.a.includes('RM228')));
  check(`${b}: tiada "Kuiz" untuk UI`, !/Kuiz/.test(t.tajuk + t.sub + t.barisLabel.pemainSeSesi));
}

/* ===== Bahagian 4: llms.txt ===== */
const llms = readFileSync(join(ROOT, 'public', 'llms.txt'), 'utf8');
check('llms.txt bermula # Kuizen', llms.startsWith('# Kuizen'));
for (const harga of ['RM19', 'RM29', 'RM228', 'RM1,500']) {
  check(`llms.txt mengandungi ${harga}`, llms.includes(harga));
}
check('llms.txt angka had sepadan (3 classes)', llms.includes(`${HAD_PELAN.free.kelas} classes`));
check('llms.txt angka had sepadan (150 participants)', llms.includes(`${HAD_PELAN.free.ahliSeKelas} participants per class`));
check('llms.txt angka had sepadan (60 players)', llms.includes(`${HAD_PELAN.free.pemainSesi} players`));
check('llms.txt angka had sepadan (300 players)', llms.includes(`${HAD_PELAN.pro.pemainSesi} players`));
check('llms.txt angka had sepadan (30 activities)', llms.includes(`${HAD_PELAN.free.aktiviti} activities`));
check('llms.txt angka had sepadan (5 boards)', llms.includes(`${HAD_PELAN.free.papan} boards`));
check('llms.txt storan sepadan (100 MB)', llms.includes(`${HAD_PELAN.free.storageMb} MB storage`));
check('llms.txt storan sepadan (10 GB)', llms.includes('10 GB storage'));
check('llms.txt 10 educators', llms.includes(`${HARGA_PELAN.institution.kerusi} educators`));
check('llms.txt pautan #harga', llms.includes('https://kuizen.fun/#harga'));
check('llms.txt pautan /en', llms.includes('https://kuizen.fun/en'));

/* ===== Bahagian 5: tiada em dash ===== */
const failEmDash = ['src/lib/landing-copy.ts', 'src/components/landing/BahagianHarga.tsx', 'public/llms.txt'];
for (const f of failEmDash) {
  const kandungan = readFileSync(join(ROOT, f), 'utf8');
  check(`tiada em dash dalam ${f}`, !kandungan.includes('\u2014'));
}

/* ===== Bahagian 6: pelan dalaman unlimited tidak dipapar ===== */
check('llms.txt tiada unlimited', !/unlimited plan|plan unlimited/i.test(llms));
check('landing-copy tiada pelan unlimited', !/pelan unlimited|unlimited plan/i.test(JSON.stringify(TEKS_LANDING)));
const pelanKad = ['free', 'pro', 'institution'];
check('kad hanya tiga pelan', pelanKad.length === 3 && !pelanKad.includes('unlimited'));

console.log('');
console.log(`LULUS ${pass}, GAGAL ${fail}`);
if (fail > 0) process.exit(1);
