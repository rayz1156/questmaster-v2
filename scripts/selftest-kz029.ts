/**
 * Ujian logik KZ-029: pemilihan sijil untuk kemas kini reka bentuk.
 * Menguji fungsi tulen di src/lib/sijil/ui.ts:
 *   - idRekaBentukLama: sijil "Old design" (bukan templat aktif, tidak dibatalkan)
 *   - idTerpilihKemasKini: pilihan kotak semak sedia ada, tidak dibatalkan sahaja
 *   - pecahKelompok: pecahan kelompok 10 untuk jana semula berurutan
 *
 * Jalankan: npx tsx scripts/selftest-kz029.ts
 */
import {
  idRekaBentukLama,
  idTerpilihKemasKini,
  pecahKelompok,
  type BarisSijilJadual,
} from '../src/lib/sijil/ui';

let gagal = 0;

function semak(k: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`LULUS ${k}: ${detail}`);
  } else {
    gagal += 1;
    console.log(`GAGAL ${k}: ${detail}`);
  }
}

// Situasi jadual "Issued certificates" (KZ-029):
//   aktif  = templat aktif kelas "Kuizen Ungu Moden"
//   lama   = templat lama "Islamik Geometri"
const AKTIF = 't-aktif';
const LAMA = 't-lama';
const baris: BarisSijilJadual[] = [
  // p1: sijil reka bentuk lama, aktif -> patut dipilih.
  { id: 'c1', revoked_at: null, template_id: LAMA },
  // p2: sijil dibatalkan -> tidak pernah dipilih.
  { id: 'c2', revoked_at: '2026-10-01T00:00:00Z', template_id: LAMA },
  // p3: sudah templat aktif -> bukan Old design.
  { id: 'c3', revoked_at: null, template_id: AKTIF },
  // p4: reka bentuk lama tetapi dibatalkan -> ditapis keluar.
  { id: 'c4', revoked_at: '2026-10-02T00:00:00Z', template_id: LAMA },
];

// ---------------------------------------------------------------------
// idRekaBentukLama: bukan aktif DAN tidak dibatalkan sahaja
// ---------------------------------------------------------------------
const lama = idRekaBentukLama(baris, AKTIF);
semak('reka-lama-asas',
  JSON.stringify(lama) === JSON.stringify(['c1']),
  `c2 dibatalkan, c3 templat aktif, c4 dibatalkan -> [${lama.join(', ')}]`);

// Tiada templat aktif: tiada yang boleh dikemas (butang dilumpuhkan).
semak('reka-lama-tiada-aktif',
  JSON.stringify(idRekaBentukLama(baris, null)) === '[]',
  'aktifId null -> []');

// Semua sijil sudah templat aktif -> kosong.
semak('reka-lama-semua-aktif',
  JSON.stringify(idRekaBentukLama([baris[2]], AKTIF)) === '[]',
  'satu baris templat aktif -> []');

// ---------------------------------------------------------------------
// idTerpilihKemasKini: pilihan kotak semak, tidak dibatalkan sahaja
// ---------------------------------------------------------------------
// Pilihan lama mungkin masih menandakan baris yang sudah dibatalkan.
const pilihan: Record<string, boolean> = { c1: true, c2: true, c3: true, c4: true };
const terpilih = idTerpilihKemasKini(baris, pilihan);
semak('kemas-kini-terpilih',
  JSON.stringify(terpilih) === JSON.stringify(['c1', 'c3']),
  `c2/c4 dibatalkan diabaikan walaupun ditanda -> [${terpilih.join(', ')}]`);

// Pilihan kosong -> kosong.
semak('kemas-kini-terpilih-kosong',
  JSON.stringify(idTerpilihKemasKini(baris, {})) === '[]',
  'tiada pilihan -> []');

// ---------------------------------------------------------------------
// pecahKelompok: pengeluaran berkelompok 10 berurutan (KZ-011, dipakai semula)
// ---------------------------------------------------------------------
const limaPuluh = idRekaBentukLama(
  Array.from({ length: 54 }, (_, i) => ({ id: `x${i}`, revoked_at: null, template_id: LAMA })),
  AKTIF,
);
const kelompok = pecahKelompok(limaPuluh, 10);
semak('kelompok-54',
  JSON.stringify(kelompok.map((g) => g.length)) === JSON.stringify([10, 10, 10, 10, 10, 4]),
  `54 sijil lama -> ${kelompok.map((g) => g.length).join(', ')}`);
semak('kelompok-54-jumlah',
  kelompok.flat().length === 54,
  `jumlah flat = ${kelompok.flat().length}`);

// Kelompok <= 10 -> satu kelompok sahaja.
const satu = pecahKelompok(['a', 'b', 'c'], 10);
semak('kelompok-3',
  satu.length === 1 && satu[0].length === 3,
  `3 -> ${satu.map((g) => g.length).join(', ')}`);

// Aliran penuh "Update all to active design": pilih kemudian pecah.
semak('aliran-penuh',
  pecahKelompok(lama, 10).length === 1,
  `1 sijil lama -> 1 kelompok`);

if (gagal > 0) {
  console.log(`\n${gagal} SEMAKAN GAGAL`);
  process.exit(1);
}
console.log('\nSemua semakan KZ-029 lulus.');
