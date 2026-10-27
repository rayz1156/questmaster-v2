/**
 * Ujian logik KZ-032: masa bonus kelajuan ditetapkan guru (Speed Race dan
 * Boss Battle). Menguji fungsi tulen di src/lib/lumba-laju.ts:
 * bonusBaki (bar pemain) dan sahBonusKelajuan (pengesahan 15/30/45/60).
 *
 * Jalankan: npx tsx scripts/selftest-kz032.ts
 */
import {
  BONUS_LALAI_SEC,
  NILAI_BONUS_SEC,
  bonusBaki,
  nitroBaki,
  sahBonusKelajuan,
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
// bonusBaki: 0 ms berlalu = 1 (penuh), separuh tempoh = 0.5, tempoh penuh
// berlalu = 0, dan nilai tidak sah (tempoh 0, negatif, NaN) = 0.
// ---------------------------------------------------------------------
semak('bonus-serta-merta', bonusBaki(1000, 1000, 30) === 1, '0 ms berlalu -> 1');
semak(
  'bonus-separuh',
  Math.abs(bonusBaki(0, 15000, 30) - 0.5) < 1e-9,
  `15 s daripada tempoh 30 s -> ${bonusBaki(0, 15000, 30)}`,
);
semak(
  'bonus-separuh-60',
  Math.abs(bonusBaki(0, 30000, 60) - 0.5) < 1e-9,
  `30 s daripada tempoh 60 s -> ${bonusBaki(0, 30000, 60)}`,
);
semak('bonus-habis', bonusBaki(0, 30000, 30) === 0, 'tempoh penuh berlalu -> 0');
semak('bonus-lepas-tempoh', bonusBaki(0, 60000, 30) === 0, 'melepasi tempoh -> 0');
semak('bonus-masa-depan', bonusBaki(30000, 1000, 30) === 1, 'jam pelayan di hadapan -> 1');
semak('bonus-tempoh-tidak-sah', bonusBaki(0, 1000, 0) === 0, 'tempoh 0 -> 0');
semak('bonus-tempoh-negatif', bonusBaki(0, 1000, -30) === 0, 'tempoh negatif -> 0');
semak('bonus-tempoh-nan', bonusBaki(0, 1000, Number.NaN) === 0, 'tempoh NaN -> 0');
semak('bonus-masuk-nan', bonusBaki(Number.NaN, 1000, 30) === 0, 'masukan NaN -> 0');
semak(
  'bonus-bergantung-tempoh',
  Math.abs(bonusBaki(0, 20000, 60) - 1 + 20000 / 60000) < 1e-9,
  `20 s daripada tempoh 60 s -> ${bonusBaki(0, 20000, 60)} (pelayan migrasi 0067 sama)`,
);

// ---------------------------------------------------------------------
// sahBonusKelajuan: hanya 15, 30, 45 dan 60 sah; lain null. Lalai 30
// dijaga pemalar BONUS_LALAI_SEC, dan nitroBaki lama tidak berubah.
// ---------------------------------------------------------------------
const kesBonus: Array<[unknown, number | null]> = [
  [15, 15], [30, 30], [45, 45], [60, 60],
  [3, null], [10, null], [20, null], [61, null], [120, null], [0, null], [-30, null],
  [2.5, null], ['30', 30], [' 45 ', 45], ['15.5', null], ['abc', null], ['', null],
  [null, null], [undefined, null], [true, null], [{}, null],
];
for (const [masuk, jangka] of kesBonus) {
  const dapat = sahBonusKelajuan(masuk);
  semak(
    `sah-bonus-${JSON.stringify(masuk)}`,
    dapat === jangka,
    `dapat ${JSON.stringify(dapat)}, jangka ${JSON.stringify(jangka)}`,
  );
}
semak('pemalar-nilai', JSON.stringify([...NILAI_BONUS_SEC]) === '[15,30,45,60]', 'NILAI_BONUS_SEC = 15,30,45,60');
semak('pemalar-lalai', BONUS_LALAI_SEC === 30, `BONUS_LALAI_SEC = ${BONUS_LALAI_SEC}`);

// nitroBaki sedia ada tidak berubah supaya padanan formula lama kekal.
semak('nitro-lama-kekal', nitroBaki(0, 10000, 20) === 0, 'nitroBaki separuh had -> 0 (kekal)');
semak('nitro-lama-penuh', nitroBaki(5000, 5000, 20) === 1, 'nitroBaki serta-merta -> 1 (kekal)');

// ---------------------------------------------------------------------
// Hasil akhir
// ---------------------------------------------------------------------
if (gagal > 0) {
  console.log(`\n${gagal} semakan gagal.`);
  process.exit(1);
}
console.log('\nSemua semakan lulus.');