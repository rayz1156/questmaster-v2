/**
 * Ujian sendiri KZ-047: permainan Pulau Harta Karun (Arena).
 *
 * Jalankan:  npx tsx scripts/selftest-pulau.ts
 *
 * Kenapa fail ini wujud: `npx tsc --noEmit` tidak menyemak logik
 * permainan, dan `npm run build` tidak boleh dijalankan di mesin
 * pembangunan (CTO membina di VPS). Ujian di sini mesti TULEN: tiada
 * pelayar, tiada API, tiada pangkalan data.
 *
 * Semakan wajib (tiket KZ-047 kriteria 5): setiap baris peta sama lebar;
 * setiap lokasi peti dan titik mula boleh dicapai dari titik mula
 * pertama. Ditambah: kabus (jejari pandangan), BFS laluan, pemilihan
 * peti terdekat, peti emas, pengekodan kabus.
 */
import {
  PULAU_PETA,
  getPulauMap,
  titikMulaPulau,
  jubinPeti,
  jubinDi,
  SAIZ_JUBIN,
  JUBIN_BOLEH_LALU,
} from '../src/components/arena/games/pulauPeta';
import {
  JEJARI_PANDANGAN,
  JEJARI_PETUNJUK,
  HAD_SAIZ_KABUS,
  kunciJubin,
  bolehLaluiChar,
  bolehLaluiJubin,
  bolehLaluiPiksel,
  jubinDariPiksel,
  pusatJubin,
  lingkaran,
  laluanBFS,
  bolehTuju,
  senaraiPeti,
  petiTerdekatBelumDibuka,
  semuaDijawab,
  kodKabus,
  nyahkodKabus,
  kunciKabusSesi,
} from '../src/components/arena/games/pulauLogik';
import { isGoldenChest } from '../src/components/arena/games/emas';
import type { GameProps } from '../src/components/arena/games/types';

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

/* ===== Bahagian 1: struktur peta (kriteria tiket 12) ===== */

check('dua pulau tersedia', PULAU_PETA.length === 2, PULAU_PETA.length);
check('nama pulau pertama Pulau Kelapa', PULAU_PETA[0]?.name === 'Pulau Kelapa', PULAU_PETA[0]);
check('nama pulau kedua Pulau Gunung Berapi', PULAU_PETA[1]?.name === 'Pulau Gunung Berapi', PULAU_PETA[1]);

for (const meta of PULAU_PETA) {
  const peta = getPulauMap(meta.id);
  const kumpulan = 'peta ' + peta.id + ': ';
  const tinggi = peta.tiles.length;
  const lebar = new Set(peta.tiles.map((b) => b.length));

  check(kumpulan + 'tinggi 36 baris', tinggi === 36, tinggi);
  check(kumpulan + 'setiap baris sama lebar 48', lebar.size === 1 && lebar.has(48), Array.from(lebar));
  check(kumpulan + 'sekurang-kurangnya 25 lokasi peti', peta.chests.length >= 25, peta.chests.length);
  check(kumpulan + 'sekurang-kurangnya 4 titik mula', peta.starts.length >= 4, peta.starts.length);

  const mulaPertama = peta.starts[0];
  check(kumpulan + 'titik mula pertama wujud', mulaPertama !== undefined, peta.starts);
  if (!mulaPertama) continue;

  const petiTidakLalui = peta.chests.filter((p) => !bolehLaluiJubin(peta, p.x, p.y));
  check(kumpulan + 'semua peti pada jubin boleh dilalui', petiTidakLalui.length === 0, petiTidakLalui);
  const mulaTidakLalui = peta.starts.filter((s) => !bolehLaluiJubin(peta, s.x, s.y));
  check(kumpulan + 'semua titik mula boleh dilalui', mulaTidakLalui.length === 0, mulaTidakLalui);
  check(
    kumpulan + 'harta karun boleh dilalui',
    bolehLaluiJubin(peta, peta.treasure.x, peta.treasure.y),
    peta.treasure,
  );

  // setiap lokasi peti dan titik mula BOLEH DICAPAI dari titik mula pertama
  const capaPeti = peta.chests.filter((p) => laluanBFS(peta, mulaPertama, p) === null);
  check(kumpulan + 'semua peti boleh dicapai dari titik mula pertama', capaPeti.length === 0, capaPeti);
  const capaMula = peta.starts.filter((s) => laluanBFS(peta, mulaPertama, s) === null);
  check(kumpulan + 'semua titik mula boleh dicapai dari titik mula pertama', capaMula.length === 0, capaMula);
  check(
    kumpulan + 'harta karun boleh dicapai dari titik mula pertama',
    laluanBFS(peta, mulaPertama, peta.treasure) !== null,
    peta.treasure,
  );

  // lokasi peti mesti unik, bukan titik mula, bukan harta karun
  const kunciPeti = peta.chests.map((p) => kunciJubin(p.x, p.y));
  check(kumpulan + 'lokasi peti unik', new Set(kunciPeti).size === peta.chests.length, peta.chests.length);
  const kunciMula = new Set(peta.starts.map((s) => kunciJubin(s.x, s.y)));
  check(kumpulan + 'tiada peti atas titik mula', !kunciPeti.some((k) => kunciMula.has(k)), peta.chests);
  check(
    kumpulan + 'tiada peti atas harta karun',
    !kunciPeti.includes(kunciJubin(peta.treasure.x, peta.treasure.y)),
    peta.treasure,
  );

  const mulaTidakTanda = peta.starts.filter((s) => jubinDi(peta, s.x, s.y) !== 'S');
  check(kumpulan + 'setiap titik mula bertanda S pada peta', mulaTidakTanda.length === 0, mulaTidakTanda);

  // ada jubin air dalam (penghalang) dan jubin boleh lalui
  check(
    kumpulan + 'ada air dalam',
    peta.tiles.some((b) => b.includes('~')),
  );
  check(
    kumpulan + 'ada sungai',
    peta.tiles.some((b) => b.includes('-')),
  );
  check(
    kumpulan + 'ada jambatan atas sungai',
    peta.tiles.some((b) => b.includes('=')),
  );
  check(
    kumpulan + 'ada hutan',
    peta.tiles.some((b) => b.includes('t')),
  );
  check(
    kumpulan + 'ada batu',
    peta.tiles.some((b) => b.includes('%')),
  );
  check(
    kumpulan + 'ada gua (lantai c)',
    peta.tiles.some((b) => b.includes('c')),
  );

  // pedalaman sambung menyambung melalui jambatan: satu jubin contoh di
  // setiap kuadran pulau boleh dicapai dari titik mula pertama
  const kuadran = [
    { x: Math.floor(peta.width / 4), y: Math.floor(peta.height / 4) },
    { x: Math.floor((peta.width * 3) / 4), y: Math.floor(peta.height / 4) },
    { x: Math.floor(peta.width / 4), y: Math.floor((peta.height * 3) / 4) },
    { x: Math.floor((peta.width * 3) / 4), y: Math.floor((peta.height * 3) / 4) },
  ];
  const kuadranCapai = kuadran.filter((k) => {
    for (let r = 0; r <= 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = k.x + dx;
          const y = k.y + dy;
          if (!bolehLaluiJubin(peta, x, y)) continue;
          if (laluanBFS(peta, mulaPertama, { x, y }) !== null) return true;
        }
      }
    }
    return false;
  });
  check(kumpulan + 'setiap kuadran pulau boleh dicapai', kuadranCapai.length === 4, kuadranCapai);
}

/* ===== Bahagian 2: aksara jubin boleh lalui ===== */

for (const ch of ['.', ',', 't', '=', 'c', 'S']) {
  check("boleh lalui '" + ch + "'", bolehLaluiChar(ch));
}
for (const ch of ['~', '-', '%', '#']) {
  check("TIDAK boleh lalui '" + ch + "'", !bolehLaluiChar(ch));
}
check('senarai JUBIN_BOLEH_LALU sepadan dengan bolehLaluiChar',
  JUBIN_BOLEH_LALU.every((ch) => bolehLaluiChar(ch)) && bolehLaluiChar('='));
check('luar peta ialah air dalam', jubinDi(getPulauMap('kelapa'), -1, 5) === '~' && jubinDi(getPulauMap('kelapa'), 100, 100) === '~');

/* ===== Bahagian 3: piksel <-> jubin ===== */

const petaK = getPulauMap('kelapa');
check('saiz jubin 32', SAIZ_JUBIN === 32 && petaK.tileSize === 32, SAIZ_JUBIN);
check('pusat jubin (5,7) ialah (176,240)',
  JSON.stringify(pusatJubin(5, 7)) === '{"x":176,"y":240}', pusatJubin(5, 7));
check('jubin dari piksel (176,240) ialah (5,7)',
  JSON.stringify(jubinDariPiksel(176, 240)) === '{"x":5,"y":7}', jubinDariPiksel(176, 240));
const lantai = petaK.starts[0];
if (lantai) {
  check('bolehLaluiPiksel atas titik mula', bolehLaluiPiksel(petaK, pusatJubin(lantai.x, lantai.y).x, pusatJubin(lantai.x, lantai.y).y));
}
check('bolehLaluiPiksel NaN tidak boleh', !bolehLaluiPiksel(petaK, NaN, 5));
check('bolehLaluiPiksel luar peta tidak boleh', !bolehLaluiPiksel(petaK, 5000, 5000));

/* ===== Bahagian 4: kabus (jejari pandangan 4) ===== */

const nampak = lingkaran(10, 10, JEJARI_PANDANGAN);
check('jejari pandangan ialah 4', JEJARI_PANDANGAN === 4, JEJARI_PANDANGAN);
check('lingkaran r4 ada 49 jubin', nampak.length === 49, nampak.length);
check('lingkaran r4 memuatkan (0,0),(±4,0),(±2,±3)',
  nampak.includes(kunciJubin(10, 10)) && nampak.includes(kunciJubin(14, 10))
  && nampak.includes(kunciJubin(12, 13)) && nampak.includes(kunciJubin(8, 7)),
  nampak);
check('lingkaran r4 TIDAK memuatkan (±4,±4) atau (±5,0)',
  !nampak.includes(kunciJubin(14, 14)) && !nampak.includes(kunciJubin(15, 10)),
  nampak);
const petunjuk = lingkaran(10, 10, JEJARI_PETUNJUK);
check('jejari petunjuk ialah 3', JEJARI_PETUNJUK === 3, JEJARI_PETUNJUK);
check('lingkaran r3 ada 29 jubin', petunjuk.length === 29, petunjuk.length);
check('r3 sebenar subset r4', petunjuk.every((k) => nampak.includes(k)));

/* ===== Bahagian 5: BFS laluan (ketik-untuk-berjalan) ===== */

const mula = petaK.starts[0];
const sasaran = petaK.chests[0];
if (mula && sasaran) {
  const laluan = laluanBFS(petaK, mula, sasaran);
  check('laluan BFS ke peti pertama wujud', laluan !== null, laluan);
  if (laluan) {
    check('laluan bermula di titik mula', laluan[0]?.x === mula.x && laluan[0]?.y === mula.y, laluan[0]);
    check('laluan berakhir di sasaran', laluan[laluan.length - 1]?.x === sasaran.x && laluan[laluan.length - 1]?.y === sasaran.y);
    let bersebelahan = laluan.length > 1;
    let semuaLalui = true;
    for (let i = 1; i < laluan.length; i++) {
      const a = laluan[i - 1];
      const b = laluan[i];
      if (!a || !b) continue;
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) bersebelahan = false;
      if (!bolehLaluiJubin(petaK, b.x, b.y)) semuaLalui = false;
    }
    check('setiap langkah BFS bersebelahan (4 arah)', bersebelahan);
    check('setiap jubin laluan boleh dilalui', semuaLalui);
  }
  check('laluan ke diri sendiri ialah satu jubin', (laluanBFS(petaK, mula, mula)?.length ?? 0) === 1);
}
check('laluan ke air dalam ialah null', laluanBFS(petaK, { x: 0, y: 0 }, { x: 1, y: 1 }) === null);
check('laluan dari air dalam ialah null', laluanBFS(petaK, { x: 0, y: 0 }, mula ?? { x: 1, y: 1 }) === null);
{
  // dua poket dipisah dinding batu: kedua hujung boleh lalui tetapi tiada laluan
  const petaDinding: typeof petaK = {
    ...petaK,
    width: 5,
    height: 3,
    tiles: [',,%,,', ',.%,c,', ',,%,,'],
  };
  check(
    'poket terasing: tiada laluan merentasi dinding',
    laluanBFS(petaDinding, { x: 1, y: 1 }, { x: 3, y: 1 }) === null,
  );
  check(
    'poket sendiri: laluan pendek wujud',
    laluanBFS(petaDinding, { x: 3, y: 1 }, { x: 3, y: 2 }) !== null,
  );
  check(
    'sasaran batu tidak boleh dicapai',
    laluanBFS(petaDinding, { x: 1, y: 1 }, { x: 2, y: 1 }) === null,
  );
}

/* ===== Bahagian 6: sasaran ketik hanya kawasan diterokai ===== */

const diterokai = new Set<string>(['2,2', '3,2', '2,3']);
check('bolehTuju: jubin diterokai dibenarkan', bolehTuju(diterokai, 2, 2));
check('bolehTuju: bersebelahan diterokai dibenarkan', bolehTuju(diterokai, 4, 2) && bolehTuju(diterokai, 2, 4) && bolehTuju(diterokai, 1, 2));
check('bolehTuju: jauh dari kawasan diterokai ditolak', !bolehTuju(diterokai, 20, 20) && !bolehTuju(diterokai, 5, 6));

/* ===== Bahagian 7: peti, emas, terdekat ===== */

const soalanDemo: GameProps['questions'] = [
  { id: 'q1', order_idx: 0, answered: false, locked: false },
  { id: 'q2', order_idx: 1, answered: false, locked: false },
  { id: 'q3', order_idx: 2, answered: false, locked: true },
  { id: 'q4', order_idx: 3, answered: false, locked: false },
  { id: 'q5', order_idx: 4, answered: true, locked: false },
  { id: 'q6', order_idx: 5, answered: true, locked: false },
  { id: 'q7', order_idx: 6, answered: false, locked: false },
  { id: 'q8', order_idx: 7, answered: false, locked: false },
];
const sesi = 'sesi-demo';
const peti = senaraiPeti(petaK, soalanDemo, sesi);
check('8 peti untuk 8 soalan', peti.length === 8, peti.length);
check('peti mengikut order_idx: q3 pada jubin chests[2]',
  JSON.stringify(peti[2]) !== undefined && peti[2]?.x === petaK.chests[2]?.x && peti[2]?.y === petaK.chests[2]?.y);
check('dijawab/berkunci disalin dari soalan',
  peti[4]?.dijawab === true && peti[2]?.berkunci === true && peti[0]?.dijawab === false && peti[0]?.berkunci === false);
{
  let emasBetul = true;
  for (const p of peti) {
    if (p.emas !== isGoldenChest(sesi, p.questionId)) emasBetul = false;
  }
  check('emas peti mengikut isGoldenChest (sesi sama)', emasBetul);
  const bilEmas = peti.filter((p) => p.emas).length;
  check('ada peti emas dan peti biasa dalam 8 soalan', bilEmas > 0 && bilEmas < peti.length, bilEmas);
}

// pemilihan peti terdekat belum dibuka
{
  const depan = peti[0];
  if (depan) {
    const jauh = peti.slice(1).sort((a, b) => ((b.x - depan.x) ** 2 + (b.y - depan.y) ** 2) * -1)[0];
    const terdekat = petiTerdekatBelumDibuka(peti, { x: depan.x, y: depan.y });
    check('peti terdekat belum dibuka ialah diri sendiri jika belum dijawab', terdekat === depan, [depan, terdekat]);
    if (jauh) {
      const terdekatDariJauh = petiTerdekatBelumDibuka(peti, { x: jauh.x, y: jauh.y });
      check('peti terdekat dari jubin peti ialah diri sendiri', terdekatDariJauh === jauh, [jauh, terdekatDariJauh]);
    }
  }
  const petiDijawab = peti.map((p) => ({ ...p, dijawab: true }));
  check('semua dijawab: tiada peti terdekat', petiTerdekatBelumDibuka(petiDijawab, { x: 0, y: 0 }) === null);
  const tiadaSoalan: GameProps['questions'] = [];
  check('tiada soalan: tiada peti terdekat', petiTerdekatBelumDibuka(senaraiPeti(petaK, tiadaSoalan, sesi), { x: 0, y: 0 }) === null);
}
check('semuaDijawab: senarai kosong tidak', !semuaDijawab([]));
check('semuaDijawab: belum semua tidak', !semuaDijawab(soalanDemo));
check('semuaDijawab: semua dijawab ya', semuaDijawab(soalanDemo.map((q) => ({ ...q, answered: true }))));

// jubinPeti: order_idx melilit (mod), termasuk negatif dan lebih besar
{
  const n = petaK.chests.length;
  check('jubinPeti order_idx melilit mod', JSON.stringify(jubinPeti(petaK, n)) === JSON.stringify(petaK.chests[0]));
  check('jubinPeti order_idx besar melilit', JSON.stringify(jubinPeti(petaK, n + 3)) === JSON.stringify(petaK.chests[3]));
  check('jubinPeti order_idx negatif melilit', JSON.stringify(jubinPeti(petaK, -1)) === JSON.stringify(petaK.chests[n - 1]));
}
check('titikMulaPulau melilit dan memberi pusat piksel', (() => {
  const t = titikMulaPulau(petaK, petaK.starts.length + 2);
  const jangka = petaK.starts[2];
  return jangka !== undefined && t.x === (jangka.x + 0.5) * SAIZ_JUBIN && t.y === (jangka.y + 0.5) * SAIZ_JUBIN;
})());

/* ===== Bahagian 8: peti emas (vektor keras, djb2 bebas) ===== */

function djb2Bebas(s: string): number {
  // pelaksanaan bebas dalam ujian; mesti sama keputusan dengan emas.ts
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
check('isGoldenChest deterministik', isGoldenChest(sesi, 'q1') === isGoldenChest(sesi, 'q1'));
{
  // sesi MESTI mempengaruhi keputusan (bukan soalan sahaja)
  let adaPerbezaan = false;
  for (let i = 0; i < 30 && !adaPerbezaan; i++) {
    if (isGoldenChest('sesi-' + i, 'q2') !== isGoldenChest('sesi-demo', 'q2')) adaPerbezaan = true;
  }
  check('isGoldenChest dipengaruhi oleh sesi', adaPerbezaan);
}
// vektor keras dikira dengan node di luar (djb2 bebas), disemak semula di sini
check('vektor keras: sesi-demo/q2 EMAS (h=405816808)', isGoldenChest('sesi-demo', 'q2') === true && djb2Bebas('sesi-demo:q2') === 405816808, djb2Bebas('sesi-demo:q2'));
check('vektor keras: sesi-demo/q1 biasa (h=405816807)', isGoldenChest('sesi-demo', 'q1') === false && djb2Bebas('sesi-demo:q1') === 405816807, djb2Bebas('sesi-demo:q1'));
check('vektor keras: abc/def EMAS (h=441134804)', isGoldenChest('abc', 'def') === true && djb2Bebas('abc:def') === 441134804, djb2Bebas('abc:def'));
check('vektor keras: ABC123/soalan-999 biasa (h=2896616689)', isGoldenChest('ABC123', 'soalan-999') === false && djb2Bebas('ABC123:soalan-999') === 2896616689, djb2Bebas('ABC123:soalan-999'));
{
  let sepadan = true;
  for (let i = 0; i < 60; i++) {
    const s = 'sesi-' + i;
    for (let j = 0; j < 10; j++) {
      const q = 'soalan-' + j;
      if (isGoldenChest(s, q) !== (djb2Bebas(s + ':' + q) % 4 === 0)) sepadan = false;
    }
  }
  check('isGoldenChest sama dengan djb2 % 4 pada 600 pasangan', sepadan);
  let bilEmas = 0;
  for (let i = 0; i < 100; i++) if (isGoldenChest('sesi-hitung', 'q' + i)) bilEmas++;
  check('taburan emas munasabah (10-40 daripada 100)', bilEmas >= 10 && bilEmas <= 40, bilEmas);
}

/* ===== Bahagian 9: simpanan kabus ===== */

{
  const setKabus = new Set<string>(['3,4', '5,6', '1,1']);
  const kod = kodKabus(petaK, setKabus);
  check('kodKabus di bawah had saiz', kod.length <= HAD_SAIZ_KABUS && HAD_SAIZ_KABUS === 8192, kod.length);
  const balik = nyahkodKabus(petaK, kod);
  check('nyahkodKabus bulat-balik', balik !== null && balik.size === setKabus.size && Array.from(setKabus).every((k) => balik.has(k)), kod);
  check('nyahkodKabus rentetan kosong ialah null', nyahkodKabus(petaK, '') === null);
  check('nyahkodKabus lebih tinggi dari peta ialah null', nyahkodKabus(petaK, '0/' + '0') === null);
  check('nyahkodKabus baris pendek ialah null', nyahkodKabus(petaK, '0'.repeat(10) + '/' + '0'.repeat(petaK.height - 1)) === null);
  check('nyahkodKabus aksara rosak ialah null', nyahkodKabus(petaK, 'x'.repeat(48) + '/' + '0'.repeat(48).repeat(petaK.height - 1).replace(/(.{48})/g, '$1/')) === null);
  const besar = '0'.repeat(HAD_SAIZ_KABUS + 10);
  check('nyahkodKabus lebih besar dari had ialah null', nyahkodKabus(petaK, besar) === null, besar.length);
  check('kunci kabus mengikut format kz-pulau:kod:id',
    kunciKabusSesi('ABC123', 'p-1') === 'kz-pulau:ABC123:p-1', kunciKabusSesi('ABC123', 'p-1'));
  // saiz kod sebenar untuk peta penuh diterokai
  const semua = new Set<string>();
  for (let y = 0; y < petaK.height; y++) for (let x = 0; x < petaK.width; x++) semua.add(kunciJubin(x, y));
  check('kod kabus penuh masih di bawah had', kodKabus(petaK, semua).length <= HAD_SAIZ_KABUS, kodKabus(petaK, semua).length);
}

/* ===== Bahagian 10: getPulauMap ===== */

check('getPulauMap lalai kelapa', getPulauMap(undefined).id === 'kelapa');
check('getPulauMap berapi', getPulauMap('berapi').id === 'berapi');
check('getPulauMap tidak dikenali kembali kelapa', getPulauMap('tidak-wujud').id === 'kelapa');

/* ===== Rumusan ===== */

console.log('');
console.log('LULUS=' + pass + ' GAGAL=' + fail);
if (fail > 0) process.exit(1);