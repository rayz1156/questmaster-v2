/**
 * Ujian sendiri KZ-007, tanpa pangkalan data: fungsi tulen yang baru.
 *
 *   1. normaliseHasilKeluaran: PostgREST memulangkan tatasusunan
 *      [{issued_count, issued_ids}] untuk fungsi RETURNS TABLE, tetapi objek
 *      tunggal boleh datang daripada pemanggil lain. Ini pepijat yang membuat
 *      ids sentiasa [] dan pdf_path kekal NULL.
 *   2. tapiskanIdSijil: penapis UUID dan had 200 untuk badan permintaan emel.
 *
 * Jalankan:  npx tsx scripts/selftest-kz007.ts
 */
import { normaliseHasilKeluaran, tapiskanIdSijil, MAX_ID_EMEL } from '../src/lib/sijil/keluarkan';

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

const U1 = '11111111-2222-3333-4444-555555555555';
const U2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000';
const U3 = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEFFFF0000';

/* ===== Bahagian 1: normalisasi hasil RPC ===== */

// Bentuk sebenar PostgREST untuk RETURNS TABLE: tatasusunan satu objek.
const tatasusunan = normaliseHasilKeluaran([{ issued_count: 3, issued_ids: [U1, U2] }]);
check('tatasusunan: issued_count', tatasusunan?.issued_count === 3, tatasusunan);
check('tatasusunan: issued_ids', tatasusunan?.issued_ids?.length === 2 && tatasusunan.issued_ids[0] === U1, tatasusunan);

// Bentuk objek tunggal (pemanggil lain / khayalan lama).
const objek = normaliseHasilKeluaran({ issued_count: 1, issued_ids: [U1] });
check('objek: issued_count', objek?.issued_count === 1, objek);
check('objek: issued_ids', objek?.issued_ids?.length === 1, objek);

// Nilai kosong dan tidak masuk akal.
check('null: pulang null', normaliseHasilKeluaran(null) === null, normaliseHasilKeluaran(null));
check('undefined: pulang null', normaliseHasilKeluaran(undefined) === null, normaliseHasilKeluaran(undefined));
check('tatasusunan kosong: pulang null', normaliseHasilKeluaran([]) === null, normaliseHasilKeluaran([]));
check('rentetan: pulang null', normaliseHasilKeluaran('x') === null, normaliseHasilKeluaran('x'));
const rosak = normaliseHasilKeluaran([{ issued_count: 'tiga', issued_ids: 'bukan' }]);
check('rosak: issued_count 0', rosak?.issued_count === 0, rosak);
check('rosak: issued_ids []', Array.isArray(rosak?.issued_ids) && rosak.issued_ids.length === 0, rosak);

/* ===== Bahagian 2: penapis id sijil ===== */

check('dua UUID sah diterima', JSON.stringify(tapiskanIdSijil([U1, U2])) === JSON.stringify([U1, U2]), tapiskanIdSijil([U1, U2]));
check('huruf besar diterima', JSON.stringify(tapiskanIdSijil([U3])) === JSON.stringify([U3]), tapiskanIdSijil([U3]));
check('bukan array: kosong', tapiskanIdSijil('hacking' as unknown) !== undefined && tapiskanIdSijil(null).length === 0, tapiskanIdSijil(null));
check('null dibuang', tapiskanIdSijil([null, U1]).length === 1, tapiskanIdSijil([null, U1]));
check('bukan rentetan dibuang', tapiskanIdSijil([42, U1, {}]).length === 1, tapiskanIdSijil([42, U1, {}]));
check('rentetan bukan UUID dibuang', tapiskanIdSijil(['abc', U1, U1.slice(0, 35)]).length === 1, tapiskanIdSijil(['abc', U1, U1.slice(0, 35)]));
check('pendua dihapus', JSON.stringify(tapiskanIdSijil([U1, U1, U2])) === JSON.stringify([U1, U2]), tapiskanIdSijil([U1, U1, U2]));

// Had 200: bina 250 UUID sah dan pastikan hanya 200 pertama masuk.
const banyak: string[] = [];
for (let i = 0; i < 250; i++) {
  const n = i.toString(16).padStart(12, '0');
  banyak.push('00000000-0000-4000-8000-' + n);
}
const ditapis = tapiskanIdSijil(banyak);
check('had 200', ditapis.length === MAX_ID_EMEL && ditapis.length === 200, ditapis.length);
check('had 200: 200 pertama sahaja', ditapis[199] === banyak[199] && ditapis.length === banyak.slice(0, 200).length, ditapis.length);

console.log('');
console.log(`Selesai: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);