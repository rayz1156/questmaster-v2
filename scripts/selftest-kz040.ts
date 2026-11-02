/**
 * Ujian sendiri untuk i18n dwibahasa KZ-040.
 *
 * Jalankan:  npx tsx scripts/selftest-kz040.ts
 *
 * Kenapa fail ini wujud: `tsc` menyemak bentuk kamus, tetapi tidak
 * menyemak kandungan. Ujian ini menyemak:
 *   - `sahBahasa` menolak nilai kuki yang tidak dikenali (jatuh ke English),
 *   - `terjemah` mengendalikan kunci bersarang, interpolasi dan jamak,
 *   - kunci yang tiada memulangkan kunci itu sendiri dan memaklumkan
 *     `console.warn` sekali sahaja bagi setiap kunci,
 *   - SETIAP daun kamus English wujud dalam BM dan sebaliknya (rekursif),
 *   - tiada nilai kosong dan tiada em dash (\u2014) dalam mana-mana nilai.
 */

import { en } from '../src/lib/i18n/kamus/en';
import { ms } from '../src/lib/i18n/kamus/ms';
import { terjemah, terjemahBilangan, sahBahasa, KAMUS, type KunciKamus } from '../src/lib/i18n';

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

/* ===== Bahagian 1: sahBahasa ===== */

check('sahBahasa: lalai en', sahBahasa(undefined) === 'en');
check('sahBahasa: "en" kekal en', sahBahasa('en') === 'en');
check('sahBahasa: "ms" diterima', sahBahasa('ms') === 'ms');
check('sahBahasa: "MS" besar ditolak', sahBahasa('MS') === 'en');
check('sahBahasa: "bm" ditolak', sahBahasa('bm') === 'en');
check('sahBahasa: rentetan suntikan ditolak', sahBahasa('en"><script>') === 'en');
check('sahBahasa: nombor ditolak', sahBahasa(1) === 'en');
check('sahBahasa: null ditolak', sahBahasa(null) === 'en');
check('sahBahasa: objek ditolak', sahBahasa({ ms: true }) === 'en');

/* ===== Bahagian 2: terjemah ===== */

check(
  'terjemah: kunci bersarang en',
  terjemah('en', 'nav.home') === 'Home',
  terjemah('en', 'nav.home')
);
check(
  'terjemah: kunci bersarang ms',
  terjemah('ms', 'participant.leaderboard') === 'Papan Pendahulu',
  terjemah('ms', 'participant.leaderboard')
);
check(
  'terjemah: interpolasi en',
  terjemah('en', 'auth.sentLinkTo', { emel: 'ali@contoh.com' }) ===
    'We sent a verification link to ali@contoh.com.',
  terjemah('en', 'auth.sentLinkTo', { emel: 'ali@contoh.com' })
);
check(
  'terjemah: interpolasi ms',
  terjemah('ms', 'auth.resetLinkSentTo', { emel: 'ali@contoh.com' }) ===
    'Pautan tetapan semula dihantar ke ali@contoh.com.',
  terjemah('ms', 'auth.resetLinkSentTo', { emel: 'ali@contoh.com' })
);
check(
  'terjemah: pembolehubah tiada kekal `{nama}`',
  terjemah('en', 'participant.welcomeBackName', {}) === 'Welcome back, {nama}.',
  terjemah('en', 'participant.welcomeBackName', {})
);
check(
  'terjemah: nombor diinterpolasi',
  terjemah('ms', 'papan.dueInDays', { n: 5 }) === 'Tamat dalam 5 hari',
  terjemah('ms', 'papan.dueInDays', { n: 5 })
);
check(
  'terjemah: nilai sama antara bahasa boleh berbeza',
  terjemah('en', 'oauth.allowTitle', { nama: 'Claude' }) !== terjemah('ms', 'oauth.allowTitle', { nama: 'Claude' })
);

/* ===== Bahagian 3: jamak ===== */

check(
  'terjemahBilangan: satu (en)',
  terjemahBilangan('en', 'kelas.studentOne', 'kelas.studentOther', 1, { n: 1 }) === '1 student',
  terjemahBilangan('en', 'kelas.studentOne', 'kelas.studentOther', 1, { n: 1 })
);
check(
  'terjemahBilangan: ramai (en)',
  terjemahBilangan('en', 'kelas.studentOne', 'kelas.studentOther', 3, { n: 3 }) === '3 students',
  terjemahBilangan('en', 'kelas.studentOne', 'kelas.studentOther', 3, { n: 3 })
);
check(
  'terjemahBilangan: ms tanpa jamak nahu',
  terjemahBilangan('ms', 'kelas.studentOne', 'kelas.studentOther', 3, { n: 3 }) === '3 pelajar',
  terjemahBilangan('ms', 'kelas.studentOne', 'kelas.studentOther', 3, { n: 3 })
);
check(
  'terjemahBilangan: sifar dianggap ramai',
  terjemahBilangan('en', 'kelas.studentOne', 'kelas.studentOther', 0, { n: 0 }) === '0 students',
  terjemahBilangan('en', 'kelas.studentOne', 'kelas.studentOther', 0, { n: 0 })
);

/* ===== Bahagian 4: kunci tiada ===== */

const warnAsal = console.warn;
let bilanganWarn = 0;
const kunciSakit = 'nav.tiadaLangsung' as KunciKamus;
try {
  console.warn = () => { bilanganWarn++; };
  const hasil1 = terjemah('en', kunciSakit);
  terjemah('en', kunciSakit);
  terjemah('ms', kunciSakit);
  check('kunci tiada: kunci dikembalikan', hasil1 === 'nav.tiadaLangsung', hasil1);
  check('kunci tiada: warn sekali sahaja bagi setiap kunci', bilanganWarn === 1, bilanganWarn);
} finally {
  console.warn = warnAsal;
}
check(
  'kunci separuh sah ditolak sebagai tiada',
  terjemah('en', 'nav' as KunciKamus) === 'nav',
  terjemah('en', 'nav' as KunciKamus)
);

/* ===== Bahagian 5: keutuhan kamus (rekursif) ===== */

type HasilLaluan = { laluan: string[]; kosong: string[]; emDash: string[] };

function kumpulDaun(kamus: unknown, awalan = ''): HasilLaluan {
  const keluar: HasilLaluan = { laluan: [], kosong: [], emDash: [] };
  if (typeof kamus !== 'object' || kamus === null) return keluar;
  for (const [kunci, nilai] of Object.entries(kamus as Record<string, unknown>)) {
    const laluan = awalan ? `${awalan}.${kunci}` : kunci;
    if (typeof nilai === 'string') {
      keluar.laluan.push(laluan);
      if (nilai.trim() === '') keluar.kosong.push(laluan);
      if (nilai.includes('\u2014')) keluar.emDash.push(laluan);
    } else {
      const bawah = kumpulDaun(nilai, laluan);
      keluar.laluan.push(...bawah.laluan);
      keluar.kosong.push(...bawah.kosong);
      keluar.emDash.push(...bawah.emDash);
    }
  }
  return keluar;
}

const daunEn = kumpulDaun(en);
const daunMs = kumpulDaun(ms);
check('kamus: tiada nilai kosong dalam en', daunEn.kosong.length === 0, daunEn.kosong);
check('kamus: tiada nilai kosong dalam ms', daunMs.kosong.length === 0, daunMs.kosong);
check('kamus: tiada em dash dalam en', daunEn.emDash.length === 0, daunEn.emDash);
check('kamus: tiada em dash dalam ms', daunMs.emDash.length === 0, daunMs.emDash);

const setEn = new Set(daunEn.laluan);
const setMs = new Set(daunMs.laluan);
const hilangDalamMs = daunEn.laluan.filter((k) => !setMs.has(k));
const hilangDalamEn = daunMs.laluan.filter((k) => !setEn.has(k));
check(
  'kamus: setiap kunci en wujud dalam ms (rekursif)',
  hilangDalamMs.length === 0,
  hilangDalamMs
);
check(
  'kamus: setiap kunci ms wujud dalam en (rekursif)',
  hilangDalamEn.length === 0,
  hilangDalamEn
);
check('kamus: bilangan daun sama', daunEn.laluan.length === daunMs.laluan.length, [daunEn.laluan.length, daunMs.laluan.length]);
check('kamus: lebih satu daun diuji', daunEn.laluan.length > 200, daunEn.laluan.length);
check('kamus: KAMUS mengandungi kedua-dua bahasa', KAMUS.en === en && KAMUS.ms === ms);

// Semua daun mesti rentetan (bukan objek atau nombor) supaya terjemah selamat.
check('kamus: en hanya daun rentetan', Object.values(daunEn).every((x) => Array.isArray(x)));
check(
  'kamus: kunci jamak pasangan _one/_other lengkap dalam en',
  ['kelas.studentOne', 'kelas.studentOther'].every((k) => setEn.has(k)),
  ['kelas.studentOne', 'kelas.studentOther'].filter((k) => !setEn.has(k))
);

/* ===== Ringkasan ===== */

console.log('');
console.log(`LULUS ${pass} / ${pass + fail}`);
if (fail > 0) process.exit(1);