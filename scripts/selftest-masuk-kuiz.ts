/**
 * Ujian sendiri untuk logik masuk Kuiz Langsung yang tidak menyentuh
 * pangkalan data (V2-012):
 *
 *   1. keputusanMasuk: satu tempat yang memutuskan sama ada sesi kuiz
 *      terbuka kepada tetamu, perlukan log masuk, atau perlukan keahlian
 *      kelas. Laluan join dan skrin masuk mesti bersetuju dengannya.
 *   2. pautanDalamanSelamat: pengesah parameter `next` pada halaman log
 *      masuk, kini dikongsi antara halaman login dan /auth/callback.
 *
 * Jalankan:  npx tsx scripts/selftest-masuk-kuiz.ts
 *
 * Kenapa fail ini wujud: `npx tsc` dan `npm run build` tidak menyemak
 * logik. Sebelum keputusanMasuk wujud, laluan join dan halaman main
 * membawa keputusan sama secara berasingan dan boleh bercapah; ujian ini
 * mengunci takrifan supaya capahan kelihatan serta-merta.
 */
import { keputusanMasuk, type KeputusanMasuk } from '../src/lib/live-quiz';
import { pautanDalamanSelamat } from '../src/lib/pautan';

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

/* ===== Bahagian 1: keputusanMasuk ===== */

const m = (adaKelas: boolean, logMasuk: boolean, ahli: boolean): KeputusanMasuk =>
  keputusanMasuk({ adaKelas, logMasuk, ahli });

check('kuiz tanpa kelas: tetamu tanpa log masuk dibenarkan',
  m(false, false, false) === 'tetamu');
check('kuiz tanpa kelas: pengguna log masuk tetap tetamu',
  m(false, true, false) === 'tetamu');
check('kuiz tanpa kelas: ahli kelas lain tetap tetamu (kuiz ini bukan milik kelas)',
  m(false, true, true) === 'tetamu');
check('kuiz kelas: tanpa log masuk ditolak',
  m(true, false, false) === 'perlu_log_masuk');
check('kuiz kelas: log masuk tetapi bukan ahli ditolak',
  m(true, true, false) === 'bukan_ahli');
check('kuiz kelas: ahli diterima',
  m(true, true, true) === 'ahli');
check('kuiz kelas: pendidik/pemilik (ahli luas) diterima',
  m(true, true, true) === 'ahli');
check('tiada kelas diutamakan sebelum status log masuk',
  m(false, false, true) === 'tetamu');
check('perlu log masuk diutamakan sebelum keahlian (ahli tanpa log masuk mustahil tetapi dilindungi)',
  m(true, false, true) === 'perlu_log_masuk');
check('semua empat keputusan boleh berlaku (tiada cabang mati)',
  new Set<KeputusanMasuk>([
    m(false, false, false), m(true, false, false), m(true, true, false), m(true, true, true),
  ]).size === 4);

/* ===== Bahagian 2: pengesah pautan dalaman `next` ===== */

check('laluan live sah: /live/ABC123',
  pautanDalamanSelamat('/live/ABC123') === true);
check('laluan sertai kelas sah: /participant/join',
  pautanDalamanSelamat('/participant/join') === true);
check('laluan dengan pertanyaan sah: /admin/overview?x=1',
  pautanDalamanSelamat('/admin/overview?x=1') === true);
check('laluan root sah: /',
  pautanDalamanSelamat('/') === true);
check('pautan protocol-relative ditolak: //evil.com',
  pautanDalamanSelamat('//evil.com') === false);
check('skema penuh ditolak: https://x',
  pautanDalamanSelamat('https://x') === false);
check('pemisah Windows ditafsir pelayar ditolak: /\\evil.com',
  pautanDalamanSelamat('/\\evil.com') === false);
check('skema javascript ditolak: javascript:alert(1)',
  pautanDalamanSelamat('javascript:alert(1)') === false);
check('rentetan relatif tanpa awalan / ditolak: evil.com',
  pautanDalamanSelamat('evil.com') === false);
check('rentetan kosong ditolak',
  pautanDalamanSelamat('') === false);
check('null ditolak',
  pautanDalamanSelamat(null) === false);
check('undefined ditolak',
  pautanDalamanSelamat(undefined) === false);
check('// sahaja ditolak',
  pautanDalamanSelamat('//') === false);
check('/\\ sahaja ditolak',
  pautanDalamanSelamat('/\\') === false);
check('laluan panjang dengan pertanyaan tetap sah (nilai dalam ?next ialah parameter lain)',
  pautanDalamanSelamat('/live/ABC123?next=%2F%2Fevil.com') === true);

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
