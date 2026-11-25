/**
 * Ujian sendiri KZ-UTT Fasa 1 (mod ujian Lumba Solo untuk T1, T2, T3).
 * Logik tulen sahaja: enjin klien dan pemarkahan pelayan.
 *
 * Jalankan:  npx tsx scripts/selftest-kz-utt.ts
 */
import {
  batalSoalan,
  bukaSoalan,
  ciptaKeadaanLumba,
  JAWAB_TETINGKAH_MS,
  kedudukanPemain,
  langkahLumba,
  masaPandu,
  perluSoalan,
  sambungUjian,
  SEPARUH_JALAN_M,
  tetingkahJawab,
  TREK_PANJANG_M,
  tutupSoalan,
  ujianSelesai,
  UJIAN_JAWAB_TETINGKAH_MS,
  UJIAN_LARIAN_KELUAR_MS,
  UJIAN_PEMANDUAN_MS,
  UJIAN_RUANG_PENAMAT_M,
  type InputPemandu,
} from '../src/components/solo/lumbaSoloEnjin';
import {
  kiraMata,
  sahkanTitikUkur,
  SOALAN_TETINGKAH_MS,
  tetingkahSoalan,
  UJIAN_SOALAN_TETINGKAH_MS,
} from '../src/lib/lumba-solo';

let pass = 0;
let fail = 0;
function check(nama: string, ok: boolean): void {
  if (ok) {
    pass++;
    console.log('  ok  ' + nama);
  } else {
    fail++;
    console.log('GAGAL ' + nama);
  }
}

const TIADA: InputPemandu = { kiri: false, kanan: false, pecut: false, brek: false };
const PECUT_KIRI: InputPemandu = { kiri: true, kanan: false, pecut: true, brek: false };

/** Jalankan enjin selama ms dengan langkah 16 ms. */
function jalan(k: ReturnType<typeof ciptaKeadaanLumba>, ms: number, input: InputPemandu = TIADA): void {
  for (let t = 0; t < ms; t += 16) langkahLumba(k, 16, input);
}

console.log('KZ-UTT: pemalar');
check('pemanduan 8 s', UJIAN_PEMANDUAN_MS === 8000);
check('tetingkap klien 45 s', UJIAN_JAWAB_TETINGKAH_MS === 45000);
check('tetingkap pelayan sama dengan klien', UJIAN_SOALAN_TETINGKAH_MS === UJIAN_JAWAB_TETINGKAH_MS);
check('tetingkahSoalan ujian 45 s, biasa 30 s', tetingkahSoalan(true) === 45000 && tetingkahSoalan(false) === SOALAN_TETINGKAH_MS);

console.log('KZ-UTT: jadual soalan');
{
  const k = ciptaKeadaanLumba(true);
  check('ujian: tetingkahJawab 45 s', tetingkahJawab(k) === 45000);
  check('biasa: tetingkahJawab 30 s', tetingkahJawab(ciptaKeadaanLumba()) === JAWAB_TETINGKAH_MS);
  jalan(k, 7900);
  check('tiada soalan sebelum 8 s', !perluSoalan(k));
  jalan(k, 200);
  check('soalan pertama selepas 8 s', perluSoalan(k));
  bukaSoalan(k);
  jalan(k, 20000);
  tutupSoalan(k);
  jalan(k, 7900);
  check('tiada soalan sebelum 8 s selepas jawapan', !perluSoalan(k));
  jalan(k, 200);
  check('soalan kedua 8 s selepas jawapan', perluSoalan(k));
}

console.log('KZ-UTT: kereta berhenti semasa soalan');
{
  const k = ciptaKeadaanLumba(true);
  jalan(k, 8100, { ...TIADA, pecut: true });
  const lajuSebelum = k.kelajuan;
  bukaSoalan(k);
  const offsetSebelum = k.offsetM;
  jalan(k, 3000, PECUT_KIRI);
  check('kereta bergerak sebelum soalan', lajuSebelum > 30);
  check('kelajuan 0 semasa soalan', k.kelajuan === 0);
  check('stereng tiada kesan semasa soalan', k.offsetM === offsetSebelum);
  const jarak = k.jarakM;
  const offset = k.offsetM;
  jalan(k, 30000, PECUT_KIRI);
  check('tiada pergerakan selepas berhenti (jarak)', k.jarakM === jarak);
  check('tiada hanyutan semasa soalan (offset)', k.offsetM === offset);
  check('tidak terbabas semasa soalan', Math.abs(k.offsetM) <= SEPARUH_JALAN_M || k.diLuarJalan === false || Math.abs(offsetSebelum) > SEPARUH_JALAN_M);
  check('masa soalan direkod sebagai jeda', k.jedaMs >= 33000 && masaPandu(k) < k.masaMs);
}

console.log('KZ-UTT: kereta lawan tidak bergerak semasa soalan');
{
  const k = ciptaKeadaanLumba(true);
  jalan(k, 8100, { ...TIADA, pecut: true });
  bukaSoalan(k);
  const pandu = masaPandu(k);
  jalan(k, 40000);
  check('masaPandu kekal semasa soalan', Math.abs(masaPandu(k) - pandu) < 1e-6);
  check('kedudukan dikira (1 hingga 3)', [1, 2, 3].includes(kedudukanPemain(k)));
}

console.log('KZ-UTT: larian tamat ikut soalan, bukan jarak');
{
  const k = ciptaKeadaanLumba(true);
  jalan(k, 600000, { ...TIADA, pecut: true });
  check('ujian: tidak selesai di garisan penamat', !k.selesai);
  check('ujian: kereta menunggu sebelum penamat', k.jarakM <= TREK_PANJANG_M - UJIAN_RUANG_PENAMAT_M + 1e-9);
  const b = ciptaKeadaanLumba();
  jalan(b, 600000, { ...TIADA, pecut: true });
  check('biasa: masih selesai di garisan penamat', b.selesai);
}
{
  const k = ciptaKeadaanLumba(true);
  const total = 2;
  for (let i = 0; i < total; i++) {
    jalan(k, UJIAN_PEMANDUAN_MS + 100);
    check(`soalan ${i + 1} dibuka`, perluSoalan(k));
    bukaSoalan(k);
    jalan(k, 1000);
    tutupSoalan(k);
  }
  check('belum selesai sejurus soalan terakhir', !ujianSelesai(k, total));
  jalan(k, UJIAN_LARIAN_KELUAR_MS + 50);
  check('selesai selepas larian keluar 3 s', ujianSelesai(k, total));
  check('larian biasa tidak pernah ujianSelesai', !ujianSelesai(ciptaKeadaanLumba(), 0));
}

console.log('KZ-UTT: sambung dan batal');
{
  const k = ciptaKeadaanLumba(true);
  sambungUjian(k, 4);
  check('sambung: soalanKe dan soalanDijawab = 4', k.soalanKe === 4 && k.soalanDijawab === 4);
  jalan(k, UJIAN_PEMANDUAN_MS + 50);
  bukaSoalan(k);
  batalSoalan(k);
  check('batal: soalan ditutup tanpa dikira', k.soalanDibukaMs === null && k.soalanKe === 4 && k.soalanDijawab === 4);
  check('batal: menunggu 8 s sebelum cuba semula', !perluSoalan(k));
  jalan(k, UJIAN_PEMANDUAN_MS + 50);
  check('batal: dibuka semula selepas 8 s', perluSoalan(k));
}
{
  const k = ciptaKeadaanLumba(true);
  sambungUjian(k, 3);
  jalan(k, UJIAN_LARIAN_KELUAR_MS + 50);
  check('sambung dengan semua dijawab: terus selesai', ujianSelesai(k, 3));
}

console.log('KZ-UTT: pemarkahan pelayan');
check('biasa: tidak berubah (betul serta-merta 1.5x)', kiraMata(1000, 0, true) === 1500);
check('biasa: lewat 30 s = 0', kiraMata(1000, 30001, true) === 0);
check('ujian: betul pada 30 s masih dapat bonus', kiraMata(1000, 30000, true, 45000) === Math.round(1000 * (1 + 0.5 * (1 - 30000 / 45000))));
check('ujian: betul pada 45 s = 1.0x', kiraMata(1000, 45000, true, 45000) === 1000);
check('ujian: salah = 0', kiraMata(1000, 1000, false, 45000) === 0);

console.log('KZ-UTT: titik pengukuran');
check('T1, T2, T3 sah', sahkanTitikUkur('T1') === 'T1' && sahkanTitikUkur('T2') === 'T2' && sahkanTitikUkur('T3') === 'T3');
check('lain ditolak', sahkanTitikUkur('T4') === null && sahkanTitikUkur('t1') === null && sahkanTitikUkur(null) === null);

console.log('');
console.log('LULUS: ' + pass + '  GAGAL: ' + fail);
if (fail > 0) process.exitCode = 1;
