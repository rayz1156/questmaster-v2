/**
 * Ujian sendiri untuk namaAhli() (src/lib/namaAhli.ts), tiket V2-007.
 *
 * Jalankan:
 *   npx tsx scripts/selftest-nama-ahli.ts
 *
 * Kenapa fail ini wujud: `npx tsc` dan `npm run build` tidak menyemak logik
 * fungsi tulen. Pepijat asal (UUID dipaparkan sebagai nama di halaman People)
 * lulus kedua-dua semakan itu.
 */
import { namaAhli } from '../src/lib/namaAhli';

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

const uuid = '8da286b7-1234-5678-9abc-def012345678';

/* ===== Kes daripada tiket V2-007 ===== */

// Nama sebenar dalam qm_profiles.
check('nama daripada qm_profiles.display_name',
  namaAhli({ user_id: uuid, qm_profiles: { display_name: 'Ali bin Abu', email: 'ali@x.com' } }) === 'Ali bin Abu',
  namaAhli({ qm_profiles: { display_name: 'Ali bin Abu', email: 'ali@x.com' } }));

// display_name kosong: guna bahagian emel sebelum @.
check('display_name kosong, guna emel sebelum @',
  namaAhli({ qm_profiles: { display_name: '', email: 'cikgu.amin@sekolah.edu.my' } }) === 'cikgu.amin',
  namaAhli({ qm_profiles: { display_name: '', email: 'cikgu.amin@sekolah.edu.my' } }));

// Tiada display_name langsung.
check('tiada display_name, guna emel sebelum @',
  namaAhli({ qm_profiles: { email: 'cikgu@x.com' } }) === 'cikgu',
  namaAhli({ qm_profiles: { email: 'cikgu@x.com' } }));

// Profil tiada dan user_id ada: UUID TIDAK boleh dipaparkan.
check('profil tiada, pulangkan Student bukan UUID',
  namaAhli({ user_id: uuid, qm_profiles: null }) === 'Student',
  namaAhli({ user_id: uuid, qm_profiles: null }));

// Baris tanpa kunci qm_profiles langsung.
check('tiada kunci qm_profiles, pulangkan Student',
  namaAhli({ user_id: uuid }) === 'Student',
  namaAhli({ user_id: uuid }));

/* ===== Kes pertahanan ===== */

// display_name sendiri ialah UUID (data rosak): jangan paparkan UUID.
check('display_name berbentuk UUID dibuang',
  namaAhli({ qm_profiles: { display_name: uuid, email: 'b@x.com' } }) === 'b',
  namaAhli({ qm_profiles: { display_name: uuid, email: 'b@x.com' } }));

// display_name jarak putih sahaja.
check('display_name jarak putih sahaja dibuang',
  namaAhli({ qm_profiles: { display_name: '   ', email: 'c@x.com' } }) === 'c',
  namaAhli({ qm_profiles: { display_name: '   ', email: 'c@x.com' } }));

// Emel jarak putih sahaja dan nama kosong: Student.
check('semua kosong, pulangkan Student',
  namaAhli({ qm_profiles: { display_name: '', email: '  ' } }) === 'Student',
  namaAhli({ qm_profiles: { display_name: '', email: '  ' } }));

// Nilai bukan rentetan.
check('nilai bukan rentetan dibuang',
  namaAhli({ qm_profiles: { display_name: 42 as unknown, email: 'd@x.com' } }) === 'd',
  namaAhli({ qm_profiles: { display_name: 42 as unknown, email: 'd@x.com' } }));

// m ialah null / bukan objek.
check('m null, pulangkan Student', namaAhli(null) === 'Student', namaAhli(null));
check('m tidak ditakrif, pulangkan Student', namaAhli(undefined) === 'Student', namaAhli(undefined));

// Rentetan kosong pada emel sebelum @ tidak sah (e.g. '@x.com').
check('emel tanpa bahagian tempatan dibuang',
  namaAhli({ qm_profiles: { email: '@x.com' } }) === 'Student',
  namaAhli({ qm_profiles: { email: '@x.com' } }));

console.log('');
console.log(pass + ' lulus, ' + fail + ' gagal');
if (fail > 0) process.exit(1);
