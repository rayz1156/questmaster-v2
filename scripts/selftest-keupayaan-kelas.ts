/**
 * Ujian sendiri KZ-017 untuk logik keputusan keupayaan muat naik yang tidak
 * menyentuh pangkalan data: putuskanKeupayaan({ pemanggil, pemilik }).
 *
 * Jalankan:  npx tsx scripts/selftest-keupayaan-kelas.ts
 *
 * Kenapa fail ini wujud: npx tsc dan npm run build tidak menyemak logik.
 * Aturan pewarisan kebenaran pemilik kelas ialah tempat yang senyap salah,
 * dan kesilapan di sana sama ada mengunci pelajar yang patut boleh memuat
 * naik, atau membuka pintu kepada pelajar yang patut disekat.
 */
import { putuskanKeupayaan } from '../src/lib/capabilities';

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

const pelajar = { role: 'participant', can_upload_files: false, can_upload_videos: false };
const pelajarFiles = { role: 'participant', can_upload_files: true, can_upload_videos: false };
const pemilikFiles = { role: 'educator', can_upload_files: true, can_upload_videos: false };
const pemilikTanpa = { role: 'educator', can_upload_files: false, can_upload_videos: false };
const adminPemilik = { role: 'admin', can_upload_files: false, can_upload_videos: false };
const superadminPemilik = { role: 'superadmin', can_upload_files: false, can_upload_videos: false };

/* ===== 1. Pemanggil admin sentiasa lulus ===== */
check('pemanggil admin lulus walaupun bendera false',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: { role: 'admin', can_upload_files: false }, pemilik: pemilikTanpa }).ok === true);
check('pemanggil superadmin lulus',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: { role: 'superadmin', can_upload_files: false }, pemilik: null }).ok === true);
check('admin dikira isAdmin',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: { role: 'admin', can_upload_files: false }, pemilik: null }).isAdmin === true);

/* ===== 2. Bendera sendiri ===== */
check('bendera sendiri true lulus tanpa classId',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: pelajarFiles, pemilik: undefined }).ok === true);
check('bendera sendiri false tanpa classId gagal',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: pelajar, pemilik: undefined }).ok === false);
check('video tidak terjejas bendera fail',
  putuskanKeupayaan({ keupayaan: 'videos', pemanggil: pelajarFiles, pemilik: pemilikFiles }).ok === false);

/* ===== 3. Bendera pemilik ===== */
check('pemilik bendera true: pelajar lulus fail',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: pelajar, pemilik: pemilikFiles }).ok === true);
check('pemilik bendera true: pelajar tetap tidak isAdmin',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: pelajar, pemilik: pemilikFiles }).isAdmin === false);
check('pemilik bendera false: pelajar gagal',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: pelajar, pemilik: pemilikTanpa }).ok === false);

/* ===== 4. Pemilik admin ===== */
check('pemilik admin: pelajar lulus',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: pelajar, pemilik: adminPemilik }).ok === true);
check('pemilik superadmin: pelajar lulus',
  putuskanKeupayaan({ keupayaan: 'videos', pemanggil: pelajar, pemilik: superadminPemilik }).ok === true);
check('pemilik admin: pelajar tetap tidak isAdmin',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: pelajar, pemilik: adminPemilik }).isAdmin === false);

/* ===== 5. Profil pemilik tiada (fail closed) ===== */
check('pemilik null: gagal',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: pelajar, pemilik: null }).ok === false);
check('pemilik undefined: gagal',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: pelajar }).ok === false);
check('pemanggil null: gagal',
  putuskanKeupayaan({ keupayaan: 'files', pemanggil: null, pemilik: pemilikFiles }).ok === false);

console.log('');
console.log(`LULUS ${pass}, GAGAL ${fail}`);
if (fail > 0) process.exit(1);
