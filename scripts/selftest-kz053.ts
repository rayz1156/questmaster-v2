/**
 * Ujian sendiri KZ-053 (Lumba Solo) untuk logik tulen yang tidak menyentuh
 * pangkalan data: markah pelayan, susunan papan, pengesahan input, token
 * dan enjin permainan.
 *
 * Jalankan:  npx tsx scripts/selftest-kz053.ts
 *
 * `npx tsc` dan `npm run build` tidak menyemak logik; formula markah dan
 * susunan papan ialah tempat yang senyap salah, dan kesilapan di situ
 * hanya kelihatan selepas pelajar bermain dan markah papan rosak.
 */
import {
  ABJAD_KOD_SOLO,
  bandingPapan,
  hashIp,
  hashToken,
  janaKodSolo,
  kiraElapsedMs,
  kiraMata,
  kedudukanPapan,
  kocok,
  sahkanKodSolo,
  sahkanNickname,
  susunPapan,
  tokenSama,
  topengNama,
  topengPapan,
  type BarisLarianPapan,
} from '../src/lib/lumba-solo';
import {
  bukaSoalan,
  ciptaKeadaanLumba,
  hadLajuEfektif,
  HAD_LAJU_AWAL,
  HAD_LAJU_MAX,
  jawabBetul,
  jawabSalah,
  kedudukanPemain,
  langkahLumba,
  masaSoalanBerlalu,
  penaltiAktif,
  perluSoalan,
  SOALAN_SETIAP_MS,
  SOALAN_PERTAMA_MS,
  REHAT_SOALAN_MS,
  kelengkunganTrek,
  kadarHanyut,
  HANYUT_MAX_M_S,
  KADAR_OFFSET_M_S,
  TREK_PANJANG_M,
  TIADA_INPUT,
  tutupSoalan,
} from '../src/components/solo/lumbaSoloEnjin';

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

/* ===== Bahagian 1: markah pelayan ===== */

check('betul serta-merta: 1000 mata -> 1500', kiraMata(1000, 0, true) === 1500, kiraMata(1000, 0, true));
check('betul separuh tetingkap: 1000 -> 1250', kiraMata(1000, 15000, true) === 1250, kiraMata(1000, 15000, true));
check('betul tepat 30 saat: 1000 -> 1000', kiraMata(1000, 30000, true) === 1000, kiraMata(1000, 30000, true));
check('betul lewat 30.001 saat: 0', kiraMata(1000, 30001, true) === 0);
check('salah apa-apa masa: 0', kiraMata(1000, 0, false) === 0 && kiraMata(1000, 100, false) === 0);
check('ms negatif dikemaskan ke 0', kiraMata(1000, -500, true) === 1500);
check('mata bukan integer dilantai ke bawah', kiraMata(999.7, 0, true) === 1499, kiraMata(999.7, 0, true));
check('mata 100 betul serta-merta: 150', kiraMata(100, 0, true) === 150);
check('mata 100 betul 10 saat: 133', kiraMata(100, 10000, true) === 133, kiraMata(100, 10000, true));

/* ===== Bahagian 2: susunan papan ===== */

const l1: BarisLarianPapan = { id: 'r1', nickname: 'Ali', userId: 'u1', score: 100, elapsedMs: 50000, finishedAt: '2026-01-02T00:00:00Z' };
const l1buruk: BarisLarianPapan = { id: 'r2', nickname: 'Ali', userId: 'u1', score: 80, elapsedMs: 40000, finishedAt: '2026-01-01T00:00:00Z' };
const l2: BarisLarianPapan = { id: 'r3', nickname: 'Bob', userId: 'u2', score: 100, elapsedMs: 40000, finishedAt: '2026-01-03T00:00:00Z' };
const l3: BarisLarianPapan = { id: 'r4', nickname: 'Cikgu', userId: null, score: 90, elapsedMs: 60000, finishedAt: '2026-01-04T00:00:00Z' };

const papan = susunPapan([l1, l1buruk, l2, l3]);
check('satu baris terbaik per pemain (3 baris, bukan 4)', papan.length === 3, papan);
check('markah sama: masa menaik dahulu (Bob sebelum Ali)', papan[0]?.runId === 'r3' && papan[1]?.runId === 'r1', papan);
check('baris terbaik Ali ialah r1 (markah lebih tinggi menang)', papan[1]?.score === 100);
check('rank berurutan 1..3', papan.map((p) => p.rank).join(',') === '1,2,3');
check('kedudukan r1 dalam senarai penuh: 2', kedudukanPapan([l1, l1buruk, l2, l3], 'r1') === 2);
check('kedudukan larian tiada: null', kedudukanPapan([l1, l2], 'r4') === null);
check('kedudukan mengabaikan baris lemah pemain sama', kedudukanPapan([l1buruk, l1, l2], 'r1') === 2, kedudukanPapan([l1buruk, l1, l2], 'r1'));

// Tetamu dengan nickname sama besar/kecil ialah pemain yang sama.
const gA: BarisLarianPapan = { id: 'g1', nickname: 'Tetamu', userId: null, score: 50, elapsedMs: 30000, finishedAt: null };
const gB: BarisLarianPapan = { id: 'g2', nickname: 'tetamu', userId: null, score: 70, elapsedMs: 90000, finishedAt: null };
const papanTetamu = susunPapan([gA, gB]);
check('tetamu nickname kecil sama kunci: satu baris', papanTetamu.length === 1 && papanTetamu[0]?.runId === 'g2', papanTetamu);

// Potongan 10 teratas dan susunan markah menurun.
const banyak: BarisLarianPapan[] = Array.from({ length: 15 }, (_, i) => ({
  id: 'x' + i,
  nickname: 'P' + i,
  userId: 'u' + i,
  score: i,
  elapsedMs: 1000,
  finishedAt: null,
}));
const papanBanyak = susunPapan(banyak);
check('papan dipotong kepada 10', papanBanyak.length === 10);
check('susunan markah menurun', papanBanyak[0]?.score === 14 && papanBanyak[9]?.score === 5, papanBanyak.map((p) => p.score));

// elapsed_ms null diletakkan di belakang yang ada nilai.
const n1: BarisLarianPapan = { id: 'n1', nickname: 'N1', userId: 'uN1', score: 100, elapsedMs: null, finishedAt: null };
check('elapsed null di belakang', bandingPapan(l2, n1) < 0 && bandingPapan(n1, l2) > 0);

// finished_at awal memecah kebuntuan.
const f1: BarisLarianPapan = { id: 'f1', nickname: 'F1', userId: 'uF1', score: 100, elapsedMs: 40000, finishedAt: '2026-01-01T00:00:00Z' };
check('finished awal menang kebuntuan', bandingPapan(f1, l2) < 0);

/* ===== Bahagian 3: nickname dan kod ===== */

check('nickname sah', sahkanNickname('  Ali   Baba ') === 'Ali Baba');
check('nickname 24 aksara sah', sahkanNickname('a'.repeat(24)) === 'a'.repeat(24));
check('nickname 25 aksara ditolak', sahkanNickname('a'.repeat(25)) === null);
check('nickname kosong ditolak', sahkanNickname('   ') === null);
check('nickname bukan string ditolak', sahkanNickname(123) === null);
check('nickname satu aksara sah', sahkanNickname('x') === 'x');

check('kod sah diterima', sahkanKodSolo('KZ53AA') === true);
check('kod dengan 0 ditolak', sahkanKodSolo('KZ530A') === false);
check('kod dengan O ditolak', sahkanKodSolo('KZO3AA') === false);
check('kod dengan 1 ditolak', sahkanKodSolo('KZ51AA') === false);
check('kod dengan I ditolak', sahkanKodSolo('KZ53AI') === false);
check('kod pendek ditolak', sahkanKodSolo('KZ53A') === false);
check('kod kecil ditolak', sahkanKodSolo('kz53aa') === false);

let kodJana = '';
let kodSemuaSah = true;
for (let i = 0; i < 200; i++) {
  kodJana = janaKodSolo();
  if (!sahkanKodSolo(kodJana)) kodSemuaSah = false;
  if (!kodJana.split('').every((c) => ABJAD_KOD_SOLO.includes(c))) kodSemuaSah = false;
}
check('janaKodSolo 6 aksara sah 200 kali', kodSemuaSah && kodJana.length === 6);

/* ===== Bahagian 4: kocok dan token ===== */

const asal = [1, 2, 3, 4, 5, 6, 7, 8];
const kocokSekali = kocok(asal, () => 0);
check(
  'kocok deterministik rng 0: hasil tetap',
  JSON.stringify(kocokSekali) === JSON.stringify([2, 3, 4, 5, 6, 7, 8, 1]),
  kocokSekali,
);
check('kocok rng hampir 1: tidak berubah', JSON.stringify(kocok(asal, () => 0.999)) === JSON.stringify(asal), kocok(asal, () => 0.999));
check('kocok mengekalkan elemen (multiset)', [...kocok([3, 1, 2, 1], () => 0.99)].sort().join(',') === '1,1,2,3');
check('kocok tidak mengubah input', JSON.stringify(asal) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]));
const kocokRawak = kocok(asal);
check('kocok rawak mengekalkan bilangan', kocokRawak.length === 8);

const token = 'token-rahsia-larian-1';
const hash = hashToken(token);
check('hashToken sha256 hex 64', /^[0-9a-f]{64}$/.test(hash));
check('tokenSama menerima token betul', tokenSama(token, hash) === true);
check('tokenSama menolak token salah', tokenSama('token-lain', hash) === false);
check('tokenSama menolak hash rosak', tokenSama(token, 'bukan-hash') === false);
check('kiraElapsedMs mudah', kiraElapsedMs('2026-01-01T00:00:00Z', '2026-01-01T00:01:40Z') === 100000);
check('kiraElapsedMs negatif dikemaskan 0', kiraElapsedMs('2026-01-01T00:01:00Z', '2026-01-01T00:00:00Z') === 0);
check('kiraElapsedMs input rosak: 0', kiraElapsedMs('rosak', '2026-01-01T00:00:00Z') === 0);
check('hashIp stabil dan hex', /^[0-9a-f]{64}$/.test(hashIp('1.2.3.4')) && hashIp('1.2.3.4') === hashIp('1.2.3.4'));

/* ===== Bahagian 5: enjin permainan ===== */

// Had laju naik dengan jawapan betul dan bercuak pada 240.
const k1 = ciptaKeadaanLumba();
check('had laju awal 120', k1.hadLaju === HAD_LAJU_AWAL);
for (let i = 0; i < 8; i++) jawabBetul(k1);
check('had laju bercuak 240 selepas banyak betul', k1.hadLaju === HAD_LAJU_MAX, k1.hadLaju);

// Penalti: separuh had laju selama 8 saat.
const k2 = ciptaKeadaanLumba();
jawabBetul(k2); // 140
k2.masaMs = 10_000;
jawabSalah(k2);
check('penalti aktif serta-merta', penaltiAktif(k2) === true);
check('had berkesan separuh semasa penalti', hadLajuEfektif(k2) === 70, hadLajuEfektif(k2));
k2.masaMs = 10_000 + 7999;
check('penalti masih aktik pada 7.999 saat', penaltiAktif(k2) === true);
k2.masaMs = 10_000 + 8000;
check('penalti tamat tepat 8 saat', penaltiAktif(k2) === false && hadLajuEfektif(k2) === 140);

// Penamat: pecut berterusan tanpa soalan pada had 120, pemain mengemudi ke tengah.
const k3 = ciptaKeadaanLumba();
const pecut = { kiri: false, kanan: false, pecut: true, brek: false };
/** Pemain yang mengemudi sendiri (KZ-056): stereng analog ke arah tengah jalan. */
const kemudi = (k: { offsetM: number }, asas = pecut) => ({ ...asas, stereng: Math.max(-1, Math.min(1, -k.offsetM * 1.5)) });
let luarJalan3 = 0;
let langkah3 = 0;
while (!k3.selesai && langkah3 < 5000) {
  langkahLumba(k3, 100, kemudi(k3));
  if (k3.diLuarJalan) luarJalan3++;
  langkah3++;
}
const masaPenamat3 = k3.masaMs / 1000;
check('penamat dicapai', k3.selesai && k3.jarakM === TREK_PANJANG_M, k3);
check(
  'penamat pada had 120: kira-kira 144 saat',
  masaPenamat3 > 130 && masaPenamat3 < 175,
  masaPenamat3,
);

// Penamat lebih cepat bila semua jawapan betul (had laju naik).
const k4 = ciptaKeadaanLumba();
for (let i = 0; i < 6; i++) jawabBetul(k4);
let langkah4 = 0;
while (!k4.selesai && langkah4 < 5000) {
  langkahLumba(k4, 100, kemudi(k4));
  if (k4.diLuarJalan) luarJalan3++;
  langkah4++;
}
check('penamat had 240 lebih cepat daripada had 120', k4.selesai && k4.masaMs < k3.masaMs, k4.masaMs);
check('penamat had 240 kira-kira 72 saat', k4.masaMs / 1000 > 60 && k4.masaMs / 1000 < 100, k4.masaMs / 1000);
check('pemain yang mengemudi kekal di atas jalan (had 120 dan 240)', luarJalan3 === 0, luarJalan3);

// KZ-056: tanpa stereng, kereta hanyut di selekoh dan tersasar keluar jalan.
const kh = ciptaKeadaanLumba();
let hanyutLuar = false;
for (let i = 0; i < 600 && !kh.selesai; i++) {
  langkahLumba(kh, 100, pecut);
  if (kh.diLuarJalan) hanyutLuar = true;
}
check('tanpa stereng: kereta tersasar keluar jalan dalam 60 saat', hanyutLuar, kh.offsetM);
let kelengMax = 0;
for (let d = 0; d <= TREK_PANJANG_M; d += 5) kelengMax = Math.max(kelengMax, Math.abs(kelengkunganTrek(d)));
check('trek ada selekoh sebenar', kelengMax > 0.001, kelengMax);
check('hanyutan sentiasa di bawah kadar stereng', HANYUT_MAX_M_S < KADAR_OFFSET_M_S);
let tanda = true;
for (let d = 200; d <= TREK_PANJANG_M; d += 37) {
  const h = kadarHanyut(d, 120);
  if (Math.abs(kelengkunganTrek(d)) > 1e-3 && Math.sign(h) !== -Math.sign(kelengkunganTrek(d))) tanda = false;
}
check('hanyutan ke luar selekoh tajam (arah bertentangan kelengkungan)', tanda);
check('tiada hanyutan pada kelajuan 0', kadarHanyut(1000, 0) === 0);

// Keluar jalan memperlahankan kereta.
const k5 = ciptaKeadaanLumba();
const kananSahaja = { kiri: false, kanan: true, pecut: true, brek: false };
for (let i = 0; i < 40; i++) langkahLumba(k5, 100, kananSahaja); // 4 saat
check('offset melebihi jalan: di luar jalan', k5.diLuarJalan && k5.offsetM > 3.5, k5.offsetM);
const kelajuanLuar = k5.kelajuan;
for (let i = 0; i < 60; i++) langkahLumba(k5, 100, kananSahaja); // kekal di luar, pecut
check('keluar jalan memperlahankan walaupun pecut', k5.kelajuan < HAD_LAJU_AWAL * 0.5, k5.kelajuan);
check('kelajuan luar jalan tidak naik', k5.kelajuan <= kelajuanLuar + 5, [kelajuanLuar, k5.kelajuan]);

// Semasa soalan (KZ-055): kelajuan separuh had, stereng masih aktif.
const k6 = ciptaKeadaanLumba();
k6.offsetM = 2.5;
for (let i = 0; i < 30; i++) langkahLumba(k6, 100, kemudi(k6));
bukaSoalan(k6);
for (let i = 0; i < 60; i++) langkahLumba(k6, 100, kemudi(k6)); // 6 saat semasa soalan
check('semasa soalan: kelajuan menghampiri separuh had', Math.abs(k6.kelajuan - hadLajuEfektif(k6) * 0.5) < 8, k6.kelajuan);
const k6tanpa = { ...k6 };
const k6kiri = { ...k6 };
for (let i = 0; i < 5; i++) {
  langkahLumba(k6tanpa, 100, TIADA_INPUT);
  langkahLumba(k6kiri, 100, { ...TIADA_INPUT, kiri: true });
}
check('semasa soalan: tiada pembetulan automatik ke tengah', Math.abs(k6tanpa.offsetM) > 0.05 || Math.abs(kadarHanyut(k6.jarakM, k6.kelajuan)) < 0.01, k6tanpa.offsetM);
check('semasa soalan: stereng kiri masih berfungsi', k6kiri.offsetM < k6tanpa.offsetM - 2.5, [k6tanpa.offsetM, k6kiri.offsetM]);
check('soalan dibuka dicatat', k6.soalanKe === 1 && k6.soalanDibukaMs !== null);
check('masa soalan berlalu positif', (masaSoalanBerlalu(k6) ?? 0) > 5000);
tutupSoalan(k6);
check('tutup soalan: dijawab dikira', k6.soalanDijawab === 1 && k6.soalanDibukaMs === null);
tutupSoalan(k6);
check('tutup soalan dua kali tidak berkira ganda', k6.soalanDijawab === 1);

// Jadual soalan (KZ-055): pertama selepas 5 saat, kemudian setiap 15 saat, rehat 4 saat.
const k7 = ciptaKeadaanLumba();
check('tiada soalan pada saat 0', perluSoalan(k7) === false);
k7.masaMs = SOALAN_PERTAMA_MS;
check('soalan pertama pada 5 saat', perluSoalan(k7) === true);
bukaSoalan(k7);
check('tiada soalan baharu bila satu terbuka', perluSoalan(k7) === false);
k7.masaMs = SOALAN_PERTAMA_MS + 2000;
tutupSoalan(k7);
k7.masaMs = SOALAN_PERTAMA_MS + SOALAN_SETIAP_MS - 1;
check('belum 15 saat: tiada soalan baharu', perluSoalan(k7) === false);
k7.masaMs = SOALAN_PERTAMA_MS + SOALAN_SETIAP_MS;
check('tepat 15 saat: soalan baharu', perluSoalan(k7) === true);
// Soalan lambat dijawab: soalan seterusnya menunggu rehat 4 saat.
const k7b = ciptaKeadaanLumba();
k7b.masaMs = SOALAN_PERTAMA_MS;
bukaSoalan(k7b);
k7b.masaMs = SOALAN_PERTAMA_MS + 25_000;
tutupSoalan(k7b);
check('selepas soalan lambat: rehat dahulu', perluSoalan(k7b) === false);
k7b.masaMs += REHAT_SOALAN_MS;
check('selepas rehat 4 saat: soalan baharu', perluSoalan(k7b) === true);

// Kedudukan lawan kereta komputer 1..3.
const k8 = ciptaKeadaanLumba();
check('kedudukan mula: 1', kedudukanPemain(k8) === 1);
k8.masaMs = 40_000;
k8.jarakM = 500;
check('kedudukan saat 40: 3 (kedua-dua komputer di hadapan)', kedudukanPemain(k8) === 3, [jarakKomputerIdx(k8), k8]);
function jarakKomputerIdx(k: { masaMs: number }): [number, number] {
  // Pembantu paparan sahaja: 150 dan 175 km/j.
  return [(150 / 3.6) * (k.masaMs / 1000), (175 / 3.6) * (k.masaMs / 1000)];
}
k8.masaMs = 40_000;
k8.jarakM = 1700; // antara 150 (1667m) dan 175 (1944m)
check('kedudukan tengah: 2', kedudukanPemain(k8) === 2);

// Brek menghentikan kereta.
const k9 = ciptaKeadaanLumba();
for (let i = 0; i < 30; i++) langkahLumba(k9, 100, kemudi(k9));
const lajuSebelum = k9.kelajuan;
for (let i = 0; i < 120; i++) langkahLumba(k9, 100, { kiri: false, kanan: false, pecut: false, brek: true });
check('brek memperlahankan hampir berhenti', lajuSebelum > 80 && k9.kelajuan < 5, [lajuSebelum, k9.kelajuan]);

// Selepas selesai, langkah tidak mengubah apa-apa.
const k10 = ciptaKeadaanLumba();
k10.selesai = true;
langkahLumba(k10, 1000, pecut);
check('selesai: masa beku', k10.masaMs === 0 && k10.jarakM === 0, k10);

// Input kosong: kereta masih bergerak pada 75% had (pemanduan santai).
const k11 = ciptaKeadaanLumba();
for (let i = 0; i < 100; i++) langkahLumba(k11, 100, kemudi(k11, TIADA_INPUT));
check('tanpa input: kelajuan ~75% had', k11.kelajuan > HAD_LAJU_AWAL * 0.6 && k11.kelajuan < HAD_LAJU_AWAL * 0.85, k11.kelajuan);

/* ===== Ringkasan ===== */
console.log('');
// Topeng nama papan awam kuiz berkelas (penemuan kzsec 1).
check('topeng: tiga perkataan', topengNama('Siti Nur Aisyah') === 'S. N. A.');
check('topeng: huruf kecil + ruang lebih', topengNama('  ali   bin abu ') === 'A. B. A.');
check('topeng: kosong', topengNama('   ') === '?');
{
  const p = topengPapan([{ rank: 1, runId: 'r1', nickname: 'Ahmad Faiz', score: 9, elapsedMs: 1, finishedAt: null }]);
  check('topengPapan: nama ditopeng, markah kekal', p[0]!.nickname === 'A. F.' && p[0]!.score === 9 && p[0]!.rank === 1);
}

console.log('LULUS: ' + pass + '  GAGAL: ' + fail);
if (fail > 0) {
  process.exitCode = 1;
}
