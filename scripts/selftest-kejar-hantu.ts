/**
 * Ujian sendiri untuk logik Kejar Hantu yang tidak menyentuh DOM.
 *
 * Jalankan:  npx tsx scripts/selftest-kejar-hantu.ts
 *
 * `npx tsc` tidak menyemak logik maze: sasaran hantu, keutamaan arah di
 * simpang, jadual mod dan pembalukan terowong senyap salah tanpa ujian ini.
 */
import {
  ATAS,
  BAWAH,
  BARIS_TEROWONG,
  BILANGAN_BUTIR,
  KANAN,
  KIRI,
  LABIRIN,
  LEBAR,
  MULAI_KUIZI,
  NAMA_HANTU,
  PETI_LOKASI,
  PUSAT_RUMAH,
  SUDUT_SCATTER,
  TINGGI,
  URUT_KEUTAMAAN,
  arahBolehDari,
  bolehLalui,
  dalamTerowong,
  fasaModPadaMasa,
  floodFill,
  jubinChar,
  modPadaMasa,
  petakanPeti,
  pilihArahKeSasaran,
  pilihArahRawak,
  sasaranHantu,
  senaraiJubinBolehJalan,
  wrapX,
} from '../src/components/arena/games/kejarHantuLogik';

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

/* ===== Bahagian 1: bentuk labirin ===== */

check('labirin ada 31 baris', LABIRIN.length === TINGGI, LABIRIN.length);
check('setiap baris tepat 28 aksara', LABIRIN.every((b) => b.length === LEBAR), LABIRIN.map((b) => b.length));
check(
  'aksara labirin sah sahaja',
  LABIRIN.every((b) => /^[#.oT\- ]*$/.test(b)),
  LABIRIN,
);
check('butir mencukupi untuk pelepasan hantu 4 (>60)', BILANGAN_BUTIR > 60, BILANGAN_BUTIR);
check('lapan lokasi peti dalam labirin', PETI_LOKASI.length === 8, PETI_LOKASI.length);

// titik mula watak bukan dinding dan bukan dalam rumah
check('mula Kuizi boleh dipijak', bolehLalui(MULAI_KUIZI.x, MULAI_KUIZI.y), jubinChar(MULAI_KUIZI.x, MULAI_KUIZI.y));
check('pusat rumah boleh dilalui hantu', bolehLalui(PUSAT_RUMAH.x, PUSAT_RUMAH.y, true));
check('pusat rumah tidak boleh dilalui Kuizi', !bolehLalui(PUSAT_RUMAH.x, PUSAT_RUMAH.y));
check(
  'pintu rumah hanya untuk hantu',
  jubinChar(13, 11) === '-' && !bolehLalui(13, 11) && bolehLalui(13, 11, true),
  jubinChar(13, 11),
);

/* ===== Bahagian 2: tiada jubin boleh jalan yang terasing ===== */

const jubinKuizi = senaraiJubinBolehJalan(false);
const sampulKuizi = floodFill(MULAI_KUIZI.x, MULAI_KUIZI.y, false);
const terasingKuizi = jubinKuizi.filter((j) => !sampulKuizi.has(`${j.x},${j.y}`));
check('maze Kuizi tiada jubin terasing (' + jubinKuizi.length + ' jubin)', terasingKuizi.length === 0, terasingKuizi);

const jubinHantu = senaraiJubinBolehJalan(true);
const sampulHantu = floodFill(PUSAT_RUMAH.x, PUSAT_RUMAH.y, true);
const terasingHantu = jubinHantu.filter((j) => !sampulHantu.has(`${j.x},${j.y}`));
check('maze hantu tiada jubin terasing (' + jubinHantu.length + ' jubin)', terasingHantu.length === 0, terasingHantu);

/* ===== Bahagian 3: pembalukan terowong ===== */

check('wrapX(-0.6) menjadi 27.4', Math.abs(wrapX(-0.6) - 27.4) < 1e-9, wrapX(-0.6));
check('wrapX(-1) menjadi 27', Math.abs(wrapX(-1) - 27) < 1e-9, wrapX(-1));
check('wrapX(28) menjadi 0', Math.abs(wrapX(28) - 0) < 1e-9, wrapX(28));
check('wrapX(27.6) menjadi -0.4', Math.abs(wrapX(27.6) - -0.4) < 1e-9, wrapX(27.6));
check('jubin kolum -1 baris terowong sama dengan kolum 27', jubinChar(-1, BARIS_TEROWONG) === jubinChar(27, BARIS_TEROWONG), [
  jubinChar(-1, BARIS_TEROWONG),
  jubinChar(27, BARIS_TEROWONG),
]);
check('hantu di kolum 0 boleh pilih kiri (pembalukan)', arahBolehDari(0, BARIS_TEROWONG, true).some((a) => a === KIRI));
check('dalamTerowong tepi kiri', dalamTerowong(2, BARIS_TEROWONG));
check('dalamTerowong tepi kanan', dalamTerowong(25, BARIS_TEROWONG));
check('tengah baris terowong bukan zon perlahan', !dalamTerowong(13, BARIS_TEROWONG));
check('baris lain bukan terowong', !dalamTerowong(2, 16));

/* ===== Bahagian 4: jadual mod Scatter/Chase ===== */

// Scatter 7, Chase 20, Scatter 7, Chase 20, Scatter 5, Chase 20, Scatter 5, Chase kekal
check('mod bermula Scatter', modPadaMasa(0) === 'scatter', modPadaMasa(0));
check('6.9s masih Scatter', modPadaMasa(6.9) === 'scatter', modPadaMasa(6.9));
check('7s bertukar Chase', modPadaMasa(7) === 'chase', modPadaMasa(7));
check('26.9s masih Chase pertama', modPadaMasa(26.9) === 'chase', modPadaMasa(26.9));
check('27s Scatter kedua', modPadaMasa(27) === 'scatter', modPadaMasa(27));
check('34s Chase kedua', modPadaMasa(34) === 'chase', modPadaMasa(34));
check('54s Scatter ketiga (5s)', modPadaMasa(54) === 'scatter', modPadaMasa(54));
check('59s Chase ketiga', modPadaMasa(59) === 'chase', modPadaMasa(59));
check('79s Scatter keempat (5s)', modPadaMasa(79) === 'scatter', modPadaMasa(79));
check('84s Chase kekal', modPadaMasa(84) === 'chase', modPadaMasa(84));
check('1000s masih Chase kekal', modPadaMasa(1000) === 'chase', modPadaMasa(1000));
check('lapan fasa dalam jadual', fasaModPadaMasa(0) === 0 && fasaModPadaMasa(84) === 7, fasaModPadaMasa(84));

/* ===== Bahagian 5: sasaran keempat-empat hantu ===== */

const keadaan = (indeks: number, mod: 'scatter' | 'chase') => ({
  indeks,
  mod,
  kuiziX: 13,
  kuiziY: 16,
  kuiziDx: 1, // Kuizi bergerak ke kanan
  kuiziDy: 0,
  hantuX: 5,
  hantuY: 25,
  merahX: 13,
  merahY: 10,
});

const sGarang = sasaranHantu(keadaan(0, 'chase'));
check('Garang (chase) mensasari jubin Kuizi', sGarang.x === 13 && sGarang.y === 16, sGarang);

const sLicik = sasaranHantu(keadaan(1, 'chase'));
check('Licik mensasari 4 jubin hadapan Kuizi', sLicik.x === 17 && sLicik.y === 16, sLicik);

const sLicikAtas = sasaranHantu({ ...keadaan(1, 'chase'), kuiziDx: 0, kuiziDy: -1 });
check('Licik ikut arah Kuizi (atas)', sLicikAtas.x === 13 && sLicikAtas.y === 12, sLicikAtas);

// Bijak: titik 2 hadapan Kuizi = (15,16); vektor dari Garang (13,10) ke situ
// = (2,6), digandakan = (4,12); sasaran = (13+4, 10+12) = (17,22).
const sBijak = sasaranHantu(keadaan(2, 'chase'));
check('Bijak mencerminkan vektor Garang', sBijak.x === 17 && sBijak.y === 22, sBijak);

// Malu: jarak Kuizi ke (5,25) = hypot(8,9) > 8, jadi kejar Kuizi.
const sMaluJauh = sasaranHantu(keadaan(3, 'chase'));
check('Malu kejar bila jarak > 8 jubin', sMaluJauh.x === 13 && sMaluJauh.y === 16, sMaluJauh);

// Malu berhampiran (jarak 2.24 < 8): pergi ke sudut Scatternya.
const sMaluDekat = sasaranHantu({ ...keadaan(3, 'chase'), hantuX: 11, hantuY: 17 });
check('Malu ke sudut bila jarak <= 8 jubin', sMaluDekat.x === 1 && sMaluDekat.y === 29, sMaluDekat);

// Sudut sempadan: jarak tepat 8 dianggap dekat (spesifikasi: > 8 sahaja kejar).
const sMaluTepat = sasaranHantu({ ...keadaan(3, 'chase'), hantuX: 5, hantuY: 16 });
check('Malu tepat 8 jubin pergi ke sudut', sMaluTepat.x === 1 && sMaluTepat.y === 29, sMaluTepat);

// Scatter: semua ke sudut sendiri.
const sudutScatter = NAMA_HANTU.map((_, i) => sasaranHantu(keadaan(i, 'scatter')));
check(
  'semua hantu ke sudut sendiri semasa Scatter',
  sudutScatter.every((s, i) => s.x === SUDUT_SCATTER[i]?.x && s.y === SUDUT_SCATTER[i]?.y),
  sudutScatter,
);

/* ===== Bahagian 6: pilihan arah di simpang dengan keutamaan seri ===== */

// Jubin (6,5): simpang empat arah (atas, kiri, bawah, kanan semuanya laluan).
check('(6,5) simpang penuh', arahBolehDari(6, 5, false).length === 4, arahBolehDari(6, 5, false));

// Semua arah sama jarak bila sasaran ialah jubin itu sendiri: pilih ATAS.
check('seri empat arah pilih atas', pilihArahKeSasaran(6, 5, KANAN, { x: 6, y: 5 }) === ATAS,
  pilihArahKeSasaran(6, 5, KANAN, { x: 6, y: 5 }));

check('seri atas-kiri pilih atas', pilihArahKeSasaran(6, 5, KANAN, { x: 5, y: 4 }) === ATAS,
  pilihArahKeSasaran(6, 5, KANAN, { x: 5, y: 4 }));
check('seri atas-kanan pilih atas', pilihArahKeSasaran(6, 5, KANAN, { x: 7, y: 4 }) === ATAS,
  pilihArahKeSasaran(6, 5, KANAN, { x: 7, y: 4 }));
// arah semasa dipilih supaya tiada arah seri terlibat sebagai balikan larang
check('seri kiri-bawah pilih kiri', pilihArahKeSasaran(6, 5, KIRI, { x: 5, y: 6 }) === KIRI,
  pilihArahKeSasaran(6, 5, KIRI, { x: 5, y: 6 }));
check('seri bawah-kanan pilih bawah', pilihArahKeSasaran(6, 5, BAWAH, { x: 7, y: 6 }) === BAWAH,
  pilihArahKeSasaran(6, 5, BAWAH, { x: 7, y: 6 }));

// Arah terdekat menang walaupun keutamaan lebih rendah.
check('kanan lebih dekat menang atas kiri', pilihArahKeSasaran(6, 5, KANAN, { x: 7, y: 5 }) === KANAN,
  pilihArahKeSasaran(6, 5, KANAN, { x: 7, y: 5 }));

// Larang berpatah balik: dari (6,5) arah KANAN, kiri dibuang.
// Sasaran jauh kiri (0,5): atas dan bawah sama jarak, kanan menjauh: pilih ATAS.
check('larang balik: kiri dibuang dari arah kanan', pilihArahKeSasaran(6, 5, KANAN, { x: 0, y: 5 }) === ATAS,
  pilihArahKeSasaran(6, 5, KANAN, { x: 0, y: 5 }));

// Jalan mati sebenar: jubin (12,19) hanya boleh keluar ke bawah. Hantu yang
// tiba di sana (arah ATAS) terpaksa berpatah balik walau sasaran di atas.
check('(12,19) jalan satu hala ke bawah', arahBolehDari(12, 19, true).length === 1 && arahBolehDari(12, 19, true)[0] === BAWAH,
  arahBolehDari(12, 19, true));
check('jalan mati memaksa berpatah balik', pilihArahKeSasaran(12, 19, ATAS, { x: 12, y: 0 }, true) === BAWAH,
  pilihArahKeSasaran(12, 19, ATAS, { x: 12, y: 0 }, true));

// Kuizi tidak boleh lalui pintu: arah atas/bawah sahaja tidak wujud untuknya.
check('pintu tidak boleh dilalui Kuizi', arahBolehDari(13, 10, false).length === 2, arahBolehDari(13, 10, false));

// Frightened: pilihan rawak tidak pernah balik bila ada pilihan lain.
let pernahBalik = false;
for (let i = 0; i < 200; i++) {
  const a = pilihArahRawak(6, 5, KANAN, true, () => i / 200);
  if (a === KIRI) pernahBalik = true;
}
check('frightened tidak pernah memilih arah balik di simpang penuh', !pernahBalik);
let sentiasaBalik = true;
for (let i = 0; i < 200; i++) {
  const a = pilihArahRawak(12, 19, ATAS, true, () => i / 200);
  if (a !== BAWAH) sentiasaBalik = false;
}
check('frightened balik hanya bila tiada pilihan lain', sentiasaBalik);

// Keutamaan tatasusunan ikut atas, kiri, bawah, kanan.
check('urutan keutamaan sah', URUT_KEUTAMAAN[0] === ATAS && URUT_KEUTAMAAN[1] === KIRI && URUT_KEUTAMAAN[2] === BAWAH && URUT_KEUTAMAAN[3] === KANAN);

/* ===== Bahagian 7: pemetaan peti soalan ===== */

const p5 = petakanPeti(['q1', 'q2', 'q3', 'q4', 'q5']);
check('5 soalan menghasilkan 5 peti', p5.length === 5, p5.length);
check('peti dipetakan mengikut turutan soalan', p5[0]?.questionId === 'q1' && p5[4]?.questionId === 'q5', p5);

const p2 = petakanPeti(['a', 'b']);
check('kurang soalan: minimum 4 lokasi', p2.length === 4, p2.length);
check('soalan dikitar bila kurang', p2[0]?.questionId === 'a' && p2[1]?.questionId === 'b' && p2[2]?.questionId === 'a' && p2[3]?.questionId === 'b', p2);

check('tiada soalan: tiada peti', petakanPeti([]).length === 0);

/* ===== Rumusan ===== */

console.log('');
console.log('LULUS: ' + pass + '  GAGAL: ' + fail);
if (fail > 0) process.exit(1);
