/**
 * Ujian sendiri untuk pengesah senarai outcomeIds (KZ-037).
 *
 * Jalankan:  npx tsx scripts/selftest-kz037.ts
 *
 * Modul yang diuji ialah modul tulen src/lib/live-outcomes.ts; ia
 * sengaja tidak menarik import pelayan supaya skrip ini boleh
 * berjalan terus dengan tsx tanpa runtime Next.
 */
import { sahUuid, sahOutcomeIds, HAD_OUTCOME_KUIZ } from '../src/lib/live-outcomes';

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

const UUID_A = '00000000-0000-0000-0000-000000000001';
const UUID_B = '00000000-0000-0000-0000-000000000002';
const UUID_C = '00000000-0000-0000-0000-000000000003';

/* ===== sahUuid ===== */

check('sahUuid: menerima huruf kecil dan huruf besar',
  sahUuid(UUID_A) && sahUuid(UUID_A.toUpperCase()));
check('sahUuid: menolak bukan rentetan',
  !sahUuid(null) && !sahUuid(undefined) && !sahUuid(42) && !sahUuid({}));
check('sahUuid: menolak rentetan rosak',
  !sahUuid('') && !sahUuid('bukan-uuid')
    && !sahUuid('00000000-0000-0000-0000-00000000000g')
    && !sahUuid('00000000-0000-0000-00000000000000001'));

/* ===== sahOutcomeIds: bentuk asas ===== */

check('outcomeIds: null/undefined/bukan tatasusunan ditolak',
  sahOutcomeIds(null) === null && sahOutcomeIds(undefined) === null
    && sahOutcomeIds('abc') === null && sahOutcomeIds({}) === null
    && sahOutcomeIds(15) === null);
check('outcomeIds: tatasusunan kosong diterima (buang semua tag)',
  JSON.stringify(sahOutcomeIds([])) === '[]');
check('outcomeIds: satu UUID diterima',
  JSON.stringify(sahOutcomeIds([UUID_A])) === JSON.stringify([UUID_A]));

/* ===== had 15 ===== */

const senaraiPenuh = Array.from({ length: HAD_OUTCOME_KUIZ },
  (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
check(`outcomeIds: tepat ${HAD_OUTCOME_KUIZ} unsur diterima`,
  sahOutcomeIds(senaraiPenuh)!.length === HAD_OUTCOME_KUIZ);
check(`outcomeIds: ${HAD_OUTCOME_KUIZ + 1} unsur ditolak`,
  sahOutcomeIds([...senaraiPenuh, UUID_A]) === null);

/* ===== unsur tidak sah ===== */

check('outcomeIds: unsur bukan rentetan ditolak',
  sahOutcomeIds([UUID_A, 123]) === null && sahOutcomeIds([null]) === null);
check('outcomeIds: unsur bukan UUID ditolak',
  sahOutcomeIds([UUID_A, 'bukan-uuid']) === null);
check('outcomeIds: UUID berhuruf besar diterima',
  JSON.stringify(sahOutcomeIds([UUID_A.toUpperCase()])) === JSON.stringify([UUID_A.toUpperCase()]));

/* ===== pendua dibuang ===== */

const hasilPendua = sahOutcomeIds([UUID_A, UUID_B, UUID_A, UUID_C, UUID_B]);
check('outcomeIds: pendua dibuang, susunan pertama dikekalkan',
  hasilPendua !== null && hasilPendua.length === 3
    && hasilPendua[0] === UUID_A && hasilPendua[1] === UUID_B && hasilPendua[2] === UUID_C,
  hasilPendua);

/* ===== Ringkasan ===== */

console.log('');
console.log(`${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);