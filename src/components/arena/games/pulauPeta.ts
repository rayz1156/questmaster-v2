/**
 * Kuizen Arena, KZ-047: peta pulau untuk permainan Pulau Harta Karun.
 *
 * Dua pulau 48x36 direka sendiri: "Pulau Kelapa" (gua di timur laut)
 * dan "Pulau Gunung Berapi" (kawah di tengah). Dibina secara prosedur
 * ikut corak src/lib/arena/maps.ts supaya setiap baris dijamin sama
 * lebar. TULEN: tiada DOM, selamat diimport di mana-mana.
 *
 * Aksara jubin (set ini MILIK permainan pulau, berbeza sedikit daripada
 * peta kampus/pulau Arena yang lama):
 *   '~' air dalam   TIDAK boleh dilalui
 *   '-' sungai      TIDAK boleh dilalui (lintas melalui jambatan)
 *   '%' batu        TIDAK boleh dilalui (tebing/karang/dinding gua)
 *   '.' pantai      boleh lalui
 *   ',' rumput      boleh lalui
 *   't' hutan       boleh lalui (rimba)
 *   '=' jambatan     boleh lalui
 *   'c' gua         boleh lalui (lantai gua/kawah)
 *   'S' titik mula  boleh lalui
 *
 * `starts` dan `chests` dalam unit jubin; `treasure` ialah lokasi tetap
 * harta karun akhir (pusat gua atau puncak bukit), juga unit jubin.
 */

export interface PulauMapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  /** Baris strings, setiap satu `width` aksara. */
  tiles: string[];
  /** Titik mula (jubin), MINIMA 4. */
  starts: { x: number; y: number }[];
  /** Lokasi peti (jubin), MINIMA 25, semuanya boleh dicapai. */
  chests: { x: number; y: number }[];
  /** Lokasi tetap harta karun akhir (jubin). */
  treasure: { x: number; y: number };
}

export const SAIZ_JUBIN = 32;

const W = 48;
const H = 36;

/** Jubin yang boleh dilalui (kekal selaras dengan pulauLogik.BOLEH_LALU). */
export const JUBIN_BOLEH_LALU = ['.', ',', 't', '=', 'c', 'S'] as const;

type Grid = string[][];

function makeGrid(fill: string): Grid {
  const g: Grid = [];
  for (let y = 0; y < H; y++) {
    const row: string[] = [];
    for (let x = 0; x < W; x++) row.push(fill);
    g.push(row);
  }
  return g;
}

function getT(g: Grid, x: number, y: number): string {
  const row = g[y];
  if (!row || x < 0 || x >= W) return '~';
  return row[x] ?? '~';
}

function setT(g: Grid, x: number, y: number, ch: string): void {
  const row = g[y];
  if (!row || x < 0 || x >= W) return;
  row[x] = ch;
}

function fillRect(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setT(g, x, y, ch);
}

/** Tulis hanya atas jubin daratan (pantai/rumput), tidak atas air/batu. */
function fillLand(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = getT(g, x, y);
      if (c === ',' || c === '.') setT(g, x, y, ch);
    }
  }
}

/** Pulau bujur dengan garis pantai beralun (param sama gaya maps.ts). */
function pulauBujur(g: Grid, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const base = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      const d = base * (1 + 0.06 * Math.sin(x * 0.9) + 0.05 * Math.cos(y * 1.3));
      if (d <= 0.58) setT(g, x, y, ',');
      else if (d <= 1) setT(g, x, y, '.');
    }
  }
}

/** Sungai melintasi pulau pada baris y0..y1; jambatan pada lajur x0..x1. */
function sungai(g: Grid, y0: number, y1: number, jambatan: [number, number][]): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < W; x++) {
      const c = getT(g, x, y);
      if (c === ',' || c === '.' || c === 't') setT(g, x, y, '-');
    }
  }
  for (const [xa, xb] of jambatan) fillRect(g, xa, y0, xb, y1, '=');
}

/** Hutan: tukar rumput kepada rimba dalam petak. */
function hutan(g: Grid, x0: number, y0: number, x1: number, y1: number): void {
  fillLand(g, x0, y0, x1, y1, 't');
}

/** Batu berselerak di atas rumput/pantai. */
function batu(g: Grid, senarai: [number, number][]): void {
  for (const [x, y] of senarai) {
    const c = getT(g, x, y);
    if (c === ',' || c === '.') setT(g, x, y, '%');
  }
}

/** Gua: dinding batu keliling, lantai gua dalam, pintu di dinding. */
function gua(g: Grid, x0: number, y0: number, x1: number, y1: number, pintu: [number, number][]): void {
  fillRect(g, x0, y0, x1, y1, '%');
  fillRect(g, x0 + 1, y0 + 1, x1 - 1, y1 - 1, 'c');
  for (const [px, py] of pintu) setT(g, px, py, '.');
}

/** Kawah gunung berapi: rim batu, lantai kawah, pintu di rim. */
function kawah(g: Grid, cx: number, cy: number, rx: number, ry: number, pintu: [number, number][]): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1) setT(g, x, y, d <= 0.6 ? 'c' : '%');
    }
  }
  for (const [px, py] of pintu) setT(g, px, py, '.');
}

// ---------------------------------------------------- pembantu pengesahan

function bolehLalu(ch: string): boolean {
  return (JUBIN_BOLEH_LALU as readonly string[]).includes(ch);
}

/** Jubin boleh capai (BFS 4 arah) dari satu titik mula. Kunci "x,y". */
function capaiDari(g: Grid, mula: { x: number; y: number }): Set<string> {
  const seen = new Set<string>();
  if (!bolehLalu(getT(g, mula.x, mula.y))) return seen;
  const queue: { x: number; y: number }[] = [mula];
  seen.add(mula.x + ',' + mula.y);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) break;
    const nb: [number, number][] = [[cur.x + 1, cur.y], [cur.x - 1, cur.y], [cur.x, cur.y + 1], [cur.x, cur.y - 1]];
    for (const [nx, ny] of nb) {
      const k = nx + ',' + ny;
      if (seen.has(k) || !bolehLalu(getT(g, nx, ny))) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

/** Pindahkan calon ke jubin boleh lalai terdekat yang belum digunakan. */
function sentuhCalon(
  g: Grid,
  calon: [number, number][],
  larangan: Set<string>,
): { x: number; y: number }[] {
  const boleh = (x: number, y: number): boolean => {
    const k = x + ',' + y;
    return !larangan.has(k) && bolehLalu(getT(g, x, y)) && getT(g, x, y) !== 'S';
  };
  const keluar: { x: number; y: number }[] = [];
  for (const [cx, cy] of calon) {
    let jumpa = false;
    // gelung ring demi ring supaya keputusan stabil dan deterministik
    for (let r = 0; r <= 8 && !jumpa; r++) {
      for (let dy = -r; dy <= r && !jumpa; dy++) {
        for (let dx = -r; dx <= r && !jumpa; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (boleh(cx + dx, cy + dy)) {
            larangan.add((cx + dx) + ',' + (cy + dy));
            keluar.push({ x: cx + dx, y: cy + dy });
            jumpa = true;
          }
        }
      }
    }
  }
  return keluar;
}

/** Tanda jubin mula sebagai 'S' atas peta. */
function tandaMula(g: Grid, starts: { x: number; y: number }[]): void {
  for (const s of starts) setT(g, s.x, s.y, 'S');
}

// ---------------------------------------------------------- Pulau Kelapa

function binaKelapa(): Grid {
  const g = makeGrid('~');
  pulauBujur(g, 23.5, 17.5, 21, 14);
  sungai(g, 17, 18, [[12, 13], [24, 25], [36, 37]]);
  gua(g, 30, 7, 36, 12, [[30, 9], [36, 10]]);
  hutan(g, 15, 6, 21, 12);
  hutan(g, 7, 21, 13, 26);
  hutan(g, 28, 21, 35, 26);
  hutan(g, 8, 8, 14, 13);
  batu(g, [[5, 12], [20, 30], [27, 31], [31, 13], [42, 20], [26, 29], [15, 28], [44, 14], [19, 14], [35, 16]]);
  return g;
}

const KELAPA_MULA: [number, number][] = [[23, 4], [40, 17], [17, 29], [6, 17]];
const KELAPA_PETI: [number, number][] = [
  [9, 9], [14, 13], [20, 8], [26, 6], [29, 13], [37, 15], [41, 20], [38, 25],
  [33, 28], [27, 30], [20, 30], [14, 27], [9, 23], [6, 13], [18, 20], [25, 15],
  [28, 19], [23, 22], [17, 24], [11, 19], [35, 21], [31, 24], [24, 27], [15, 15],
  [21, 12], [26, 10], [32, 10], [12, 22], [19, 26], [30, 14],
];

// --------------------------------------------------- Pulau Gunung Berapi

function binaBerapi(): Grid {
  const g = makeGrid('~');
  pulauBujur(g, 23.5, 17.5, 21, 14);
  kawah(g, 23.5, 16.5, 7, 6, [[23, 22]]);
  sungai(g, 26, 27, [[12, 13], [23, 24], [34, 35]]);
  hutan(g, 5, 8, 12, 14);
  hutan(g, 32, 6, 39, 12);
  hutan(g, 6, 21, 12, 25);
  hutan(g, 33, 20, 39, 24);
  batu(g, [[16, 9], [30, 10], [18, 24], [28, 28], [41, 15], [36, 29], [9, 29], [44, 21], [13, 7], [39, 27]]);
  return g;
}

const BERAPI_MULA: [number, number][] = [[23, 4], [41, 18], [20, 30], [5, 17]];
const BERAPI_PETI: [number, number][] = [
  [8, 10], [13, 14], [18, 9], [24, 6], [30, 8], [36, 12], [41, 17], [39, 23],
  [34, 27], [28, 30], [21, 29], [15, 28], [10, 24], [6, 17], [16, 19], [26, 21],
  [30, 18], [28, 25], [21, 24], [14, 22], [33, 21], [38, 28], [25, 12], [18, 13],
  [31, 25], [11, 18], [23, 29], [35, 17], [27, 24], [9, 27],
];

// ------------------------------------------------------------- pembinaan

function binaPulau(
  id: string,
  name: string,
  g: Grid,
  calonMula: [number, number][],
  calonPeti: [number, number][],
  treasure: { x: number; y: number },
): PulauMapDef {
  const larangan = new Set<string>([treasure.x + ',' + treasure.y]);
  const starts = sentuhCalon(g, calonMula, larangan);
  const mulaPertama = starts[0];
  if (!mulaPertama) throw new Error(id + ': tiada titik mula');
  if (starts.length < 4) throw new Error(id + ': kurang titik mula');
  tandaMula(g, starts);
  // kebolehcapaian diukur dari titik mula PERTAMA (seperti kriteria ujian)
  const capai = capaiDari(g, mulaPertama);
  const petiOk: { x: number; y: number }[] = [];
  const diguna = new Set<string>(larangan);
  for (const calon of calonPeti) {
    // calon peti mesti berada pada jubin boleh capai dari titik mula pertama
    let jumpa = false;
    for (let r = 0; r <= 8 && !jumpa; r++) {
      for (let dy = -r; dy <= r && !jumpa; dy++) {
        for (let dx = -r; dx <= r && !jumpa; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = calon[0] + dx;
          const y = calon[1] + dy;
          const k = x + ',' + y;
          if (diguna.has(k) || !capai.has(k) || getT(g, x, y) === 'S') continue;
          diguna.add(k);
          petiOk.push({ x, y });
          jumpa = true;
        }
      }
    }
  }
  if (petiOk.length < 25) throw new Error(id + ': kurang lokasi peti (dapat ' + petiOk.length + ')');
  if (!capai.has(treasure.x + ',' + treasure.y)) throw new Error(id + ': harta karun tidak boleh dicapai');
  return {
    id,
    name,
    width: W,
    height: H,
    tileSize: SAIZ_JUBIN,
    tiles: g.map((row) => row.join('')),
    starts,
    chests: petiOk,
    treasure,
  };
}

const PULAU_KELAPA: PulauMapDef = binaPulau(
  'kelapa', 'Pulau Kelapa', binaKelapa(), KELAPA_MULA, KELAPA_PETI, { x: 33, y: 9 },
);
const PULAU_BERAPI: PulauMapDef = binaPulau(
  'berapi', 'Pulau Gunung Berapi', binaBerapi(), BERAPI_MULA, BERAPI_PETI, { x: 23, y: 16 },
);

/** Senarai pulau untuk butang pilih (urutan stabil). */
export const PULAU_PETA: { id: string; name: string }[] = [
  { id: PULAU_KELAPA.id, name: PULAU_KELAPA.name },
  { id: PULAU_BERAPI.id, name: PULAU_BERAPI.name },
];

export function getPulauMap(mapId?: string): PulauMapDef {
  return mapId === PULAU_BERAPI.id ? PULAU_BERAPI : PULAU_KELAPA;
}

/** Jubin titik mula ke-(index mod n) dalam piksel (pusat jubin). */
export function titikMulaPulau(peta: PulauMapDef, index: number): { x: number; y: number } {
  const n = peta.starts.length;
  const i = ((Math.floor(index) % n) + n) % n;
  const t = peta.starts[i] ?? peta.starts[0];
  return { x: (t.x + 0.5) * peta.tileSize, y: (t.y + 0.5) * peta.tileSize };
}

/** Lokasi peti soalan ke-order_idx (chests[order_idx mod n]) dalam jubin. */
export function jubinPeti(peta: PulauMapDef, orderIdx: number): { x: number; y: number } {
  const n = peta.chests.length;
  const i = ((Math.floor(orderIdx) % n) + n) % n;
  return peta.chests[i] ?? peta.chests[0];
}

/** Aksara jubin pada koordinat jubin (luar peta = air dalam). */
export function jubinDi(peta: PulauMapDef, tx: number, ty: number): string {
  if (tx < 0 || ty < 0 || tx >= peta.width || ty >= peta.height) return '~';
  const row = peta.tiles[ty];
  if (row === undefined) return '~';
  return row.charAt(tx) || '~';
}