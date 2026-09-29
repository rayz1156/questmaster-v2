/**
 * Ujian logik V2-003b: fungsi tulen UI sijil (pemformatan status,
 * penapis kelayakan dan label nama sijil).
 *
 * Jalankan: npx tsx scripts/selftest-sijil-ui.ts
 */
import { statusSijil, tickLayak, labelNamaSijil, type BarisKelayakan } from '../src/lib/sijil/ui';

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
// statusSijil
// ---------------------------------------------------------------------
const aktif = statusSijil(null);
semak('status-aktif', aktif.label === 'Active' && aktif.kelas === 'text-emerald-600',
  `null -> ${aktif.label} / ${aktif.kelas}`);

const batal = statusSijil('2026-09-29T00:00:00Z');
semak('status-batal', batal.label === 'Revoked' && batal.kelas === 'text-red-600',
  `tarikh -> ${batal.label} / ${batal.kelas}`);

// Rentetan kosong bukan null: dianggap belum dibatalkan.
const kosong = statusSijil('');
semak('status-kosong', kosong.label === 'Active',
  `'' -> ${kosong.label}`);

// ---------------------------------------------------------------------
// tickLayak: hanya layak, belum dikeluarkan dan ditandakan
// ---------------------------------------------------------------------
const baris: BarisKelayakan[] = [
  { participant_id: 'p1', display_name: 'A', certificate_name: 'Alpha', name_confirmed: true, eligible: true, reason: 'ok', already_issued: false },
  { participant_id: 'p2', display_name: 'B', certificate_name: null, name_confirmed: false, eligible: true, reason: 'ok', already_issued: false },
  { participant_id: 'p3', display_name: 'C', certificate_name: 'Gamma', name_confirmed: true, eligible: false, reason: 'Score below the minimum required.', already_issued: false },
  { participant_id: 'p4', display_name: 'D', certificate_name: 'Delta', name_confirmed: true, eligible: true, reason: 'ok', already_issued: true },
  { participant_id: 'p5', display_name: 'E', certificate_name: 'Epsilon', name_confirmed: true, eligible: true, reason: 'ok', already_issued: false },
];

const tick: Record<string, boolean> = { p1: true, p2: true, p3: true, p4: true, p5: false };

const ids = tickLayak(baris, tick);
semak('tick-hanya-layak', JSON.stringify(ids) === JSON.stringify(['p1', 'p2']),
  `dipilih: [${ids.join(', ')}] (p3 tidak layak, p4 sudah dikeluarkan, p5 tidak ditanda)`);

semak('tick-kosong', tickLayak([], tick).length === 0, 'senarai kosong -> tiada ids');
semak('tick-semua-false', tickLayak(baris, {}).length === 0, 'tiada tandaan -> tiada ids');

// ---------------------------------------------------------------------
// labelNamaSijil: peserta belum sahkan nama
// ---------------------------------------------------------------------
semak('nama-belum-sahkan', labelNamaSijil(baris[1]) === 'Waiting for name confirmation',
  `p2 -> ${labelNamaSijil(baris[1])}`);
semak('nama-disahkan', labelNamaSijil(baris[0]) === 'Alpha', `p1 -> ${labelNamaSijil(baris[0])}`);

// Nama sijil NULL tetapi disahkan: jatuh ke nama paparan.
const namaNull: BarisKelayakan = { ...baris[0], certificate_name: null };
semak('nama-null', labelNamaSijil(namaNull) === 'A', `certificate_name NULL -> ${labelNamaSijil(namaNull)}`);

if (gagal > 0) {
  console.log(`\n${gagal} ujian gagal`);
  process.exit(1);
}
console.log('\nSemua ujian lulus');