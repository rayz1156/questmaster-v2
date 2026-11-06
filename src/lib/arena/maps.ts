/**
 * Kuizen Arena: peta 2D (dilukis secara prosedur, tiada aset luar).
 * Aksara jubin: '#' dinding, '.' lantai, ',' rumput, '~' air, 'T' pokok,
 * '=' laluan, 'S' titik mula. questionSpots dalam unit jubin.
 * Selamat diimport di pelayan dan klien (tiada DOM).
 */

export interface ArenaMapDef {
  id: string;
  name: string;
  tileSize: number;
  width: number;
  height: number;
  tiles: string[];
  questionSpots: { x: number; y: number }[];
}

export const ARENA_MAPS: { id: string; name: string }[] = [
  { id: 'kampus', name: 'Kampus Sekolah' },
  { id: 'pulau', name: 'Pulau Misteri' },
];

const TILE = 32;
const W = 40;
const H = 28;
const WALKABLE = new Set<string>(['.', ',', '=', 'S']);

export function isWalkableChar(ch: string): boolean {
  return WALKABLE.has(ch);
}

// ---------------------------------------------------------------- pembina grid

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

function getTile(g: Grid, x: number, y: number): string {
  const row = g[y];
  if (!row || x < 0 || x >= W) return '#';
  return row[x] ?? '#';
}

function setTile(g: Grid, x: number, y: number, ch: string): void {
  const row = g[y];
  if (!row || x < 0 || x >= W) return;
  row[x] = ch;
}

function fillRect(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setTile(g, x, y, ch);
}

/** Tulis hanya atas jubin daratan (rumput/lantai). */
function fillLand(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = getTile(g, x, y);
      if (c === ',' || c === '.') setTile(g, x, y, ch);
    }
  }
}

/** Bangunan: dinding keliling, lantai dalam, pintu (lantai) pada dinding. */
function building(g: Grid, x0: number, y0: number, x1: number, y1: number, doors: [number, number][]): void {
  fillRect(g, x0, y0, x1, y1, '#');
  fillRect(g, x0 + 1, y0 + 1, x1 - 1, y1 - 1, '.');
  for (const [dx, dy] of doors) setTile(g, dx, dy, '.');
}

function plantTrees(g: Grid, list: [number, number][]): void {
  for (const [x, y] of list) if (getTile(g, x, y) === ',') setTile(g, x, y, 'T');
}

// ---------------------------------------------------------------- peta: Kampus Sekolah

function buildKampus(): Grid {
  const g = makeGrid(',');
  // sempadan
  fillRect(g, 0, 0, W - 1, 0, '#');
  fillRect(g, 0, H - 1, W - 1, H - 1, '#');
  fillRect(g, 0, 0, 0, H - 1, '#');
  fillRect(g, W - 1, 0, W - 1, H - 1, '#');
  // laluan utama
  fillRect(g, 1, 13, W - 2, 14, '=');
  fillRect(g, 19, 1, 20, H - 2, '=');
  // dataran tengah
  fillRect(g, 15, 3, 24, 11, '.');
  // Blok Akademik (2 kelas, sekatan berpintu)
  building(g, 2, 2, 13, 9, [[7, 9], [13, 6]]);
  fillRect(g, 8, 3, 8, 8, '#');
  setTile(g, 8, 5, '.');
  fillRect(g, 7, 10, 7, 12, '=');
  setTile(g, 14, 6, '=');
  // Perpustakaan (rak buku)
  building(g, 26, 2, 37, 9, [[31, 9], [26, 6]]);
  fillRect(g, 28, 4, 30, 4, '#');
  fillRect(g, 33, 4, 35, 4, '#');
  fillRect(g, 28, 7, 30, 7, '#');
  fillRect(g, 33, 7, 35, 7, '#');
  fillRect(g, 31, 10, 31, 12, '=');
  setTile(g, 25, 6, '=');
  // Kantin (meja)
  building(g, 2, 18, 12, 25, [[7, 18], [12, 22]]);
  setTile(g, 5, 21, '#');
  setTile(g, 9, 21, '#');
  fillRect(g, 7, 15, 7, 17, '=');
  fillRect(g, 13, 22, 18, 22, '=');
  // kolam
  fillRect(g, 14, 17, 17, 19, '~');
  // padang dengan trek larian
  fillRect(g, 24, 17, 36, 17, '=');
  fillRect(g, 24, 24, 36, 24, '=');
  fillRect(g, 24, 17, 24, 24, '=');
  fillRect(g, 36, 17, 36, 24, '=');
  fillRect(g, 21, 20, 23, 20, '=');
  plantTrees(g, [
    [1, 11], [4, 11], [10, 11], [13, 11], [26, 11], [34, 11], [38, 11],
    [13, 16], [17, 24], [22, 24], [22, 16], [38, 16], [38, 25], [23, 26], [37, 26],
    [1, 26], [14, 26], [16, 1], [24, 1], [1, 16],
  ]);
  // titik mula
  for (const [x, y] of [[17, 12], [18, 12], [21, 12], [22, 12], [17, 15], [22, 15]] as [number, number][]) setTile(g, x, y, 'S');
  return g;
}

const KAMPUS_SPOTS: [number, number][] = [
  [4, 4], [11, 4], [5, 7], [11, 7],
  [16, 4], [23, 4], [16, 10], [23, 10],
  [28, 3], [35, 3], [28, 8], [35, 8], [31, 5],
  [4, 20], [10, 20], [4, 23], [10, 23],
  [26, 19], [34, 19], [26, 22], [34, 22], [30, 21],
  [3, 15], [12, 15], [15, 24], [36, 12], [25, 2], [16, 2],
];

// ---------------------------------------------------------------- peta: Pulau Misteri

function buildPulau(): Grid {
  const g = makeGrid('~');
  const cx = 19.5;
  const cy = 13.5;
  // pulau bujur dengan pantai berpasir dan garis pantai beralun
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const base = ((x - cx) / 18) ** 2 + ((y - cy) / 12.2) ** 2;
      const d = base * (1 + 0.06 * Math.sin(x * 0.9) + 0.05 * Math.cos(y * 1.3));
      if (d <= 0.74) setTile(g, x, y, ',');
      else if (d <= 1) setTile(g, x, y, '.');
    }
  }
  // tasik dalam
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (((x - 27) / 2.5) ** 2 + ((y - 9) / 1.8) ** 2 <= 1) setTile(g, x, y, '~');
    }
  }
  // kuil lama (runtuhan)
  building(g, 7, 17, 12, 21, [[9, 17], [12, 19]]);
  // laluan
  fillLand(g, 2, 14, 37, 14, '=');
  fillLand(g, 19, 1, 19, 26, '=');
  fillLand(g, 8, 7, 19, 7, '=');
  fillLand(g, 8, 7, 8, 13, '=');
  fillLand(g, 20, 21, 32, 21, '=');
  fillLand(g, 32, 15, 32, 21, '=');
  fillLand(g, 9, 15, 9, 16, '=');
  // batu
  for (const [x, y] of [[14, 5], [25, 19], [30, 16], [5, 10]] as [number, number][]) {
    if (getTile(g, x, y) === ',') setTile(g, x, y, '#');
  }
  plantTrees(g, [
    [10, 5], [12, 4], [13, 9], [6, 11], [5, 16], [15, 19], [16, 22], [23, 18],
    [24, 23], [29, 19], [30, 23], [33, 12], [34, 9], [22, 5], [25, 4], [28, 13],
    [15, 11], [11, 12], [22, 10], [14, 16], [27, 17], [35, 17], [17, 4], [11, 23],
  ]);
  // titik mula
  for (const [x, y] of [[18, 13], [20, 13], [18, 15], [20, 15]] as [number, number][]) setTile(g, x, y, 'S');
  return g;
}

const PULAU_SPOTS: [number, number][] = [
  [5, 12], [10, 8], [12, 5], [16, 3], [23, 3], [28, 5], [32, 8], [35, 12],
  [34, 17], [30, 22], [25, 24], [19, 25], [13, 24], [10, 19], [4, 16], [14, 13],
  [24, 13], [19, 9], [21, 19], [27, 12], [23, 8], [16, 17], [28, 16], [11, 10],
];

// ---------------------------------------------------------------- pengesahan titik soalan

/** Jubin yang boleh dicapai dari titik mula (BFS 4 arah). */
function reachable(g: Grid): Set<number> {
  const seen = new Set<number>();
  const queue: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (getTile(g, x, y) === 'S') {
        seen.add(y * W + x);
        queue.push(y * W + x);
      }
    }
  }
  while (queue.length > 0) {
    const k = queue.shift();
    if (k === undefined) break;
    const x = k % W;
    const y = Math.floor(k / W);
    const nb: [number, number][] = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = ny * W + nx;
      if (seen.has(nk) || !WALKABLE.has(getTile(g, nx, ny))) continue;
      seen.add(nk);
      queue.push(nk);
    }
  }
  return seen;
}

/** Pindahkan setiap calon ke jubin boleh dicapai terdekat (bukan 'S', tidak berulang). */
function snapSpots(g: Grid, candidates: [number, number][]): { x: number; y: number }[] {
  const ok = reachable(g);
  const used = new Set<number>();
  const out: { x: number; y: number }[] = [];
  const good = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const k = y * W + x;
    return ok.has(k) && !used.has(k) && getTile(g, x, y) !== 'S';
  };
  for (const [cx, cy] of candidates) {
    let found = false;
    for (let r = 0; r <= 6 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (good(cx + dx, cy + dy)) {
            used.add((cy + dy) * W + (cx + dx));
            out.push({ x: cx + dx, y: cy + dy });
            found = true;
          }
        }
      }
    }
  }
  // sandaran: pastikan sekurang-kurangnya 20 titik
  for (let y = 2; y < H && out.length < 20; y += 4) {
    for (let x = 2; x < W && out.length < 20; x += 5) {
      if (good(x, y)) {
        used.add(y * W + x);
        out.push({ x, y });
      }
    }
  }
  return out;
}

function finalize(id: string, name: string, g: Grid, candidates: [number, number][]): ArenaMapDef {
  return {
    id,
    name,
    tileSize: TILE,
    width: W,
    height: H,
    tiles: g.map((row) => row.join('')),
    questionSpots: snapSpots(g, candidates),
  };
}

const KAMPUS: ArenaMapDef = finalize('kampus', 'Kampus Sekolah', buildKampus(), KAMPUS_SPOTS);
const PULAU: ArenaMapDef = finalize('pulau', 'Pulau Misteri', buildPulau(), PULAU_SPOTS);

// ---------------------------------------------------------------- API awam

export function getMap(id: string): ArenaMapDef {
  return id === 'pulau' ? PULAU : KAMPUS;
}

/** Aksara jubin pada koordinat jubin (luar peta = dinding). */
export function tileAt(map: ArenaMapDef, tx: number, ty: number): string {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return '#';
  const row = map.tiles[ty];
  if (row === undefined) return '#';
  return row.charAt(tx) || '#';
}

/** Boleh dipijak pada koordinat piksel? */
export function isWalkable(map: ArenaMapDef, px: number, py: number): boolean {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
  return WALKABLE.has(tileAt(map, Math.floor(px / map.tileSize), Math.floor(py / map.tileSize)));
}

const spawnCache = new WeakMap<ArenaMapDef, { x: number; y: number }[]>();

function spawnTiles(map: ArenaMapDef): { x: number; y: number }[] {
  const cached = spawnCache.get(map);
  if (cached) return cached;
  const list: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) if (tileAt(map, x, y) === 'S') list.push({ x, y });
  }
  spawnCache.set(map, list);
  return list;
}

/** Pusat piksel bagi jubin mula ke-(index % n). */
export function spawnPoint(map: ArenaMapDef, index: number): { x: number; y: number } {
  const list = spawnTiles(map);
  const centre = { x: (map.width * map.tileSize) / 2, y: (map.height * map.tileSize) / 2 };
  const n = list.length;
  if (n === 0 || !Number.isFinite(index)) return centre;
  const i = ((Math.floor(index) % n) + n) % n;
  const t = list[i];
  if (!t) return centre;
  return { x: (t.x + 0.5) * map.tileSize, y: (t.y + 0.5) * map.tileSize };
}

/** Pusat piksel objek soalan ke-orderIdx (questionSpots[orderIdx % n]). */
export function questionSpotPixel(map: ArenaMapDef, orderIdx: number): { x: number; y: number } {
  const n = map.questionSpots.length;
  if (n === 0) return spawnPoint(map, 0);
  const i = ((Math.floor(orderIdx) % n) + n) % n;
  const s = map.questionSpots[i];
  if (!s) return spawnPoint(map, 0);
  return { x: (s.x + 0.5) * map.tileSize, y: (s.y + 0.5) * map.tileSize };
}
