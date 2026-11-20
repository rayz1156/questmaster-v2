/**
 * Ujian sendiri KZ-058: enjin permainan platform "Lompat" (logik tulen).
 *
 * Jalankan:  npx tsx scripts/selftest-kz058.ts
 *
 * Aras dijana oleh kod, jadi tsc tidak dapat memberitahu sama ada setiap
 * lubang boleh dilompat atau sama ada aras boleh ditamatkan. Ujian ini
 * memainkan aras dengan bot ringkas.
 */
import {
  bukaSoalan,
  ciptaKeadaanLumba,
  jawabBetul,
  jawabSalah,
  perluSoalan,
  tutupSoalan,
  TIADA_INPUT,
  TREK_PANJANG_M,
  type InputPemandu,
  type KeadaanLumba,
} from '../src/components/solo/lumbaSoloEnjin';
import {
  ARAS_PANJANG_M,
  GRAVITI,
  HALAJU_LOMPAT,
  LAJU_ASAS_M_S,
  LAJU_MAX_M_S,
  adaTanah,
  ciptaKeadaanLompat,
  janaAras,
  lajuLarian,
  langkahLompat,
  type KeadaanLompat,
} from '../src/components/solo/lompatEnjin';

let lulus = 0;
let gagal = 0;
function semak(nama: string, syarat: boolean, butiran = ''): void {
  if (syarat) {
    lulus += 1;
    console.log('PASS ' + nama);
  } else {
    gagal += 1;
    console.log('FAIL ' + nama + (butiran ? '  -> ' + butiran : ''));
  }
}

/**
 * Bot: lari ke kanan, lompat bila lubang, duri atau peti hampir di hadapan.
 * Butang lompat ditekan berdenyut (seperti jari manusia), kerana lompatan
 * hanya bermula pada tekanan baharu.
 */
let denyut = 0;
function inputBot(L: KeadaanLompat): InputPemandu {
  denyut += 1;
  const depan = L.x + 0.9;
  const lubang = !adaTanah(L.aras, depan) && L.y === 0;
  const halangan = L.aras.blok.some(
    (b) => b.jenis !== 'pelantar' && b.y === 0 && b.x > L.x && b.x - L.x < 1.3,
  );
  return { kiri: false, kanan: true, pecut: L.diTanah && (lubang || halangan) && denyut % 4 < 2, brek: false };
}

function main(L: KeadaanLompat, k: KeadaanLumba, saat: number, input: (L: KeadaanLompat) => InputPemandu): void {
  for (let i = 0; i < saat * 60 && !k.selesai; i++) langkahLompat(L, k, 1000 / 60, input(L));
}

// 1. Aras deterministik.
const a1 = janaAras();
const a2 = janaAras();
semak('aras sama setiap kali', JSON.stringify(a1) === JSON.stringify(a2));
semak('aras ada lubang, duri, pelantar dan peti',
  a1.tanah.length > 3 &&
    (['duri', 'pelantar', 'peti'] as const).every((j) => a1.blok.some((b) => b.jenis === j)));

// 2. Setiap lubang boleh dilompat pada laju penalti (paling perlahan).
const masaUdara = (2 * HALAJU_LOMPAT) / GRAVITI;
const kPenalti = ciptaKeadaanLumba();
jawabSalah(kPenalti);
const jarakPenalti = lajuLarian(kPenalti) * masaUdara;
let lubangMax = 0;
for (let i = 1; i < a1.tanah.length; i++) lubangMax = Math.max(lubangMax, a1.tanah[i][0] - a1.tanah[i - 1][1]);
semak('lubang terlebar lebih pendek daripada lompatan semasa penalti', lubangMax < jarakPenalti - 0.2,
  `lubang ${lubangMax.toFixed(2)} lompatan ${jarakPenalti.toFixed(2)}`);
semak('mula dan penamat selamat', adaTanah(a1, 2) && adaTanah(a1, 13) && adaTanah(a1, ARAS_PANJANG_M - 10) && adaTanah(a1, ARAS_PANJANG_M));

// 3. Laju ikut jawapan.
const kLaju = ciptaKeadaanLumba();
semak('laju asas pada mula', Math.abs(lajuLarian(kLaju) - LAJU_ASAS_M_S) < 1e-9);
for (let i = 0; i < 10; i++) jawabBetul(kLaju);
semak('laju maksimum selepas banyak jawapan betul', Math.abs(lajuLarian(kLaju) - LAJU_MAX_M_S) < 1e-9);
semak('penalti memperlahankan', lajuLarian(kPenalti) < LAJU_ASAS_M_S && lajuLarian(kPenalti) >= 3);

// 4. Tanpa kawalan, watak tidak bergerak.
{
  const L = ciptaKeadaanLompat();
  const k = ciptaKeadaanLumba();
  main(L, k, 5, () => TIADA_INPUT);
  semak('tiada input: watak kekal di tempat mula', Math.abs(L.x - 2) < 0.01 && L.y === 0 && !k.selesai);
  semak('tiada input: masa tetap berjalan', Math.abs(k.masaMs - 5000) < 20);
}

// 5. Lari tanpa melompat: jatuh ke lubang pertama dan hidup semula di belakangnya.
{
  const L = ciptaKeadaanLompat();
  const k = ciptaKeadaanLumba();
  main(L, k, 12, () => ({ kiri: false, kanan: true, pecut: false, brek: false }));
  const lubang1 = L.aras.tanah[0][1];
  semak('tanpa lompat: jatuh sekurang-kurangnya sekali', L.jatuh >= 1);
  semak('tanpa lompat: tidak melepasi lubang pertama', L.x < L.aras.tanah[1][0], `x=${L.x.toFixed(2)} lubang=${lubang1.toFixed(2)}`);
  semak('tanpa lompat: belum selesai', !k.selesai);
}

// 6. Lompat: tinggi dan pendaratan.
{
  const L = ciptaKeadaanLompat();
  const k = ciptaKeadaanLumba();
  let puncak = 0;
  for (let i = 0; i < 120; i++) {
    langkahLompat(L, k, 1000 / 60, { kiri: false, kanan: false, pecut: i < 3, brek: false });
    puncak = Math.max(puncak, L.y);
  }
  const jangka = (HALAJU_LOMPAT * HALAJU_LOMPAT) / (2 * GRAVITI);
  semak('tinggi lompat hampir v²/2g', Math.abs(puncak - jangka) < 0.15, `puncak ${puncak.toFixed(2)} jangka ${jangka.toFixed(2)}`);
  semak('mendarat semula di tanah', L.y === 0 && L.diTanah);
}
{
  const L = ciptaKeadaanLompat();
  const k = ciptaKeadaanLumba();
  let lompatan = 0;
  let diUdara = false;
  for (let i = 0; i < 180; i++) {
    langkahLompat(L, k, 1000 / 60, { kiri: false, kanan: false, pecut: true, brek: false });
    if (!L.diTanah && !diUdara) lompatan += 1;
    diUdara = !L.diTanah;
  }
  semak('tahan butang: satu lompatan sahaja', lompatan === 1, `lompatan=${lompatan}`);
}

// 7. Peti menghalang larian; pelantar boleh didarati.
{
  const L = ciptaKeadaanLompat();
  const k = ciptaKeadaanLumba();
  const peti = L.aras.blok.find((b) => b.jenis === 'peti');
  if (peti) {
    L.x = peti.x - 3;
    L.selamatX = L.x;
    main(L, k, 3, () => ({ kiri: false, kanan: true, pecut: false, brek: false }));
    semak('peti menghalang watak yang berlari', L.x <= peti.x - 0.3 && L.x > peti.x - 0.6, `x=${L.x.toFixed(2)} peti=${peti.x.toFixed(2)}`);
  } else semak('peti wujud', false);
  const pel = L.aras.blok.find((b) => b.jenis === 'pelantar');
  if (pel) {
    const L2 = ciptaKeadaanLompat();
    const k2 = ciptaKeadaanLumba();
    L2.x = pel.x + pel.w / 2;
    L2.y = pel.y + pel.h + 2;
    L2.diTanah = false;
    main(L2, k2, 2, () => TIADA_INPUT);
    semak('watak mendarat di atas pelantar', Math.abs(L2.y - (pel.y + pel.h)) < 1e-6 && L2.diTanah);
  } else semak('pelantar wujud', false);
}

// 8. Duri: hidup semula dan kebal seketika.
{
  const L = ciptaKeadaanLompat();
  const k = ciptaKeadaanLumba();
  const duri = L.aras.blok.find((b) => b.jenis === 'duri');
  if (duri) {
    L.x = duri.x - 1.5;
    L.selamatX = L.x;
    main(L, k, 1, () => ({ kiri: false, kanan: true, pecut: false, brek: false }));
    semak('duri: watak hidup semula di belakang duri', L.jatuh === 1 && L.x < duri.x, `jatuh=${L.jatuh} x=${L.x.toFixed(2)}`);
  } else semak('duri wujud', false);
}

// 9. Dunia berhenti semasa soalan, masa tetap berjalan.
{
  const L = ciptaKeadaanLompat();
  const k = ciptaKeadaanLumba();
  main(L, k, 2, inputBot);
  const x0 = L.x;
  const t0 = k.masaMs;
  bukaSoalan(k);
  main(L, k, 3, inputBot);
  semak('soalan terbuka: watak tidak bergerak', L.x === x0);
  semak('soalan terbuka: masa berjalan', k.masaMs - t0 > 2900);
  tutupSoalan(k);
  main(L, k, 1, inputBot);
  semak('selepas soalan ditutup: watak bergerak semula', L.x > x0 + 2);
}

// 10. Bot menamatkan aras; kemajuan ditulis ke KeadaanLumba.
{
  const L = ciptaKeadaanLompat();
  const k = ciptaKeadaanLumba();
  let soalan = 0;
  for (let i = 0; i < 200 * 60 && !k.selesai; i++) {
    if (perluSoalan(k)) {
      bukaSoalan(k);
      soalan += 1;
    }
    // Jawab selepas 2 saat; berselang betul dan salah.
    if (k.soalanDibukaMs !== null && k.masaMs - k.soalanDibukaMs > 2000) {
      if (soalan % 2 === 0) jawabSalah(k);
      else jawabBetul(k);
      tutupSoalan(k);
    }
    langkahLompat(L, k, 1000 / 60, inputBot(L));
  }
  semak('bot menamatkan aras', k.selesai, `x=${L.x.toFixed(1)} jatuh=${L.jatuh}`);
  semak('bot tamat dalam masa munasabah (bawah 150 s)', k.masaMs < 150_000, `masa=${(k.masaMs / 1000).toFixed(1)} s`);
  semak('bot jarang jatuh (bawah 4 kali)', L.jatuh < 4, `jatuh=${L.jatuh}`);
  semak('kemajuan penuh ditulis ke enjin soalan', k.jarakM === TREK_PANJANG_M);
  semak('bot mengutip bintang', L.bintangDiambil > 10, `bintang=${L.bintangDiambil}`);
  semak('soalan dibuka sepanjang larian', soalan >= 4, `soalan=${soalan}`);
}

// 11. Bot pada laju maksimum juga boleh tamat (lompatan lebih jauh tidak memerangkap).
{
  const L = ciptaKeadaanLompat();
  const k = ciptaKeadaanLumba();
  for (let i = 0; i < 10; i++) jawabBetul(k);
  main(L, k, 150, inputBot);
  semak('bot laju maksimum menamatkan aras', k.selesai, `x=${L.x.toFixed(1)} jatuh=${L.jatuh}`);
}

console.log(`LULUS: ${lulus}  GAGAL: ${gagal}`);
if (gagal > 0) process.exit(1);
