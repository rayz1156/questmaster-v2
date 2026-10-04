/**
 * Ujian sendiri KZ-008: pembantu tulen emel sijil tanpa pangkalan data
 * dan tanpa rangkaian.
 *
 * Jalankan:  npx tsx scripts/selftest-kz008.ts
 *
 * Kenapa fail ini wujud: `npx tsc` dan `npm run build` tidak menyemak logik.
 * Penapis pdf_path ialah pertahanan keselamatan (laluan di luar folder kelas
 * atau mengandungi `..` tidak pernah dimuat turun) dan untukSetiap ialah
 * enjin keserentakan penghantaran; kedua-duanya senyap salah.
 */
import { pathSelamat, untukSetiap, MAKS_LAMPIRAN, MAKS_SEKALI } from '../src/lib/sijil/emelSijil';

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

/* ===== Bahagian 1: penapis pdf_path ===== */

const kelas = '11111111-2222-3333-4444-555555555555';

check('laluan sah kelas ini', pathSelamat(`${kelas}/AB12CD34.pdf`, kelas) === true);
check('laluan dengan aksara kod penuh', pathSelamat(`${kelas}/ABCDEFGH.pdf`, kelas) === true);

// Kelas lain: walaupun berakhir .pdf, prefix kelas tak sepadan.
check('laluan kelas lain ditolak', pathSelamat(`99999999-2222-3333-4444-555555555555/X.pdf`, kelas) === false);
// Tanpa folder kelas langsung.
check('laluan tanpa folder kelas ditolak', pathSelamat('AB12CD34.pdf', kelas) === false);

// Menaik direktori: tidak pernah dimuat turun.
check('laluan .. ditolak (tengah)', pathSelamat(`${kelas}/../rahsia.pdf`, kelas) === false);
check('laluan .. ditolak (awal)', pathSelamat(`${kelas}/..%2Fx.pdf`, kelas) === false);
check('laluan .. di nama fail ditolak', pathSelamat(`${kelas}/x..pdf`, kelas) === false);

// Bukan PDF dan bukan rentetan.
check('laluan bukan .pdf ditolak', pathSelamat(`${kelas}/AB12CD34.txt`, kelas) === false);
check('laluan tanpa sambungan ditolak', pathSelamat(`${kelas}/AB12CD34`, kelas) === false);
check('null ditolak', pathSelamat(null, kelas) === false);
check('undefined ditolak', pathSelamat(undefined, kelas) === false);
check('nombor ditolak', pathSelamat(12345, kelas) === false);
check('rentetan kosong ditolak', pathSelamat('', kelas) === false);

check('MAKS_LAMPIRAN 5 MB', MAKS_LAMPIRAN === 5 * 1024 * 1024, MAKS_LAMPIRAN);
check('MAKS_SEKALI 20', MAKS_SEKALI === 20, MAKS_SEKALI);

async function utama(): Promise<void> {
/* ===== Bahagian 2: untukSetiap ===== */

// 2a: urutan hasil mengikut susunan input walaupun siap bertaburan.
{
  const hasil = await untukSetiap([40, 10, 30, 20], 3, async (n) => {
    // Item pertama paling lambat; hasil tetap mengikut susunan input.
    await new Promise((r) => setTimeout(r, n));
    return n * 2;
  });
  check('urutan hasil mengikut input',
    hasil.length === 4 && hasil.map((h) => (h.ok ? h.nilai : -1)).join(',') === '80,20,60,40',
    hasil);
}

// 2b: keserentakan tidak melebihi 3.
{
  let berjalan = 0;
  let puncak = 0;
  const hasil = await untukSetiap([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, async (n) => {
    berjalan += 1;
    if (berjalan > puncak) puncak = berjalan;
    await new Promise((r) => setTimeout(r, 5));
    berjalan -= 1;
    return n;
  });
  check('keserentakan tidak melebihi 3', puncak <= 3, puncak);
  check('semua item diproses', hasil.every((h) => h.ok), hasil);
  check('semua nilai betul', hasil.every((h, i) => h.ok && h.nilai === i + 1), hasil);
}

// 2c: ralat satu item tidak menghentikan yang lain.
{
  const hasil = await untukSetiap([1, 2, 3, 4, 5], 3, async (n) => {
    if (n === 2 || n === 4) throw new Error('gagal ' + n);
    return n * 10;
  });
  check('semua slot ada hasil', hasil.length === 5, hasil);
  check('item ralat ditandakan', !hasil[1].ok && !hasil[3].ok, hasil);
  check('item lain tetap berjaya',
    hasil[0].ok && hasil[0].nilai === 10 && hasil[2].ok && hasil[2].nilai === 30 && hasil[4].ok && hasil[4].nilai === 50,
    hasil);
  check('mesej ralat dikekal',
    !hasil[1].ok && hasil[1].ralat instanceof Error && (hasil[1].ralat as Error).message === 'gagal 2',
    hasil[1]);
}

// 2d: senarai kosong dan serentak lebih besar daripada senarai.
{
  const kosong = await untukSetiap([], 3, async (n) => n);
  check('senarai kosong: tiada hasil', kosong.length === 0, kosong);
  const kecil = await untukSetiap([1], 5, async (n) => n + 1);
  check('serentak > senarai: berjalan', kecil.length === 1 && kecil[0].ok && kecil[0].nilai === 2, kecil);
}

/* ===== Ringkasan ===== */
console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);
}

void utama();