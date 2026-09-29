/**
 * Ujian sendiri untuk pelanBerbayar (tiket V2-008).
 *
 * Tiket: akaun institution dan unlimited mesti dianggap pelan berbayar di
 * SEMUA semakan, tetapi free dan nilai tidak dikenali mesti tidak. Logik
 * kuatkuasa sebenar berada di pangkalan data (qm_effective_plan, 0040);
 * skrip ini menguji pembantu TypeScript yang dikongsi klien dan pelayan.
 *
 * Jalankan:  npx tsx scripts/selftest-pelan-berbayar.ts
 *
 * Kenapa fail ini wujud: npx tsc tidak menangkap kesilapan senarai pelan
 * (contohnya institution tertinggal daripada senarai); tiada ralat binaan,
 * hanya ciri terkunci yang salah.
 */
import { pelanBerbayar, HAD_PELAN, HARGA_PELAN, mesejHad, kodHad, tanpaHad, type Pelan } from '../src/lib/pelan';

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

/* ===== Bahagian 1: pelanBerbayar, tiga nilai benar ===== */
check('pro adalah berbayar', pelanBerbayar('pro') === true, pelanBerbayar('pro'));
check('institution adalah berbayar', pelanBerbayar('institution') === true, pelanBerbayar('institution'));
check('unlimited adalah berbayar', pelanBerbayar('unlimited') === true, pelanBerbayar('unlimited'));

/* ===== Bahagian 2: nilai palsu ===== */
check('free bukan berbayar', pelanBerbayar('free') === false, pelanBerbayar('free'));
check('null bukan berbayar', pelanBerbayar(null) === false);
check('undefined bukan berbayar', pelanBerbayar(undefined) === false);
check('rentetan kosong bukan berbayar', pelanBerbayar('') === false);
check('rentetan asing bukan berbayar', pelanBerbayar('enterprise') === false);
// Kes huruf mesti tepat: nilai dari pangkalan data sentiasa huruf kecil.
check('PRO huruf besar bukan berbayar', pelanBerbayar('PRO') === false);
check(' Unlimited berjarak bukan berbayar', pelanBerbayar(' unlimited') === false);

/* ===== Bahagian 3: kesan sampingan pada pelanSaya tetap selamat ===== */
// Logik lama di src/lib/pelan.ts (baris 170 dahulu) mesti kekal sama:
// hanya tiga pelan itu sah, yang lain jatuh ke free. Ini diuji secara tidak
// langsung melalui HAD_PELAN: pelan yang sah mesti ada hadnya.
for (const p of ['free', 'pro', 'institution', 'unlimited'] as Pelan[]) {
  check(`${p}: HAD_PELAN wujud`, HAD_PELAN[p] !== undefined);
}
check('unlimited: kelas tanpa had', HAD_PELAN.unlimited.kelas === null);
check('institution: penilaian rakan benar', HAD_PELAN.institution.penilaianRakan === true);

/* ===== Bahagian 4: harga dan mesej tidak berubah (regresi) ===== */
check('HARGA_PELAN tiada unlimited', !('unlimited' in HARGA_PELAN), Object.keys(HARGA_PELAN));
check('harga pro bulanan 29', HARGA_PELAN.pro.bulanan === 29, HARGA_PELAN.pro);
check('harga institution tahunan 1500', HARGA_PELAN.institution.tahunan === 1500);
check('mesej QM_PLAN_PRO wujud', mesejHad(new Error('QM_PLAN_PRO: x')).includes('Pro plan'));
check('kod dikenali', kodHad(new Error('QM_PLAN_PRO: x')) === 'QM_PLAN_PRO');

/* ===== Bahagian 5: tanpaHad (regresi) ===== */
check('tanpaHad(null) benar', tanpaHad(null) === true);
check('tanpaHad(30) salah', tanpaHad(30) === false);

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
