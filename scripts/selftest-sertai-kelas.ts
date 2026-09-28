/**
 * Ujian sendiri untuk normalisasi kod kelas tanpa pangkalan data.
 *
 * Jalankan:
 *   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=ujian npx tsx scripts/selftest-sertai-kelas.ts
 *
 * (Pembolehubah env diperlukan kerana src/lib/data.ts mengimport klien
 * Supabase semasa dimuatkan; tiada panggilan rangkaian dibuat di sini.)
 *
 * Cermin TypeScript ialah normalizeClassCode dalam src/lib/data.ts; logik
 * rujukan ialah public.qm_normalize_class_code dalam
 * supabase/migrations/0038_sertai_kelas_pratonton.sql. Kedua dua pelaksanaan
 * mesti kekal seiring: huruf besar, buang jarak/sengkang/garis bawah,
 * O -> 0, I dan L -> 1. Kes mengikat datang daripada tiket V2-004.
 *
 * Kenapa fail ini wujud: `npx tsc` dan `npm run build` tidak menyemak logik
 * fungsi tulen. Pertembungan pemetaan O/I/L (contohnya "IL0O") ialah
 * kegagalan senyap yang hanya kelihatan semasa pelajar gagal sertai kelas.
 */
import { normalizeClassCode } from '../src/lib/data';

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

/* ===== Kes mengikat daripada tiket V2-004 ===== */

// Tiket: " ab-cd 12o1 " -> ABCD1201
check('jarak dan sengkang dibuang, O jadi 0',
  normalizeClassCode(' ab-cd 12o1 ') === 'ABCD1201',
  normalizeClassCode(' ab-cd 12o1 '));

// Tiket: "il0o" -> 1100
check('I dan L jadi 1',
  normalizeClassCode('il0o') === '1100',
  normalizeClassCode('il0o'));

// Tiket: rentetan kosong.
check('rentetan kosong kekal kosong',
  normalizeClassCode('') === '',
  normalizeClassCode(''));

/* ===== Kes tambahan yang menyamai tingkah laku SQL ===== */

// Garis bawah dibuang.
check('garis bawah dibuang',
  normalizeClassCode('ab_cd34') === 'ABCD34',
  normalizeClassCode('ab_cd34'));

// Jarak di tengah dibuang.
check('jarak tengah dibuang',
  normalizeClassCode('ab12 cd34') === 'AB12CD34',
  normalizeClassCode('ab12 cd34'));

// O di posisi digit 0 (kes soalan sebenar pelajar).
check('O di posisi digit 0',
  normalizeClassCode('ABO1CD34') === 'AB01CD34',
  normalizeClassCode('ABO1CD34'));

// Huruf besar tidak berubah; kod hex sahi dibiarkan sama.
check('kod hex sahi tidak berubah',
  normalizeClassCode('AB12CD34') === 'AB12CD34',
  normalizeClassCode('AB12CD34'));

// Kombinasi paling jahat: I, L, O bercampur.
check('kombinasi IL0O',
  normalizeClassCode('IL0O') === '1100',
  normalizeClassCode('IL0O'));

// Rentetan jarak sahaja.
check('rentetan jarak sahaja menjadi kosong',
  normalizeClassCode('   ') === '',
  normalizeClassCode('   '));

// Tab dan baris baru dibuang (ulang tampal daripada mesej).
check('tab dan baris baru dibuang',
  normalizeClassCode('ab\t12\ncd') === 'AB12CD',
  normalizeClassCode('ab\t12\ncd'));

// Tab lebih daripada lapan aksara: panjang tidak dihadkan di sini,
// penapisan di pelayan menentukan kewujudan kelas.
check('lebih lapan aksara tidak dipotong',
  normalizeClassCode('ABCDEF123') === 'ABCDEF123',
  normalizeClassCode('ABCDEF123'));

console.log('');
console.log(`${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);