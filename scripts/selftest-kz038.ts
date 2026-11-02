/**
 * Ujian sendiri KZ-038: item LNA bebas (tidak terikat kepada Outcome).
 *
 * Jalankan:  npx tsx scripts/selftest-kz038.ts
 *
 * Laporan campuran 3 item Outcome + 2 item bebas. Keputusan Boss:
 * item bebas DIKIRA untuk Borich MWDS, RDM RDS, kuadran IPA dan delta
 * keyakinan pra/pasca, tetapi TIDAK untuk penguasaan (avgMasteryPct
 * null), bendera keyakinan dan delta penguasaan (null).
 *
 * Data contoh lampiran KZ-35 dipakai semula bagi item Outcome supaya
 * nilai penanda aras MWDS/RDS kekal boleh disemak.
 */
import {
  binaLaporanLna,
  binaPerbandinganLna,
  type ItemLna,
  type JawapanLna,
  type MasteryLna,
} from '../src/lib/lna';

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

/* ===== Persediaan: 3 item Outcome + 2 item bebas ===== */

const ITEM_CAMPURAN: ItemLna[] = [
  { itemId: 'I1', outcomeId: 'K1', label: 'Kemahiran 1' },
  { itemId: 'I2', outcomeId: 'K2', label: 'Kemahiran 2' },
  { itemId: 'I3', outcomeId: 'K3', label: 'Kemahiran 3' },
  { itemId: 'I4', outcomeId: null, label: 'Kemahiran insaniah' },
  { itemId: 'I5', outcomeId: null, label: 'Guna alat makmal' },
];

// Item Outcome menyalin data lampiran K1 hingga K3; item bebas menyalin
// corak K1 dan K2 supaya MWDS/RDS dijangka sama.
const JAWAPAN_CAMPURAN: JawapanLna[] = [
  { userId: 'R1', itemId: 'I1', importance: 5, currentLevel: 3 },
  { userId: 'R2', itemId: 'I1', importance: 4, currentLevel: 2 },
  { userId: 'R3', itemId: 'I1', importance: 5, currentLevel: 4 },
  { userId: 'R4', itemId: 'I1', importance: 4, currentLevel: 3 },
  { userId: 'R1', itemId: 'I2', importance: 4, currentLevel: 2 },
  { userId: 'R2', itemId: 'I2', importance: 5, currentLevel: 3 },
  { userId: 'R3', itemId: 'I2', importance: 4, currentLevel: 2 },
  { userId: 'R4', itemId: 'I2', importance: 5, currentLevel: 2 },
  { userId: 'R1', itemId: 'I3', importance: 5, currentLevel: 4 },
  { userId: 'R2', itemId: 'I3', importance: 4, currentLevel: 4 },
  { userId: 'R3', itemId: 'I3', importance: 5, currentLevel: 3 },
  { userId: 'R4', itemId: 'I3', importance: 4, currentLevel: 3 },
  // Item bebas: corak sama seperti K1.
  { userId: 'R1', itemId: 'I4', importance: 5, currentLevel: 3 },
  { userId: 'R2', itemId: 'I4', importance: 4, currentLevel: 2 },
  { userId: 'R3', itemId: 'I4', importance: 5, currentLevel: 4 },
  { userId: 'R4', itemId: 'I4', importance: 4, currentLevel: 3 },
  // Item bebas: corak sama seperti K2.
  { userId: 'R1', itemId: 'I5', importance: 4, currentLevel: 2 },
  { userId: 'R2', itemId: 'I5', importance: 5, currentLevel: 3 },
  { userId: 'R3', itemId: 'I5', importance: 4, currentLevel: 2 },
  { userId: 'R4', itemId: 'I5', importance: 5, currentLevel: 2 },
];

// Mastery hanya wujud bagi Outcome (bentuk qm_mastery_summary).
const MASTERY_CAMPURAN: MasteryLna[] = [
  { userId: 'R1', outcomeId: 'K1', masteryPct: 80, scored: 3 },
  { userId: 'R3', outcomeId: 'K1', masteryPct: 25, scored: 4 },
  { userId: 'R4', outcomeId: 'K1', masteryPct: 60, scored: 2 },
  { userId: 'R1', outcomeId: 'K2', masteryPct: 90, scored: 3 },
];

const laporan = binaLaporanLna({
  items: ITEM_CAMPURAN,
  jawapan: JAWAPAN_CAMPURAN,
  mastery: MASTERY_CAMPURAN,
});

const cari = (itemId: string) =>
  laporan.outcomes.find((o) => o.itemId === itemId)!;

/* ===== 1. kind dan medan baris ===== */

check('baris: kind outcome bagi I1 hingga I3 dan bebas bagi I4/I5',
  cari('I1')!.kind === 'outcome' && cari('I2')!.kind === 'outcome'
    && cari('I3')!.kind === 'outcome'
    && cari('I4')!.kind === 'bebas' && cari('I5')!.kind === 'bebas',
  laporan.outcomes.map((o) => [o.itemId, o.kind]));

check('baris: outcomeId null hanya bagi item bebas',
  cari('I1')!.outcomeId === 'K1' && cari('I4')!.outcomeId === null
    && cari('I5')!.outcomeId === null,
  laporan.outcomes.map((o) => [o.itemId, o.outcomeId]));

check('baris: label item bebas dipulangkan (bukan label kosong)',
  cari('I4')!.label === 'Kemahiran insaniah'
    && cari('I5')!.label === 'Guna alat makmal',
  laporan.outcomes.map((o) => [o.itemId, o.label]));

/* ===== 2. MWDS dan RDS item bebas dikira betul ===== */

// I4 menyalin corak K1: meanI 4.5, MWDS 6.75, RDS -100.
check('MWDS/RDS item bebas I4 (corak K1): 6.75 dan -100',
  cari('I4')!.meanI === 4.5 && cari('I4')!.meanC === 3
    && cari('I4')!.mwds === 6.75 && cari('I4')!.rds === -100,
  cari('I4'));

// I5 menyalin corak K2: MWDS 10.13, RDS -100.
check('MWDS/RDS item bebas I5 (corak K2): 10.13 dan -100',
  cari('I5')!.mwds === 10.13 && cari('I5')!.rds === -100,
  cari('I5'));

check('kedudukan Borich item bebas dikira bersama item Outcome',
  cari('I2')!.kedudukanBorich === 1 && cari('I5')!.kedudukanBorich === 1
    && cari('I1')!.kedudukanBorich === 3 && cari('I4')!.kedudukanBorich === 3
    && cari('I3')!.kedudukanBorich === 5,
  laporan.outcomes.map((o) => [o.itemId, o.kedudukanBorich]));

check('kuadran item bebas dikira (I4 kekal, I5 fokus)',
  cari('I4')!.kuadran === 'kekal' && cari('I5')!.kuadran === 'fokus',
  laporan.outcomes.map((o) => [o.itemId, o.kuadran]));

check('garis kuadran merangkumi kelima-lima item (purataMeanI 4.5)',
  laporan.purataMeanI === 4.5 && laporan.purataMeanC === 2.8,
  { i: laporan.purataMeanI, c: laporan.purataMeanC });

/* ===== 3. Penguasaan, bendera dan delta hanya bagi item Outcome ===== */

check('avgMasteryPct item bebas sentiasa null',
  cari('I4')!.avgMasteryPct === null && cari('I5')!.avgMasteryPct === null,
  [cari('I4')!.avgMasteryPct, cari('I5')!.avgMasteryPct]);

check('avgMasteryPct item Outcome kekal dikira (I1 = 55)',
  cari('I1')!.avgMasteryPct === 55 && cari('I2')!.avgMasteryPct === 90,
  [cari('I1')!.avgMasteryPct, cari('I2')!.avgMasteryPct]);

// R3 yakin (C=4) tetapi K1 lemah (25%, scored 4) pada item Outcome I1;
// item bebas I4 mempunyai jawapan yang sama tetapi TIDAK berbendera.
check('bendera tidak pernah wujud bagi item bebas',
  laporan.bendera.every((b) => b.itemId === 'I1' || b.itemId === 'I2'),
  laporan.bendera);

check('bendera item Outcome kekal (R3 I1 yakin lemah, R1 I2 kurang yakin)',
  laporan.bendera.length === 2
    && laporan.bendera.some((b) => b.userId === 'R3' && b.itemId === 'I1'
      && b.bendera === 'yakin_tetapi_lemah')
    && laporan.bendera.some((b) => b.userId === 'R1' && b.itemId === 'I2'
      && b.bendera === 'kurang_yakin_tetapi_menguasai'),
  laporan.bendera);

/* ===== 4. Perbandingan pra/pasca dengan item bebas ===== */

const jawapanPraBebas: JawapanLna[] = [
  { userId: 'R1', itemId: 'I4', importance: 5, currentLevel: 3 },
  { userId: 'R2', itemId: 'I4', importance: 4, currentLevel: 2 },
  { userId: 'R1', itemId: 'I1', importance: 5, currentLevel: 3 },
  { userId: 'R2', itemId: 'I1', importance: 4, currentLevel: 2 },
];
const jawapanPascaBebas: JawapanLna[] = [
  { userId: 'R1', itemId: 'I4', importance: 5, currentLevel: 4 },
  { userId: 'R2', itemId: 'I4', importance: 4, currentLevel: 3 },
  { userId: 'R1', itemId: 'I1', importance: 5, currentLevel: 4 },
  { userId: 'R2', itemId: 'I1', importance: 4, currentLevel: 3 },
];
const snapshotPra: MasteryLna[] = [
  { userId: 'R1', outcomeId: 'K1', masteryPct: 40, scored: 2 },
  { userId: 'R2', outcomeId: 'K1', masteryPct: 40, scored: 2 },
];
const snapshotPasca: MasteryLna[] = [
  { userId: 'R1', outcomeId: 'K1', masteryPct: 70, scored: 2 },
  { userId: 'R2', outcomeId: 'K1', masteryPct: 70, scored: 2 },
];
const banding = binaPerbandinganLna({
  items: ITEM_CAMPURAN,
  jawapanPra: jawapanPraBebas,
  jawapanPasca: jawapanPascaBebas,
  masteryPra: snapshotPra,
  masteryPasca: snapshotPasca,
});
const deltaI1 = banding.outcomes.find((o) => o.itemId === 'I1')!;
const deltaI4 = banding.outcomes.find((o) => o.itemId === 'I4')!;

// Pra I4: meanC 2.5, MWDS (5-3)*4.5 + (4-2)*4.5 = 9; pasca meanC 3.5,
// MWDS 4.5. Delta meanC +1, delta MWDS -4.5.
check('delta keyakinan item bebas dikira (I4: +1, MWDS -4.5)',
  deltaI4.deltaMeanC === 1 && deltaI4.deltaMwds === -4.5
    && deltaI4.kind === 'bebas',
  deltaI4);

check('deltaMastery item bebas null walaupun snapshot penuh',
  deltaI4.deltaMastery === null,
  deltaI4.deltaMastery);

check('deltaMastery item Outcome dikira daripada snapshot (I1: +30)',
  deltaI1.deltaMastery === 30 && deltaI1.kind === 'outcome',
  deltaI1.deltaMastery);

check('delta pelajar merangkumi item bebas (R1 dan R2 bagi I1 dan I4)',
  banding.pelajar.length === 4
    && banding.pelajar.every((d) => d.deltaC === 1)
    && banding.pelajar.some((d) => d.userId === 'R1' && d.itemId === 'I4')
    && banding.pelajar.some((d) => d.userId === 'R2' && d.itemId === 'I4'),
  banding.pelajar);

check('item tanpa jawapan pra/pasca (I2, I3, I5) delta null',
  banding.outcomes.filter(
    (o) => o.itemId === 'I2' || o.itemId === 'I3' || o.itemId === 'I5',
  ).every((o) => o.deltaMeanC === null && o.deltaMwds === null
    && o.deltaMastery === null),
  banding.outcomes);

/* ===== 5. Semua item bebas ===== */

const laporanSemuaBebas = binaLaporanLna({
  items: [
    { itemId: 'F1', outcomeId: null, label: 'Kemahiran insaniah' },
    { itemId: 'F2', outcomeId: null, label: 'Guna alat' },
    { itemId: 'F3', outcomeId: null, label: 'Prasyarat' },
  ],
  jawapan: [
    { userId: 'S1', itemId: 'F1', importance: 5, currentLevel: 1 },
    { userId: 'S1', itemId: 'F2', importance: 4, currentLevel: 2 },
    { userId: 'S1', itemId: 'F3', importance: 3, currentLevel: 3 },
  ],
  // Mastery kelas wujud tetapi tiada padanan: semua baris tetap null.
  mastery: [{ userId: 'S1', outcomeId: 'K9', masteryPct: 99, scored: 9 }],
});
check('semua bebas: MWDS/RDS dikira, penguasaan null, tiada bendera',
  laporanSemuaBebas.outcomes[0]!.mwds === 20
    && laporanSemuaBebas.outcomes.every(
      (o) => o.avgMasteryPct === null && o.kind === 'bebas')
    && laporanSemuaBebas.bendera.length === 0,
  laporanSemuaBebas);

/* ===== Ringkasan ===== */

console.log('');
console.log(`${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);
