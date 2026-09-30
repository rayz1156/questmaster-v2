/**
 * Ujian sendiri untuk fungsi markah peserta (tiket V2-013).
 *
 * Jalankan:  npx tsx scripts/selftest-markah-peserta.ts
 *
 * Seperti selftest-live-quiz: `npx tsc` dan `npm run build` tidak menyemak
 * logik kedudukan seri dan pemisah ribuan, jadi ia diuji di sini dengan
 * data bercampur termasuk nilai negatif dan tidak sah.
 */
import { kiraKedudukan, formatMata } from '../src/lib/markahPeserta';

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

/* ===== Bahagian 1: kiraKedudukan ===== */

check('kedudukan: contoh tiket 100,90,90,80 memberi 1,2,2,4',
  JSON.stringify(kiraKedudukan([100, 90, 90, 80])) === '[1,2,2,4]',
  kiraKedudukan([100, 90, 90, 80]));

check('kedudukan: semua seri berkongsi tempat pertama',
  JSON.stringify(kiraKedudukan([50, 50, 50])) === '[1,1,1]',
  kiraKedudukan([50, 50, 50]));

check('kedudukan: satu pemain tempat pertama',
  JSON.stringify(kiraKedudukan([7])) === '[1]',
  kiraKedudukan([7]));

check('kedudukan: senarai kosong',
  JSON.stringify(kiraKedudukan([])) === '[]',
  kiraKedudukan([]));

check('kedudukan: input tidak tersusun kekal selari',
  JSON.stringify(kiraKedudukan([80, 100, 90])) === '[3,1,2]',
  kiraKedudukan([80, 100, 90]));

check('kedudukan: negatif disokong',
  JSON.stringify(kiraKedudukan([-10, -20])) === '[1,2]',
  kiraKedudukan([-10, -20]));

check('kedudukan: NaN dirawat sebagai 0',
  JSON.stringify(kiraKedudukan([0, NaN, 10])) === '[2,2,1]',
  kiraKedudukan([0, NaN, 10]));

check('kedudukan: dua seri di tengah lompat ke 4',
  JSON.stringify(kiraKedudukan([100, 90, 90, 90, 80])) === '[1,2,2,2,5]',
  kiraKedudukan([100, 90, 90, 90, 80]));

check('kedudukan: nilai besar tidak melimpah',
  JSON.stringify(kiraKedudukan([1000000, 999999, 1000000])) === '[1,3,1]',
  kiraKedudukan([1000000, 999999, 1000000]));

/* ===== Bahagian 2: formatMata ===== */

check('format: sifar', formatMata(0) === '0', formatMata(0));
check('format: ribuan', formatMata(1234) === '1,234', formatMata(1234));
check('format: jutaan', formatMata(1234567) === '1,234,567', formatMata(1234567));
check('format: negatif bertanda', formatMata(-98765) === '-98,765', formatMata(-98765));
check('format: NaN jadi 0', formatMata(NaN) === '0', formatMata(NaN));
check('format: pembundaran integer', formatMata(1234.6) === '1,235', formatMata(1234.6));
check('format: nilai bukan integer dibundarkan',
  formatMata(999.4) === '999' && formatMata(999.5) === '1,000',
  [formatMata(999.4), formatMata(999.5)]);

/* ===== Ringkasan ===== */

console.log('');
console.log(`${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);
