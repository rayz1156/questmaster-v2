/**
 * Ujian logik KZ-012: mod Lumba Laju (Speed Race) dan mod perbincangan.
 * Menguji fungsi tulen di src/lib/lumba-laju.ts.
 *
 * Jalankan: npx tsx scripts/selftest-kz012.ts
 */
import {
  sahMinitLumba,
  sahModPermainan,
  cadanganSoalan,
  ulanganSoalan,
  susunPapan,
  taburanCubaanPertama,
  nitroBaki,
  ordinal,
  formatJam,
  kocok,
  langkahReview,
} from '../src/lib/lumba-laju';

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
// sahMinitLumba dan sahModPermainan
// ---------------------------------------------------------------------
const kesMinit: Array<[unknown, number | null]> = [
  [0, null], [1, 1], [5, 5], [60, 60], [61, null], [2.5, null],
  ['5', 5], [' 12 ', 12], ['2.5', null], ['abc', null], [null, null], [undefined, null], [-3, null],
];
for (const [masuk, jangka] of kesMinit) {
  const dapat = sahMinitLumba(masuk);
  semak(`minit-${JSON.stringify(masuk)}`, dapat === jangka, `dapat ${dapat}, jangka ${jangka}`);
}
semak('mod-kosong', sahModPermainan(undefined) === 'classic', 'tiada mod = classic');
semak('mod-race', sahModPermainan('race') === 'race', 'race diterima');
semak('mod-classic', sahModPermainan('classic') === 'classic', 'classic diterima');
semak('mod-asing', sahModPermainan('battle') === null, 'mod asing ditolak');

// ---------------------------------------------------------------------
// cadanganSoalan: nilai rujukan yang Boss setuju dalam prototaip
// ---------------------------------------------------------------------
const rujukan: Array<[number, number]> = [[1, 15], [2, 25], [3, 25], [5, 35], [8, 35], [10, 35]];
for (const [minit, jangka] of rujukan) {
  const c = cadanganSoalan(minit);
  semak(`cadangan-${minit}min`, c.disyorkan === jangka, `dapat ${c.disyorkan}, jangka ${jangka}`);
}
{
  const c = cadanganSoalan(5);
  const laju = c.profil.find((p) => p.nama === 'laju')!;
  semak('cadangan-laju-sampai', laju.sampai && laju.jumlah === 12, `laju jumlah ${laju.jumlah}, sampai ${laju.sampai}`);
  const c1 = cadanganSoalan(1);
  semak('cadangan-1min-lemah-tidak-sampai', c1.profil.find((p) => p.nama === 'lemah')!.sampai === false,
    'lemah tidak sempat dalam 1 minit');
  semak('cadangan-minimum-5', cadanganSoalan(0).disyorkan === 5, `0 minit -> ${cadanganSoalan(0).disyorkan}`);
}

// ---------------------------------------------------------------------
// ulanganSoalan
// ---------------------------------------------------------------------
semak('ulangan-5-soalan', ulanganSoalan(35, 5) === 7, `35/5 -> ${ulanganSoalan(35, 5)}`);
semak('ulangan-cukup', ulanganSoalan(35, 40) === 1, 'soalan cukup -> 1');
semak('ulangan-sama', ulanganSoalan(35, 35) === 1, 'sama banyak -> 1');
semak('ulangan-sifar', ulanganSoalan(35, 0) === 0, 'tiada soalan -> 0');
semak('ulangan-bundar', ulanganSoalan(25, 12) === 3, `25/12 -> ${ulanganSoalan(25, 12)}`);

// ---------------------------------------------------------------------
// susunPapan
// ---------------------------------------------------------------------
{
  const papan = susunPapan([
    { id: 'a', nickname: 'Aisyah', score: 9000, race_distance: '64.50', race_rank: null },
    { id: 'b', nickname: 'Haziq', score: 12000, race_distance: 100, race_rank: 2 },
    { id: 'c', nickname: 'Nurul', score: 11000, race_distance: '100.00', race_rank: 1 },
    { id: 'd', nickname: 'Danial', score: 7000, race_distance: 64.5, race_rank: null },
    { id: 'e', nickname: 'Arvind', score: 7000, race_distance: 64.5, race_rank: null },
    { id: 'f', nickname: 'Farah', score: 0, race_distance: null, race_rank: null },
  ]);
  const susunan = papan.map((p) => p.id).join('');
  semak('papan-susunan', susunan === 'cbaedf', `dapat ${susunan}, jangka cbaedf`);
  semak('papan-kedudukan', papan.map((p) => p.kedudukan).join(',') === '1,2,3,4,5,6', 'kedudukan 1..6');
}

// ---------------------------------------------------------------------
// taburanCubaanPertama
// ---------------------------------------------------------------------
{
  const t = taburanCubaanPertama(
    [
      { player_id: 'p1', choice_key: 'B', is_correct: true, attempt: 1 },
      { player_id: 'p2', choice_key: 'A', is_correct: false, attempt: 1 },
      { player_id: 'p3', choice_key: 'A', is_correct: false, attempt: 1 },
      { player_id: 'p2', choice_key: 'B', is_correct: true, attempt: 2 },
      { player_id: 'p3', choice_key: 'C', is_correct: false, attempt: 2 },
      { player_id: 'p3', choice_key: 'B', is_correct: true, attempt: 3 },
      { player_id: 'p4', choice_key: 'B', is_correct: true, attempt: null },
    ],
    ['A', 'B', 'C', 'D'],
  );
  semak('taburan-pilihan', JSON.stringify(t.pilihan) === JSON.stringify({ A: 2, B: 2, C: 0, D: 0 }),
    `dapat ${JSON.stringify(t.pilihan)} (attempt 2 dan 3 diabaikan, null dikira sebagai 1)`);
  semak('taburan-jumlah', t.jumlahPertama === 4 && t.betulPertama === 2, `${t.betulPertama}/${t.jumlahPertama}`);
  semak('taburan-peratus', t.peratusBetulPertama === 50, `peratus ${t.peratusBetulPertama}`);
  semak('taburan-semua-cubaan', t.jumlahSemuaCubaan === 7, `semua cubaan ${t.jumlahSemuaCubaan}`);
  const kosong = taburanCubaanPertama([], ['A', 'B']);
  semak('taburan-kosong', kosong.peratusBetulPertama === null && kosong.pilihan.A === 0, 'tiada jawapan -> null');
  const sepertiga = taburanCubaanPertama(
    [
      { player_id: 'x', choice_key: 'A', is_correct: true, attempt: 1 },
      { player_id: 'y', choice_key: 'B', is_correct: false, attempt: 1 },
      { player_id: 'z', choice_key: 'B', is_correct: false, attempt: 1 },
    ],
    ['A', 'B'],
  );
  semak('taburan-perpuluhan', sepertiga.peratusBetulPertama === 33.3, `1/3 -> ${sepertiga.peratusBetulPertama}`);
}

// ---------------------------------------------------------------------
// nitroBaki
// ---------------------------------------------------------------------
semak('nitro-serta-merta', nitroBaki(1000, 1000, 20) === 1, 'saat 0 -> 1');
semak('nitro-suku', Math.abs(nitroBaki(0, 5000, 20) - 0.5) < 1e-9, `5 s daripada had 20 -> ${nitroBaki(0, 5000, 20)}`);
semak('nitro-separuh-had', nitroBaki(0, 10000, 20) === 0, 'separuh had -> 0');
semak('nitro-lepas-had', nitroBaki(0, 25000, 20) === 0, 'melepasi had -> 0');
semak('nitro-masa-depan', nitroBaki(5000, 1000, 20) === 1, 'jam pelayan di hadapan -> 1');
semak('nitro-had-tidak-sah', nitroBaki(0, 1000, 0) === 0, 'had 0 -> 0');

// ---------------------------------------------------------------------
// ordinal dan formatJam
// ---------------------------------------------------------------------
const ord: Array<[number, string]> = [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [111, '111th'], [112, '112th']];
for (const [n, s] of ord) semak(`ordinal-${n}`, ordinal(n) === s, `dapat ${ordinal(n)}`);
semak('jam-5min', formatJam(300000) === '05:00', formatJam(300000));
semak('jam-bundar-atas', formatJam(59001) === '01:00', formatJam(59001));
semak('jam-negatif', formatJam(-500) === '00:00', formatJam(-500));

// ---------------------------------------------------------------------
// kocok
// ---------------------------------------------------------------------
{
  const asal = ['A', 'B', 'C', 'D'];
  const k = kocok(asal);
  semak('kocok-tidak-ubah-asal', asal.join('') === 'ABCD', 'senarai asal kekal');
  semak('kocok-unsur-sama', [...k].sort().join('') === 'ABCD', `dapat ${k.join('')}`);
  const tetap = kocok(asal, () => 0);
  semak('kocok-boleh-diramal', tetap.join('') === 'BCDA', `rawak 0 -> ${tetap.join('')}`);
}

// ---------------------------------------------------------------------
// langkahReview
// ---------------------------------------------------------------------
{
  const mula = langkahReview('review_start', -1, 5);
  semak('review-mula', mula.ok && mula.index === 0 && mula.revealed === false, JSON.stringify(mula));
  const dedah = langkahReview('review_reveal', 0, 5);
  semak('review-dedah', dedah.ok && dedah.index === 0 && dedah.revealed === true, JSON.stringify(dedah));
  const seterus = langkahReview('review_next', 0, 5);
  semak('review-seterusnya', seterus.ok && seterus.index === 1 && seterus.revealed === false, JSON.stringify(seterus));
  semak('review-akhir-ditolak', !langkahReview('review_next', 4, 5).ok, 'soalan terakhir');
  semak('review-awal-ditolak', !langkahReview('review_prev', 0, 5).ok, 'soalan pertama');
  const balik = langkahReview('review_prev', 3, 5);
  semak('review-sebelum', balik.ok && balik.index === 2, JSON.stringify(balik));
  semak('review-belum-mula', !langkahReview('review_next', -1, 5).ok && !langkahReview('review_reveal', -1, 5).ok,
    'next/reveal sebelum mula ditolak');
  const tamat = langkahReview('review_end', 3, 5);
  semak('review-tamat', tamat.ok && tamat.index === -1, JSON.stringify(tamat));
  semak('review-tiada-soalan', !langkahReview('review_start', -1, 0).ok, 'kuiz kosong');
}

// ---------------------------------------------------------------------
// Hasil akhir
// ---------------------------------------------------------------------
if (gagal > 0) {
  console.log(`\n${gagal} semakan gagal.`);
  process.exit(1);
}
console.log('\nSemua semakan lulus.');
