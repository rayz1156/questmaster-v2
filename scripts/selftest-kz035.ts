/**
 * Ujian sendiri untuk enjin skor LNA (KZ-035): Borich MWDS, RDM RDS,
 * kuadran IPA, Spearman rho, bendera keyakinan lawan penguasaan dan
 * delta pra/pasca.
 *
 * Jalankan:  npx tsx scripts/selftest-kz035.ts
 *
 * Kenapa fail ini wujud: `npx tsc` dan `npm run build` tidak menyemak
 * logik formula. Data lampiran tiket (5 outcome x 4 pelajar) ialah
 * penanda aras; jika MWDS atau RDS terpesong, ujian ini gagal dahulu
 * sebelum sebarang laporan sampai ke guru.
 *
 * KZ-038: kunci item bertukar daripada outcomeId kepada itemId
 * (id qm_lna_items); ItemLna membawa outcomeId string | null. Semua
 * nilai penanda aras kekal sama.
 */
import {
  benderaKeyakinan,
  binaLaporanLna,
  binaPerbandinganLna,
  senaraiMasteryDaripadaSummary,
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

/* ===== Bahagian 1: data lampiran tiket (5 outcome x 4 pelajar) ===== */

const ITEM_LAMPIRAN: ItemLna[] = [
  { itemId: 'I1', outcomeId: 'K1', label: 'Kemahiran 1' },
  { itemId: 'I2', outcomeId: 'K2', label: 'Kemahiran 2' },
  { itemId: 'I3', outcomeId: 'K3', label: 'Kemahiran 3' },
  { itemId: 'I4', outcomeId: 'K4', label: 'Kemahiran 4' },
  { itemId: 'I5', outcomeId: 'K5', label: 'Kemahiran 5' },
];

// Lampiran: K1 5/3 4/2 5/4 4/3 | K2 4/2 5/3 4/2 5/2 | K3 5/4 4/4 5/3 4/3
//          K4 3/2 4/3 2/1 3/3 | K5 4/4 3/3 4/2 5/3  (pelajar R1 hingga R4)
const JAWAPAN_LAMPIRAN: JawapanLna[] = [
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
  { userId: 'R1', itemId: 'I4', importance: 3, currentLevel: 2 },
  { userId: 'R2', itemId: 'I4', importance: 4, currentLevel: 3 },
  { userId: 'R3', itemId: 'I4', importance: 2, currentLevel: 1 },
  { userId: 'R4', itemId: 'I4', importance: 3, currentLevel: 3 },
  { userId: 'R1', itemId: 'I5', importance: 4, currentLevel: 4 },
  { userId: 'R2', itemId: 'I5', importance: 3, currentLevel: 3 },
  { userId: 'R3', itemId: 'I5', importance: 4, currentLevel: 2 },
  { userId: 'R4', itemId: 'I5', importance: 5, currentLevel: 3 },
];

// Mastery contoh: R3 K1 lemah tetapi yakin (C=4), R1 K2 menguasai tetapi
// kurang yakin (C=2), R3 K3 hanya satu penghantaran dinilai (scored=1).
const MASTERY_LAMPIRAN: MasteryLna[] = [
  { userId: 'R1', outcomeId: 'K1', masteryPct: 80, scored: 3 },
  { userId: 'R2', outcomeId: 'K1', masteryPct: null, scored: 0 },
  { userId: 'R3', outcomeId: 'K1', masteryPct: 25, scored: 4 },
  { userId: 'R4', outcomeId: 'K1', masteryPct: 60, scored: 2 },
  { userId: 'R1', outcomeId: 'K2', masteryPct: 90, scored: 3 },
  { userId: 'R3', outcomeId: 'K3', masteryPct: 30, scored: 1 },
];

const laporan = binaLaporanLna({
  items: ITEM_LAMPIRAN,
  jawapan: JAWAPAN_LAMPIRAN,
  mastery: MASTERY_LAMPIRAN,
});

const cari = (itemId: string) =>
  laporan.outcomes.find((o) => o.itemId === itemId)!;

check('lampiran: 4 responden dan amaran sampel kecil',
  laporan.bilanganResponden === 4 && laporan.amaranSampelKecil === true,
  { n: laporan.bilanganResponden, amaran: laporan.amaranSampelKecil });

check('lampiran: MWDS K1 hingga K5 ikut tiket',
  cari('I1')!.mwds === 6.75 && cari('I2')!.mwds === 10.13
    && cari('I3')!.mwds === 4.5 && cari('I4')!.mwds === 2.25
    && cari('I5')!.mwds === 4,
  laporan.outcomes.map((o) => [o.itemId, o.mwds]));

check('lampiran: RDS K1 hingga K5 ikut tiket',
  cari('I1')!.rds === -100 && cari('I2')!.rds === -100
    && cari('I3')!.rds === -75 && cari('I4')!.rds === -75
    && cari('I5')!.rds === -50,
  laporan.outcomes.map((o) => [o.itemId, o.rds]));

check('lampiran: meanI dan meanC K1 (4.5, 3)',
  cari('I1')!.meanI === 4.5 && cari('I1')!.meanC === 3,
  cari('I1'));

check('lampiran: kedudukan Borich (MWDS menurun)',
  cari('I1')!.kedudukanBorich === 2 && cari('I2')!.kedudukanBorich === 1
    && cari('I3')!.kedudukanBorich === 3 && cari('I4')!.kedudukanBorich === 5
    && cari('I5')!.kedudukanBorich === 4,
  laporan.outcomes.map((o) => [o.itemId, o.kedudukanBorich]));

check('lampiran: kedudukan RDM dengan seri (K1/K2 = 1, K3/K4 = 3, K5 = 5)',
  cari('I1')!.kedudukanRdm === 1 && cari('I2')!.kedudukanRdm === 1
    && cari('I3')!.kedudukanRdm === 3 && cari('I4')!.kedudukanRdm === 3
    && cari('I5')!.kedudukanRdm === 5,
  laporan.outcomes.map((o) => [o.itemId, o.kedudukanRdm]));

// Pearson atas purata kedudukan: x=[2,1,3,5,4], y=[1.5,1.5,3.5,3.5,5]
// (K1/K2 seri pada RDS -100, K3/K4 seri pada -75) memberikan
// rho = 7.5 / sqrt(10*9) = 0.7906, dibulat 0.79.
check('lampiran: Spearman rho 0.79 dan kaedah sepakat',
  laporan.spearmanRho === 0.79 && laporan.kaedahSepakat === true,
  { rho: laporan.spearmanRho, sepakat: laporan.kaedahSepakat });

check('lampiran: garis kuadran purataMeanI 4.1 dan purataMeanC 2.8',
  laporan.purataMeanI === 4.1 && laporan.purataMeanC === 2.8,
  { i: laporan.purataMeanI, c: laporan.purataMeanC });

check('lampiran: kuadran IPA setiap outcome',
  cari('I1')!.kuadran === 'kekal' && cari('I2')!.kuadran === 'fokus'
    && cari('I3')!.kuadran === 'kekal'
    && cari('I4')!.kuadran === 'keutamaan_rendah'
    && cari('I5')!.kuadran === 'berlebihan',
  laporan.outcomes.map((o) => [o.itemId, o.kuadran]));

check('lampiran: avgMasteryPct K1 ialah purata responden bertag sahaja (55)',
  cari('I1')!.avgMasteryPct === 55,
  cari('I1')!.avgMasteryPct);

check('lampiran: outcome tanpa mastery langsung (K4, K5) avg null',
  cari('I4')!.avgMasteryPct === null && cari('I5')!.avgMasteryPct === null,
  [cari('I4')!.avgMasteryPct, cari('I5')!.avgMasteryPct]);

check('lampiran: dua bendera sahaja (R3 K1 yakin lemah, R1 K2 kurang yakin menguasai)',
  laporan.bendera.length === 2
    && laporan.bendera.some((b) =>
      b.userId === 'R3' && b.itemId === 'I1' && b.bendera === 'yakin_tetapi_lemah')
    && laporan.bendera.some((b) =>
      b.userId === 'R1' && b.itemId === 'I2' && b.bendera === 'kurang_yakin_tetapi_menguasai'),
  laporan.bendera);

/* ===== Bahagian 2: benderaKeyakinan, sempadan dan syarat scored ===== */

check('bendera: sempadan yakin_tetapi_lemah (C>=4, mastery<40, scored>=2)',
  benderaKeyakinan(4, 39, 2) === 'yakin_tetapi_lemah'
    && benderaKeyakinan(5, 0, 5) === 'yakin_tetapi_lemah',
  'hujung kiri');
check('bendera: mastery tepat 40 tidak lemah (syarat < 40 ketat)',
  benderaKeyakinan(4, 40, 2) === null);
check('bendera: currentLevel 3 tidak lemah (syarat >= 4)',
  benderaKeyakinan(3, 39, 2) === null);
check('bendera: scored 1 tidak menimbulkan bendera',
  benderaKeyakinan(4, 39, 1) === null);
check('bendera: sempadan kurang_yakin_tetapi_menguasai (C<=2, mastery>=80, scored>=2)',
  benderaKeyakinan(2, 80, 2) === 'kurang_yakin_tetapi_menguasai'
    && benderaKeyakinan(1, 100, 9) === 'kurang_yakin_tetapi_menguasai');
check('bendera: mastery 79 tidak menguasai (syarat >= 80 ketat)',
  benderaKeyakinan(2, 79, 2) === null);
check('bendera: currentLevel 3 tidak kurang yakin',
  benderaKeyakinan(3, 80, 2) === null);
check('bendera: mastery null tiada bendera walaupun yakin',
  benderaKeyakinan(5, null, 9) === null);

/* ===== Bahagian 3: kes tepi n=1 ===== */

const laporanN1 = binaLaporanLna({
  items: [{ itemId: 'IA1', outcomeId: 'A1', label: 'Satu' }],
  jawapan: [{ userId: 'S1', itemId: 'IA1', importance: 5, currentLevel: 3 }],
  mastery: [{ userId: 'S1', outcomeId: 'A1', masteryPct: 50, scored: 3 }],
});
check('n=1: meanI 5, meanC 3, MWDS 10, RDS -100',
  laporanN1.outcomes[0]!.meanI === 5 && laporanN1.outcomes[0]!.meanC === 3
    && laporanN1.outcomes[0]!.mwds === 10 && laporanN1.outcomes[0]!.rds === -100,
  laporanN1.outcomes[0]);
check('n=1: rho dan kaedahSepakat null (kurang 3 outcome)',
  laporanN1.spearmanRho === null && laporanN1.kaedahSepakat === null,
  { rho: laporanN1.spearmanRho, sepakat: laporanN1.kaedahSepakat });
check('n=1: kedudukan 1 dan kuadran kekal (seri pada garis dikira tinggi)',
  laporanN1.outcomes[0]!.kedudukanBorich === 1
    && laporanN1.outcomes[0]!.kedudukanRdm === 1
    && laporanN1.outcomes[0]!.kuadran === 'kekal',
  laporanN1.outcomes[0]);
check('n=1: amaran sampel kecil hidup',
  laporanN1.amaranSampelKecil === true && laporanN1.bilanganResponden === 1);

/* ===== Bahagian 4: semua seri (I = C untuk semua orang) ===== */

const jawapanSeri: JawapanLna[] = [];
for (const k of ['IB1', 'IB2', 'IB3']) {
  for (const u of ['S1', 'S2']) {
    jawapanSeri.push({ userId: u, itemId: k, importance: 3, currentLevel: 3 });
  }
}
const laporanSeri = binaLaporanLna({
  items: [
    { itemId: 'IB1', outcomeId: 'B1', label: 'Seri 1' },
    { itemId: 'IB2', outcomeId: 'B2', label: 'Seri 2' },
    { itemId: 'IB3', outcomeId: 'B3', label: 'Seri 3' },
  ],
  jawapan: jawapanSeri,
  mastery: [],
});
check('seri: semua MWDS 0 dan RDS 0',
  laporanSeri.outcomes.every((o) => o.mwds === 0 && o.rds === 0),
  laporanSeri.outcomes);
check('seri: semua berkongsi kedudukan 1',
  laporanSeri.outcomes.every(
    (o) => o.kedudukanBorich === 1 && o.kedudukanRdm === 1),
  laporanSeri.outcomes.map((o) => [o.kedudukanBorich, o.kedudukanRdm]));
check('seri: varians sifar memberikan rho null dan kaedah tidak dinilai',
  laporanSeri.spearmanRho === null && laporanSeri.kaedahSepakat === null,
  { rho: laporanSeri.spearmanRho, sepakat: laporanSeri.kaedahSepakat });

/* ===== Bahagian 5: outcome tanpa mastery sama sekali ===== */

const laporanTanpaMastery = binaLaporanLna({
  items: [
    { itemId: 'IC1', outcomeId: 'C1', label: 'Tanpa tag' },
    { itemId: 'IC2', outcomeId: 'C2', label: 'Ada tag' },
    { itemId: 'IC3', outcomeId: 'C3', label: 'Tanpa tag 2' },
  ],
  jawapan: [
    { userId: 'S1', itemId: 'IC1', importance: 5, currentLevel: 5 },
    { userId: 'S1', itemId: 'IC2', importance: 5, currentLevel: 5 },
    { userId: 'S1', itemId: 'IC3', importance: 5, currentLevel: 5 },
  ],
  mastery: [{ userId: 'S1', outcomeId: 'C2', masteryPct: 10, scored: 4 }],
});
check('tanpa mastery: avgMasteryPct null dan tiada bendera walaupun C=5',
  laporanTanpaMastery.outcomes[0]!.avgMasteryPct === null
    && laporanTanpaMastery.bendera.length === 1
    && laporanTanpaMastery.bendera[0]!.itemId === 'IC2',
  laporanTanpaMastery.bendera);

/* ===== Bahagian 6: pra/pasca ===== */

const itemDelta: ItemLna[] = [
  { itemId: 'ID1', outcomeId: 'D1', label: 'Delta 1' },
  { itemId: 'ID2', outcomeId: 'D2', label: 'Delta 2' },
];
const jawapanPra: JawapanLna[] = [
  { userId: 'S1', itemId: 'ID1', importance: 4, currentLevel: 2 },
  { userId: 'S2', itemId: 'ID1', importance: 4, currentLevel: 2 },
];
const jawapanPasca: JawapanLna[] = [
  { userId: 'S1', itemId: 'ID1', importance: 4, currentLevel: 3 },
  { userId: 'S2', itemId: 'ID2', importance: 4, currentLevel: 2 },
];
const banding = binaPerbandinganLna({
  items: itemDelta,
  jawapanPra,
  jawapanPasca,
  masteryPra: [
    { userId: 'S1', outcomeId: 'D1', masteryPct: 40, scored: 2 },
    { userId: 'S2', outcomeId: 'D1', masteryPct: 40, scored: 2 },
  ],
  masteryPasca: [
    { userId: 'S1', outcomeId: 'D1', masteryPct: 70, scored: 2 },
    { userId: 'S2', outcomeId: 'D1', masteryPct: 70, scored: 2 },
  ],
});
const deltaD1 = banding.outcomes.find((o) => o.itemId === 'ID1')!;
// Pra D1: meanC 2, MWDS (4-2)*4 = 8. Pasca S1 sahaja: meanC 3, MWDS 4.
check('delta: deltaMeanC 1 dan deltaMwds -4 bagi D1',
  deltaD1.deltaMeanC === 1 && deltaD1.deltaMwds === -4,
  deltaD1);
check('delta: deltaMastery 30 daripada snapshot pra/pasca',
  deltaD1.deltaMastery === 30, deltaD1.deltaMastery);
check('delta: D2 tiada delta (tiada jawapan pra) semuanya null',
  banding.outcomes[1]!.deltaMeanC === null
    && banding.outcomes[1]!.deltaMwds === null,
  banding.outcomes[1]);
check('delta: hanya S1 menjawab kedua-dua pusingan (deltaC 1)',
  banding.pelajar.length === 1 && banding.pelajar[0]!.userId === 'S1'
    && banding.pelajar[0]!.deltaC === 1,
  banding.pelajar);

// Pusingan pasca tanpa pra: semua delta null.
const bandingTanpaPra = binaPerbandinganLna({
  items: itemDelta,
  jawapanPra: [],
  jawapanPasca: jawapanPasca,
  masteryPra: null,
  masteryPasca: null,
});
check('pasca tanpa pra: semua delta null dan tiada delta pelajar',
  bandingTanpaPra.outcomes.every(
    (o) => o.deltaMeanC === null && o.deltaMwds === null && o.deltaMastery === null)
    && bandingTanpaPra.pelajar.length === 0,
  bandingTanpaPra);

// Snapshot hilang pada satu pihak: deltaMastery null.
const bandingTanpaSnapshot = binaPerbandinganLna({
  items: itemDelta,
  jawapanPra,
  jawapanPasca: [
    { userId: 'S1', itemId: 'ID1', importance: 4, currentLevel: 3 },
    { userId: 'S2', itemId: 'ID1', importance: 4, currentLevel: 3 },
  ],
  masteryPra: [
    { userId: 'S1', outcomeId: 'D1', masteryPct: 40, scored: 2 },
    { userId: 'S2', outcomeId: 'D1', masteryPct: 40, scored: 2 },
  ],
  masteryPasca: null,
});
check('snapshot pasca tiada: deltaMastery null walaupun deltaMeanC ada',
  bandingTanpaSnapshot.outcomes[0]!.deltaMastery === null
    && bandingTanpaSnapshot.outcomes[0]!.deltaMeanC === 1,
  bandingTanpaSnapshot.outcomes[0]);

/* ===== Bahagian 7: penukar snapshot qm_mastery_summary ===== */

const ringkasanContoh = {
  students: [
    {
      user_id: 'u1',
      outcomes: [
        { outcome_id: 'o1', mastery_pct: 75, scored: 3, bucket: 'developing' },
        { outcome_id: 'o2', mastery_pct: null, scored: 0, bucket: 'not_attempted' },
      ],
    },
    { user_id: 'u2', outcomes: [{ outcome_id: 'o1', mastery_pct: 90, scored: 5 }] },
    { user_id: null, outcomes: [{ outcome_id: 'o1', mastery_pct: 50, scored: 1 }] },
    { user_id: 'u3' },
  ],
};
const masteryTukar = senaraiMasteryDaripadaSummary(ringkasanContoh);
check('snapshot: tukar kepada MasteryLna dengan penapis nilai rosak',
  masteryTukar.length === 3
    && masteryTukar[0]!.masteryPct === 75 && masteryTukar[0]!.scored === 3
    && masteryTukar[1]!.masteryPct === null && masteryTukar[1]!.scored === 0
    && masteryTukar[2]!.masteryPct === 90,
  masteryTukar);
check('snapshot: input bukan objek dipulangkan kosong',
  senaraiMasteryDaripadaSummary(null).length === 0
    && senaraiMasteryDaripadaSummary('rosak').length === 0
    && senaraiMasteryDaripadaSummary({}).length === 0);

/* ===== Ringkasan ===== */

console.log('');
console.log(`${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);
