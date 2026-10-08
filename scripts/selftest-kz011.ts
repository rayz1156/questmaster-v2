/**
 * Ujian logik KZ-011: pemilihan ramai peserta untuk issue sijil.
 * Menguji fungsi tulen di src/lib/sijil/ui.ts:
 *   - pecahKelompok: pembahagian kelompok 10 untuk pengeluaran berkelompok
 *   - idBolehPilih: hanya baris layak dan belum dikeluarkan
 *   - tickLayak: semua yang boleh dipilih apabila semua ditandakan
 *
 * Jalankan: npx tsx scripts/selftest-kz011.ts
 */
import {
  pecahKelompok,
  idBolehPilih,
  tickLayak,
  type BarisKelayakan,
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

// ---------------------------------------------------------------------
// pecahKelompok
// ---------------------------------------------------------------------
const lima4 = pecahKelompok(Array.from({ length: 54 }, (_, i) => i), 10);
semak('pecah-54',
  JSON.stringify(lima4.map((g) => g.length)) === JSON.stringify([10, 10, 10, 10, 10, 4]),
  `54 -> ${lima4.map((g) => g.length).join(', ')}`);
semak('pecah-54-jumlah',
  lima4.flat().length === 54 && lima4.every((g) => g.length === 10 ? true : g.length === 4),
  `jumlah flat = ${lima4.flat().length}, kelompok terakhir = ${lima4[lima4.length - 1].length}`);

semak('pecah-0', JSON.stringify(pecahKelompok([], 10)) === '[]',
  `0 -> ${JSON.stringify(pecahKelompok([], 10))}`);

const sepuluh = pecahKelompok([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10);
semak('pecah-10',
  sepuluh.length === 1 && sepuluh[0].length === 10,
  `10 -> ${sepuluh.map((g) => g.length).join(', ')}`);

// Susunan kekal dalam setiap kelompok.
const susunan = pecahKelompok(['a', 'b', 'c'], 2);
semak('pecah-susunan',
  JSON.stringify(susunan) === JSON.stringify([['a', 'b'], ['c']]),
  `${JSON.stringify(susunan)}`);

// ---------------------------------------------------------------------
// idBolehPilih: layak DAN belum dikeluarkan sahaja
// ---------------------------------------------------------------------
const baris: BarisKelayakan[] = [
  { participant_id: 'p1', display_name: 'A', certificate_name: 'Alpha', name_confirmed: true, eligible: true, reason: 'ok', already_issued: false },
  { participant_id: 'p2', display_name: 'B', certificate_name: null, name_confirmed: false, eligible: true, reason: 'ok', already_issued: false },
  { participant_id: 'p3', display_name: 'C', certificate_name: 'Gamma', name_confirmed: true, eligible: false, reason: 'Score below the minimum required.', already_issued: false },
  { participant_id: 'p4', display_name: 'D', certificate_name: 'Delta', name_confirmed: true, eligible: true, reason: 'ok', already_issued: true },
  { participant_id: 'p5', display_name: 'E', certificate_name: 'Epsilon', name_confirmed: true, eligible: false, reason: 'No name confirmed.', already_issued: true },
];

const bolehPilih = baris.filter(idBolehPilih).map((r) => r.participant_id);
semak('id-boleh-pilih',
  JSON.stringify(bolehPilih) === JSON.stringify(['p1', 'p2']),
  `p3 tidak layak, p4 sudah dikeluarkan, p5 kedua-duanya -> [${bolehPilih.join(', ')}]`);

// ---------------------------------------------------------------------
// tickLayak: semua ditanda -> semua yang boleh dipilih
// ---------------------------------------------------------------------
const tickSemua: Record<string, boolean> = { p1: true, p2: true, p3: true, p4: true, p5: true };
const semua = tickLayak(baris, tickSemua);
semak('tick-semua-ditanda',
  JSON.stringify(semua) === JSON.stringify(['p1', 'p2']),
  `semua ditanda -> [${semua.join(', ')}] (p3/p4/p5 ditapis)`);

// idBolehPilih dan tickLayak bersetuju apabila semua ditandakan.
semak('tick-selaras-boleh-pilih',
  JSON.stringify(semua) === JSON.stringify(baris.filter(idBolehPilih).map((r) => r.participant_id)),
  'tickLayak(tick semua true) == baris.filter(idBolehPilih)');

// ---------------------------------------------------------------------
// Hasil akhir
// ---------------------------------------------------------------------
if (gagal > 0) {
  console.log(`\n${gagal} semakan gagal.`);
  process.exit(1);
}
console.log('\nSemua semakan lulus.');
