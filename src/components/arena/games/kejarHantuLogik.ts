// Logik tulen permainan Kejar Hantu: tiada DOM, tiada React, tiada panggilan API.
// Semua keputusan maze (sasaran hantu, pilihan arah di simpang, kitaran mod
// Scatter/Chase, pembalukan terowong) hidup di sini supaya boleh diuji oleh
// scripts/selftest-kejar-hantu.ts.
//
// Nota: susun atur maze ini rekaan sendiri, bukan salinan mana-mana maze
// komersial. Aksara jubin:
//   '#' dinding   '.' butir   'o' lokasi peti soalan
//   '-' pintu rumah hantu (hantu sahaja)   ' ' dalam rumah (hantu sahaja)
//   'T' jubin terowong (baris tengah, membalut)

// KZ-050: labirin dikecilkan kepada 19 x 21 jubin (dahulu 28 x 31) supaya
// setiap jubin lebih besar pada skrin telefon dan komputer riba.
export const LABIRIN: readonly string[] = [
  '###################',
  '#o.......#.......o#',
  '#.##.###.#.###.##.#',
  '#.....o.....o.....#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###.#.###.####',
  '####.#.......#.####',
  '####.#.##-##.#.####',
  'T......#   #......T',
  '####.#.#####.#.####',
  '####.#.......#.####',
  '####.#.#####.#.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#...........#.o#',
  '##.#.#.#####.#.#.##',
  '#....#o..#..o#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];

export const LEBAR = 19;
export const TINGGI = 21;
export const BARIS_TEROWONG = 9;

// ------------------------------------------------------------- arah & jubin

export interface Arah {
  readonly dx: number;
  readonly dy: number;
}
export const ATAS: Arah = { dx: 0, dy: -1 };
export const KIRI: Arah = { dx: -1, dy: 0 };
export const BAWAH: Arah = { dx: 0, dy: 1 };
export const KANAN: Arah = { dx: 1, dy: 0 };

// Keutamaan seri di simpang: atas, kiri, bawah, kanan.
export const URUT_KEUTAMAAN: readonly Arah[] = [ATAS, KIRI, BAWAH, KANAN];

export function balikArah(a: Arah): Arah {
  return { dx: -a.dx, dy: -a.dy };
}

export function arahSama(a: Arah, b: Arah): boolean {
  return a.dx === b.dx && a.dy === b.dy;
}

export interface Jubin {
  readonly x: number;
  readonly y: number;
}

/** Aksara jubin pada kedudukan bulat; kolum membalut (terowong). */
export function jubinChar(x: number, y: number): string {
  const yy = Math.round(y);
  if (yy < 0 || yy >= TINGGI) return '#';
  const baris = LABIRIN[yy];
  if (!baris) return '#';
  const xx = ((Math.round(x) % LEBAR) + LEBAR) % LEBAR;
  return baris[xx] ?? '#';
}

/**
 * Boleh lalui? '#' tidak boleh. '-' (pintu) dan ' ' (dalam rumah) hanya
 * untuk hantu; Kuizi tidak boleh masuk rumah.
 */
export function bolehLalui(x: number, y: number, untukHantu = false): boolean {
  const c = jubinChar(x, y);
  if (c === '#') return false;
  if (c === '-' || c === ' ') return untukHantu;
  return true;
}

/** Semua arah yang boleh dilalui dari pusat jubin, ikut keutamaan. */
export function arahBolehDari(x: number, y: number, untukHantu = false): Arah[] {
  return URUT_KEUTAMAAN.filter((a) => bolehLalui(x + a.dx, y + a.dy, untukHantu));
}

/**
 * Pusat jubin destinasi seterusnya sepanjang arah dari kedudukan semasa
 * (kedudukan boleh berada antara dua pusat). Digunakan oleh enjin
 * pergerakan pusat-ke-pusat di komponen; diuji supaya formula tidak
 * terpesong pada jubin pecahan.
 */
export function pusatDestinasi(x: number, y: number, arah: Arah): Jubin {
  const cx = Math.round(x);
  const cy = Math.round(y);
  let nx = cx;
  let ny = cy;
  if (arah.dx > 0) nx = Math.floor(x + 1e-7) + 1;
  else if (arah.dx < 0) nx = Math.ceil(x - 1e-7) - 1;
  if (arah.dy > 0) ny = Math.floor(y + 1e-7) + 1;
  else if (arah.dy < 0) ny = Math.ceil(y - 1e-7) - 1;
  return { x: nx, y: ny };
}

// --------------------------------------------------------------- terowong

/**
 * Pembalukan terowong pada paksi X. Kontinu: -0.5 melipat ke 27.5 dan
 * 27.5 melipat ke -0.5, supaya watak melintas sempadan tanpa lompatan.
 */
export function wrapX(x: number): number {
  return (((x + 0.5) % LEBAR) + LEBAR) % LEBAR - 0.5;
}

/** Jubin baris terowong berhampiran tepi: hantu perlahan 40% di sini. */
export function dalamTerowong(x: number, y: number): boolean {
  if (Math.round(y) !== BARIS_TEROWONG) return false;
  return x < 4 || x > LEBAR - 5;
}

// ------------------------------------------------------- kitaran mod hantu

export type ModHantu = 'scatter' | 'chase';

// Scatter 9, Chase 15, Scatter 9, Chase 15, Scatter 7, Chase 20, Scatter 5,
// kemudian Chase kekal. KZ-050: Scatter lebih panjang supaya lebih mudah.
export const JADUAL_MOD: readonly number[] = [9, 15, 9, 15, 7, 20, 5, Infinity];

/** Indeks fasa mod pada masa t (saat sejak mula tahap). */
export function fasaModPadaMasa(t: number): number {
  let sisa = Math.max(0, t);
  for (let i = 0; i < JADUAL_MOD.length; i++) {
    if (sisa < JADUAL_MOD[i]) return i;
    sisa -= JADUAL_MOD[i];
  }
  return JADUAL_MOD.length - 1;
}

/** Mod semasa (fasa genap = Scatter, ganjil = Chase). */
export function modPadaMasa(t: number): ModHantu {
  const fasa = fasaModPadaMasa(t);
  return fasa % 2 === 0 ? 'scatter' : 'chase';
}

// ------------------------------------------------- keperibadian keempat hantu

// Sudut Scatter masing-masing: Garang kanan-atas, Licik kiri-atas,
// Bijak kanan-bawah, Malu kiri-bawah.
export const SUDUT_SCATTER: readonly Jubin[] = [
  { x: LEBAR - 2, y: 1 },
  { x: 1, y: 1 },
  { x: LEBAR - 2, y: TINGGI - 2 },
  { x: 1, y: TINGGI - 2 },
];

export const NAMA_HANTU: readonly string[] = ['Garang', 'Licik', 'Bijak', 'Malu'];
export const WARNA_HANTU: readonly string[] = ['#ef4444', '#ec4899', '#3b82f6', '#f97316'];

export interface KeadaanSasaran {
  readonly indeks: number; // 0..3
  readonly mod: ModHantu;
  readonly kuiziX: number;
  readonly kuiziY: number;
  readonly kuiziDx: number;
  readonly kuiziDy: number;
  readonly hantuX: number; // kedudukan hantu ini
  readonly hantuY: number;
  readonly merahX: number; // kedudukan Garang (untuk Bijak)
  readonly merahY: number;
}

/**
 * Jubin sasaran hantu mengikut keperibadian:
 * Garang: jubin Kuizi.
 * Licik: 4 jubin di hadapan arah Kuizi.
 * Bijak: vektor dari Garang ke 2 jubin hadapan Kuizi, digandakan.
 * Malu: Kuizi jika jarak > 8 jubin, kalau tidak sudut Scatternya.
 * Scatter: sudut masing-masing.
 */
export function sasaranHantu(s: KeadaanSasaran): Jubin {
  if (s.mod === 'scatter') return SUDUT_SCATTER[s.indeks] ?? SUDUT_SCATTER[0];
  switch (s.indeks) {
    case 0:
      return { x: s.kuiziX, y: s.kuiziY };
    case 1: {
      return { x: s.kuiziX + s.kuiziDx * 4, y: s.kuiziY + s.kuiziDy * 4 };
    }
    case 2: {
      // titik 2 jubin di hadapan Kuizi, dicerminkan dari Garang
      const px = s.kuiziX + s.kuiziDx * 2;
      const py = s.kuiziY + s.kuiziDy * 2;
      return { x: s.merahX + (px - s.merahX) * 2, y: s.merahY + (py - s.merahY) * 2 };
    }
    default: {
      const jauh = Math.hypot(s.kuiziX - s.hantuX, s.kuiziY - s.hantuY);
      if (jauh > 8) return { x: s.kuiziX, y: s.kuiziY };
      return SUDUT_SCATTER[3] ?? SUDUT_SCATTER[0];
    }
  }
}

// ------------------------------------------------------ pilihan arah simpang

/**
 * Pilihan arah hantu di simpang: larang berpatah balik (kecuali tiada pilihan
 * lain), pilih arah yang meminimumkan jarak Euclid pusat jubin destinasi ke
 * sasaran, keutamaan seri ikut atas, kiri, bawah, kanan.
 */
export function pilihArahKeSasaran(
  x: number,
  y: number,
  arahSekarang: Arah,
  sasaran: Jubin,
  untukHantu = true,
): Arah {
  const semua = arahBolehDari(x, y, untukHantu);
  if (semua.length === 0) return arahSekarang;
  const balik = balikArah(arahSekarang);
  const kandidat = semua.filter((a) => !arahSama(a, balik));
  const senarai = kandidat.length > 0 ? kandidat : semua;
  let terbaik = senarai[0] as Arah;
  let jarakTerbaik = Infinity;
  for (const a of senarai) {
    const j = Math.hypot(x + a.dx - sasaran.x, y + a.dy - sasaran.y);
    if (j < jarakTerbaik - 1e-9) {
      terbaik = a;
      jarakTerbaik = j;
    }
  }
  return terbaik;
}

/** Mod Frightened: arah rawak di simpang, tetap tanpa berpatah balik. */
export function pilihArahRawak(
  x: number,
  y: number,
  arahSekarang: Arah,
  untukHantu = true,
  rnd: () => number = Math.random,
): Arah {
  const semua = arahBolehDari(x, y, untukHantu);
  if (semua.length === 0) return arahSekarang;
  const balik = balikArah(arahSekarang);
  const kandidat = semua.filter((a) => !arahSama(a, balik));
  const senarai = kandidat.length > 0 ? kandidat : semua;
  return senarai[Math.floor(rnd() * senarai.length) % senarai.length] as Arah;
}

// ------------------------------------------------------ kedudukan penting

export const MULAI_KUIZI: Jubin = { x: 9, y: 15 };
export const PUSAT_RUMAH: Jubin = { x: 9, y: 9 }; // tempat mata hantu pulang
export const PINTU_KELUAR: Jubin = { x: 9, y: 7 }; // jubin atas pintu

// Kedudukan mula hantu dalam rumah (kolum 8..10, baris 9). KZ-050: tiga
// hantu sahaja (Garang, Licik, Bijak) kerana labirin lebih kecil.
export const MULAI_HANTU: readonly Jubin[] = [
  { x: 9, y: 9 },
  { x: 8, y: 9 },
  { x: 10, y: 9 },
];

/** Bilangan hantu mengikut tahap: tahap 1 dua hantu, selepas itu tiga. */
export function bilanganHantu(tahap: number): number {
  return Math.min(MULAI_HANTU.length, tahap <= 1 ? 2 : 3);
}

// --------------------------------------------------------------- kelajuan

// KZ-050: dimudahkan. Kuizi lebih perlahan (labirin kecil, kawalan telefon),
// hantu jelas lebih perlahan daripada Kuizi, kuasa lebih lama, lebih nyawa.
export const KELAJUAN_ASAS = 4.6; // jubin sesaat, Kuizi 100%
export const FAKTOR_HANTU = 0.78; // hantu 78% kelajuan Kuizi
export const FAKTOR_MAKAN_BUTIR = 1; // Kuizi tidak melahu semasa makan butir
export const FAKTOR_TEROWONG = 0.6; // hantu perlahan 40% dalam terowong
export const FAKTOR_GELISAH = 0.5; // hantu Frightened perlahan 50%
export const KELAJUAN_MATA = 12; // mata hantu pulang laju ke rumah
export const PECUTAN_TAHAP = 0.06; // hantu 6% lebih laju setiap tahap
export const TAHAP_MAKSIMUM = 3;
export const MASA_KUASA = 10; // mod kuasa 10 saat
export const MASA_KELIP = 2; // 2 saat terakhir Frightened berkelip
export const MATA_HANTU = [200, 400, 800, 1600];
export const MATA_BUTIR = 10;
export const JEDA_MATI = 1.5; // jeda selepas ditangkap
export const JEDA_TAHAP = 2; // jeda "Tahap selesai"
export const NYAWA_AWAL = 5;

// --------------------------------------------------------------- peti soalan

// Lokasi 'o' dalam labirin (potensi peti soalan berdenyut).
export const PETI_LOKASI: readonly Jubin[] = ((): Jubin[] => {
  const senarai: Jubin[] = [];
  for (let y = 0; y < TINGGI; y++) {
    const baris = LABIRIN[y] ?? '';
    for (let x = 0; x < baris.length; x++) {
      if (baris[x] === 'o') senarai.push({ x, y });
    }
  }
  return senarai;
})();

export const BILANGAN_BUTIR: number = ((): number => {
  let n = 0;
  for (const baris of LABIRIN) {
    for (const c of baris) if (c === '.') n++;
  }
  return n;
})();

/**
 * Pemetaan lokasi peti kepada soalan: bilangan lokasi = bilangan soalan,
 * minimum 4; soalan dikitar jika kurang daripada bilangan lokasi.
 */
export function petakanPeti(idSoalan: readonly string[]): { lokasi: Jubin; questionId: string }[] {
  if (idSoalan.length === 0 || PETI_LOKASI.length === 0) return [];
  const bilangan = Math.min(Math.max(4, idSoalan.length), PETI_LOKASI.length);
  const hasil: { lokasi: Jubin; questionId: string }[] = [];
  for (let i = 0; i < bilangan; i++) {
    hasil.push({ lokasi: PETI_LOKASI[i] as Jubin, questionId: idSoalan[i % idSoalan.length] as string });
  }
  return hasil;
}

// ---------------------------------------------------------- sambungan maze

function kunci(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`;
}

/**
 * Flood fill jubin boleh jalan dari satu titik mula (untuk ujian: pastikan
 * tiada jubin boleh jalan yang terasing).
 */
export function floodFill(x: number, y: number, untukHantu: boolean): Set<string> {
  const dilawati = new Set<string>();
  if (!bolehLalui(x, y, untukHantu)) return dilawati;
  const baris = [{ x: Math.round(x), y: Math.round(y) }];
  dilawati.add(kunci(x, y));
  while (baris.length > 0) {
    const p = baris.pop() as { x: number; y: number };
    for (const a of URUT_KEUTAMAAN) {
      // kolum membaluk sejajar terowong supaya flood fill tidak melayari
      // kolum maya di luar 0..27
      const nx = (((p.x + a.dx) % LEBAR) + LEBAR) % LEBAR;
      const ny = p.y + a.dy;
      const kk = kunci(nx, ny);
      if (dilawati.has(kk)) continue;
      if (!bolehLalui(nx, ny, untukHantu)) continue;
      dilawati.add(kk);
      baris.push({ x: nx, y: ny });
    }
  }
  return dilawati;
}

/** Semua jubin boleh jalan (pembalukan terowong tidak diambil kira). */
export function senaraiJubinBolehJalan(untukHantu: boolean): Jubin[] {
  const hasil: Jubin[] = [];
  for (let y = 0; y < TINGGI; y++) {
    for (let x = 0; x < LEBAR; x++) {
      if (bolehLalui(x, y, untukHantu)) hasil.push({ x, y });
    }
  }
  return hasil;
}
