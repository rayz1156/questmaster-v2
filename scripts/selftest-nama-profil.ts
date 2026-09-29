/**
 * Ujian sendiri untuk kiraKemasKiniNamaIntro() (src/lib/namaProfil.ts), tiket V2-009.
 *
 * Jalankan:
 *   npx tsx scripts/selftest-nama-profil.ts
 *
 * Kenapa fail ini wujud: `npx tsc` dan `npm run build` tidak menyemak logik
 * fungsi tulen. Pepijat nama tidak segerak lulus kedua-dua semakan itu.
 */
import { kiraKemasKiniNamaIntro } from '../src/lib/namaProfil';

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

/* ===== Kes daripada tiket V2-009 ===== */

// Nama bukan kosong: kedua-dua lajur ditulis dengan nilai yang sama.
check('nama bukan kosong: intro dan display sama',
  JSON.stringify(kiraKemasKiniNamaIntro('Ali Baru'))
    === JSON.stringify({ intro_display_name: 'Ali Baru', display_name: 'Ali Baru' }),
  kiraKemasKiniNamaIntro('Ali Baru'));

// Jarak putih dibuang sebelum ditulis.
check('jarak putih dibuang',
  JSON.stringify(kiraKemasKiniNamaIntro('  Aminah  '))
    === JSON.stringify({ intro_display_name: 'Aminah', display_name: 'Aminah' }),
  kiraKemasKiniNamaIntro('  Aminah  '));

// Nama kosong: intro_display_name NULL sahaja, display_name TIDAK disentuh.
check('nama kosong: display_name tidak ditulis',
  JSON.stringify(kiraKemasKiniNamaIntro(''))
    === JSON.stringify({ intro_display_name: null }),
  kiraKemasKiniNamaIntro(''));

check('jarak putih sahaja: display_name tidak ditulis',
  JSON.stringify(kiraKemasKiniNamaIntro('   '))
    === JSON.stringify({ intro_display_name: null }),
  kiraKemasKiniNamaIntro('   '));

// null dan undefined dianggap kosong (panggilan kod lama mungkin hantar null).
check('null dianggap kosong',
  JSON.stringify(kiraKemasKiniNamaIntro(null as unknown as string))
    === JSON.stringify({ intro_display_name: null }),
  kiraKemasKiniNamaIntro(null as unknown as string));

/* ===== Had 80 aksara ===== */

// Tepat 80 aksara dikekalkan penuh.
const lapan80 = 'A'.repeat(80);
check('tepat 80 aksara kekal penuh',
  JSON.stringify(kiraKemasKiniNamaIntro(lapan80))
    === JSON.stringify({ intro_display_name: lapan80, display_name: lapan80 }),
  kiraKemasKiniNamaIntro(lapan80));

// 81 aksara dipotong kepada 80.
const lapan81 = 'B'.repeat(81);
const potong = kiraKemasKiniNamaIntro(lapan81);
check('81 aksara dipotong kepada 80',
  potong.display_name === 'B'.repeat(80) && potong.intro_display_name === 'B'.repeat(80),
  potong);

// Tepat 80 pada rentetan yang mula dengan jarak putih: trim dahulu, kemudian potong.
check('trim dahulu kemudian potong 80',
  JSON.stringify(kiraKemasKiniNamaIntro(' ' + 'C'.repeat(80)))
    === JSON.stringify({ intro_display_name: 'C'.repeat(80), display_name: 'C'.repeat(80) }),
  kiraKemasKiniNamaIntro(' ' + 'C'.repeat(80)));

console.log('');
console.log('Selesai: ' + pass + ' PASS, ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
