/**
 * Ujian logik KZ-013: mod Lawan Raksasa (Boss Battle).
 * Menguji fungsi tulen baharu di src/lib/lumba-laju.ts.
 *
 * Jalankan: npx tsx scripts/selftest-kz013.ts
 */
import {
  sahModPermainan,
  sahTahapRaksasa,
  TAHAP_RAKSASA,
  nyawaRaksasa,
  cadanganSoalanRaksasa,
  jangkaanRaksasa,
  susunPenyerang,
  fasaRaksasa,
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
// sahModPermainan: 'boss' kini diterima, mod asing kekal ditolak
// ---------------------------------------------------------------------
semak('mod-boss', sahModPermainan('boss') === 'boss', 'boss diterima');
semak('mod-kosong', sahModPermainan(undefined) === 'classic', 'tiada mod = classic');
semak('mod-race-kekal', sahModPermainan('race') === 'race', 'race kekal diterima');
semak('mod-asing', sahModPermainan('raksasa') === null, 'mod asing ditolak');

// ---------------------------------------------------------------------
// sahTahapRaksasa: tiada/kosong = medium, lain-lain ditolak
// ---------------------------------------------------------------------
semak('tahap-lalai-undefined', sahTahapRaksasa(undefined) === 'medium', 'undefined -> medium');
semak('tahap-lalai-null', sahTahapRaksasa(null) === 'medium', 'null -> medium');
semak('tahap-lalai-kosong', sahTahapRaksasa('') === 'medium', 'rentetan kosong -> medium');
semak('tahap-easy', sahTahapRaksasa('easy') === 'easy', 'easy diterima');
semak('tahap-medium', sahTahapRaksasa('medium') === 'medium', 'medium diterima');
semak('tahap-hard', sahTahapRaksasa('hard') === 'hard', 'hard diterima');
semak('tahap-asing', sahTahapRaksasa('extreme') === null, 'tahap asing ditolak');
semak('tahap-huruf-besar', sahTahapRaksasa('Easy') === null, 'huruf besar ditolak (case sensitive)');

// Pemalar tahap sepadan dengan migrasi 0060.
semak('tahap-pemalar', TAHAP_RAKSASA.easy === 55 && TAHAP_RAKSASA.medium === 65 && TAHAP_RAKSASA.hard === 70,
  'easy 55, medium 65, hard 70');

// ---------------------------------------------------------------------
// nyawaRaksasa
// ---------------------------------------------------------------------
semak('nyawa-biasa', nyawaRaksasa(20, 5, 65) === 6500, `20 pemain 5 minit k=65 -> ${nyawaRaksasa(20, 5, 65)}`);
semak('nyawa-minimum', nyawaRaksasa(0, 5, 65) === 1, 'tiada pemain -> sekurang-kurangnya 1');
semak('nyawa-satu-pemain', nyawaRaksasa(1, 1, 55) === 55, '1 pemain 1 minit easy -> 55');
semak('nyawa-pecahan', nyawaRaksasa(2.9, 5, 65) === 650, 'bilangan pemain dibundar ke bawah: floor(2.9)=2 -> 650');

// ---------------------------------------------------------------------
// cadanganSoalanRaksasa: rujukan 1 -> 15, 3 -> 40, 5 -> 60
// ---------------------------------------------------------------------
const rujukanRaksasa: Array<[number, number]> = [[1, 15], [3, 40], [5, 60]];
for (const [minit, jangka] of rujukanRaksasa) {
  const dapat = cadanganSoalanRaksasa(minit);
  semak(`cadangan-raksasa-${minit}min`, dapat === jangka, `dapat ${dapat}, jangka ${jangka}`);
}
semak('cadangan-raksasa-minimum', cadanganSoalanRaksasa(0) === 5, `0 minit -> ${cadanganSoalanRaksasa(0)}`);
semak('cadangan-raksasa-2min', cadanganSoalanRaksasa(2) === 25, `2 minit -> ${cadanganSoalanRaksasa(2)}`);

// ---------------------------------------------------------------------
// jangkaanRaksasa: teks tepat untuk panel guru
// ---------------------------------------------------------------------
semak('jangkaan-easy',
  jangkaanRaksasa('easy') === 'The class almost always wins; the boss usually falls about three quarters of the way through.',
  jangkaanRaksasa('easy'));
semak('jangkaan-medium',
  jangkaanRaksasa('medium') === 'The class usually wins in the final moments (around 85% of the time used).',
  jangkaanRaksasa('medium'));
semak('jangkaan-hard',
  jangkaanRaksasa('hard') === 'A tense fight; a less accurate class can lose, especially in short battles.',
  jangkaanRaksasa('hard'));

// ---------------------------------------------------------------------
// susunPenyerang: kerosakan menurun, seri ikut nama menaik, kedudukan 1..N
// ---------------------------------------------------------------------
{
  const papan = susunPenyerang([
    { id: 'a', nickname: 'Zack', boss_damage: 30 },
    { id: 'b', nickname: 'Aina', boss_damage: 30 },
    { id: 'c', nickname: 'Ben', boss_damage: 100 },
    { id: 'd', nickname: 'Citra', boss_damage: null },
    { id: 'e', nickname: 'Devi', boss_damage: '45' },
  ]);
  semak('penyerang-susunan', papan.map((p) => p.id).join('') === 'cebad',
    `dapat ${papan.map((p) => p.id).join('')}, jangka cebad`);
  semak('penyerang-kedudukan', papan.map((p) => p.kedudukan).join(',') === '1,2,3,4,5', 'kedudukan 1..5');
  semak('penyerang-seri-nama', papan[1].id === 'e' && papan[2].id === 'b' && papan[3].id === 'a',
    'seri 30: Aina (b) sebelum Devi tidak berlaku; ikut nama menaik');
}
{
  // Seri sebenar: nama berhuruf besar/kecil dibandingkan ikut lower().
  const papan = susunPenyerang([
    { id: 'x', nickname: 'BOB', boss_damage: 10 },
    { id: 'y', nickname: 'alice', boss_damage: 10 },
  ]);
  semak('penyerang-seri-lower', papan[0].id === 'y', 'alice < BOB ikut lower()');
  semak('penyerang-kosong', susunPenyerang([]).length === 0, 'senarai kosong kekal kosong');
}

// ---------------------------------------------------------------------
// fasaRaksasa: sempadan 51%/50%/26%/25%/0 dan maxHp 0
// ---------------------------------------------------------------------
semak('fasa-51', fasaRaksasa(51, 100) === 'calm', '51% -> calm');
semak('fasa-50', fasaRaksasa(50, 100) === 'angry', '50% -> angry');
semak('fasa-26', fasaRaksasa(26, 100) === 'angry', '26% -> angry');
semak('fasa-25', fasaRaksasa(25, 100) === 'rage', '25% -> rage');
semak('fasa-0', fasaRaksasa(0, 100) === 'rage', '0% -> rage');
semak('fasa-maxhp-0', fasaRaksasa(0, 0) === 'calm', 'maxHp 0 -> calm');
semak('fasa-penuh', fasaRaksasa(100, 100) === 'calm', '100% -> calm');

// ---------------------------------------------------------------------
// Hasil akhir
// ---------------------------------------------------------------------
if (gagal > 0) {
  console.log(`\n${gagal} semakan gagal.`);
  process.exit(1);
}
console.log('\nSemua semakan lulus.');
