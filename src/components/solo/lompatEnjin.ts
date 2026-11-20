/**
 * KZ-058: enjin permainan platform sisi "Lompat" untuk Cabaran Solo.
 *
 * TypeScript tulen (tiada DOM) supaya boleh diuji dengan skrip. Rekaan asal:
 * aras dijana daripada biji tetap, watak dan halangan dilukis sendiri dalam
 * lompatLukis.ts; tiada aset, aras atau nama daripada permainan lain.
 *
 * Soalan, markah dan papan markah dikongsi dengan Lumba Solo: enjin ini
 * menulis masa, kemajuan dan status selesai ke dalam KeadaanLumba supaya
 * jadual soalan dan HUD sedia ada terus berfungsi. Dunia berhenti semasa
 * soalan terbuka (masa tetap berjalan).
 */

import {
  HAD_LAJU_AWAL,
  HAD_LAJU_MAX,
  TREK_PANJANG_M,
  hadLajuEfektif,
  type InputPemandu,
  type KeadaanLumba,
} from './lumbaSoloEnjin';

/** Panjang aras hingga bendera penamat, meter. */
export const ARAS_PANJANG_M = 420;
/** Laju larian asas dan maksimum (selepas bonus jawapan betul), m/s. */
export const LAJU_ASAS_M_S = 5.5;
export const LAJU_MAX_M_S = 8;
/** Graviti dan halaju lompat. Tinggi lompat = v² / 2g ≈ 2.1 m. */
export const GRAVITI = 26;
export const HALAJU_LOMPAT = 10.5;
/** Saiz watak, meter. */
export const WATAK_LEBAR = 0.7;
export const WATAK_TINGGI = 1.1;
/** Tempoh kebal (berkelip) selepas jatuh atau terkena duri, ms. */
export const KEBAL_MS = 1000;
/** Bahagian awal tempoh kebal: watak kaku dan tidak boleh bergerak, ms. */
export const KAKU_MS = 700;
/** Masa ihsan: masih boleh melompat sejurus meninggalkan tebing, s. */
const IHSAN_TEBING_S = 0.1;
/** Tekanan lompat diingat sebentar sebelum mendarat, s. */
const INGAT_LOMPAT_S = 0.12;

export type JenisBlok = 'peti' | 'pelantar' | 'duri';

export interface Blok {
  jenis: JenisBlok;
  /** Tepi kiri, dasar, lebar dan tinggi, meter. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bintang {
  x: number;
  y: number;
  diambil: boolean;
}

export interface Aras {
  /** Selang tanah [x1, x2]; antara selang ialah lubang. */
  tanah: [number, number][];
  blok: Blok[];
  bintang: Bintang[];
}

export interface KeadaanLompat {
  aras: Aras;
  /** Pusat bawah watak. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  diTanah: boolean;
  /** 1 menghadap kanan, -1 kiri. */
  arah: 1 | -1;
  /** Saat sejak kali terakhir di tanah (masa ihsan tebing). */
  sejakTanah: number;
  /** Baki saat tekanan lompat diingat. */
  ingatLompat: number;
  lompatDitahan: boolean;
  /** Masa (ms simulasi) kebal berakhir. */
  kebalTamatMs: number;
  /** Kedudukan selamat terakhir untuk hidup semula. */
  selamatX: number;
  bintangDiambil: number;
  jatuh: number;
}

function rawakBerbiji(biji: number): () => number {
  let s = biji >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Jana aras. Sama setiap kali untuk biji yang sama supaya semua pemain
 * berdepan aras yang sama. 14 m pertama dan 16 m terakhir sentiasa selamat.
 */
export function janaAras(biji = 2026): Aras {
  const r = rawakBerbiji(biji);
  const tanah: [number, number][] = [];
  const blok: Blok[] = [];
  const bintang: Bintang[] = [];
  let mulaTanah = -30;
  let x = 14;
  let giliran = 0;
  while (x < ARAS_PANJANG_M - 22) {
    const jenis = giliran % 4;
    giliran += 1;
    if (jenis === 0) {
      // Lubang 2 hingga 3 m, dengan bintang melengkung di atasnya.
      const lebar = 2 + r();
      tanah.push([mulaTanah, x]);
      mulaTanah = x + lebar;
      for (let i = 0; i < 3; i++) {
        bintang.push({ x: x + (lebar * (i + 0.5)) / 3, y: 1.5 + (i === 1 ? 0.5 : 0), diambil: false });
      }
      x += lebar;
    } else if (jenis === 1) {
      // Duri di atas tanah.
      blok.push({ jenis: 'duri', x, y: 0, w: 0.9, h: 0.6 });
      bintang.push({ x: x + 0.45, y: 2.2, diambil: false });
      x += 0.9;
    } else if (jenis === 2) {
      // Pelantar terapung dengan bintang di atas.
      const lebar = 3 + Math.floor(r() * 2);
      blok.push({ jenis: 'pelantar', x, y: 1.7, w: lebar, h: 0.35 });
      for (let i = 0; i < lebar; i++) bintang.push({ x: x + i + 0.5, y: 2.75, diambil: false });
      x += lebar;
    } else {
      // Peti padu: mesti dilompat, diikuti duri kadang-kadang.
      blok.push({ jenis: 'peti', x, y: 0, w: 1.4, h: 1 });
      if (r() < 0.5) blok.push({ jenis: 'peti', x: x + 1.4, y: 0, w: 1.4, h: 1 });
      bintang.push({ x: x + 0.7, y: 2.0, diambil: false });
      x += 2.8;
    }
    x += 8 + r() * 5;
  }
  tanah.push([mulaTanah, ARAS_PANJANG_M + 40]);
  return { tanah, blok, bintang };
}

export function ciptaKeadaanLompat(biji = 2026): KeadaanLompat {
  return {
    aras: janaAras(biji),
    x: 2,
    y: 0,
    vx: 0,
    vy: 0,
    diTanah: true,
    arah: 1,
    sejakTanah: 0,
    ingatLompat: 0,
    lompatDitahan: false,
    kebalTamatMs: 0,
    selamatX: 2,
    bintangDiambil: 0,
    jatuh: 0,
  };
}

/** Ada tanah di bawah titik x. */
export function adaTanah(aras: Aras, x: number): boolean {
  for (const [a, b] of aras.tanah) if (x >= a && x <= b) return true;
  return false;
}

/** Laju larian semasa mengikut had laju enjin soalan (bonus betul, penalti salah). */
export function lajuLarian(k: KeadaanLumba): number {
  const p = (hadLajuEfektif(k) - HAD_LAJU_AWAL) / (HAD_LAJU_MAX - HAD_LAJU_AWAL);
  // Semasa penalti p negatif: laju turun di bawah asas (sekurang-kurangnya 3 m/s).
  return Math.max(3, LAJU_ASAS_M_S + p * (LAJU_MAX_M_S - LAJU_ASAS_M_S));
}

function hidupSemula(L: KeadaanLompat, k: KeadaanLumba, x: number): void {
  L.x = Math.max(2, x);
  L.y = 0;
  L.vx = 0;
  L.vy = 0;
  L.diTanah = true;
  L.jatuh += 1;
  L.kebalTamatMs = k.masaMs + KEBAL_MS;
}

/** Titik selamat di kiri x: di atas tanah dan tidak bertindih blok. */
function titikSelamat(aras: Aras, x: number): number {
  let c = x;
  for (let i = 0; i < 40; i++) {
    const bertindih = aras.blok.some((b) => b.y < WATAK_TINGGI && c + 1 > b.x && c - 1 < b.x + b.w);
    if (adaTanah(aras, c - 0.5) && adaTanah(aras, c + 0.5) && !bertindih) return c;
    c -= 0.5;
  }
  return 2;
}

/**
 * Satu langkah simulasi. Menulis masaMs, jarakM, kelajuan dan selesai ke
 * dalam k. Semasa soalan terbuka hanya masa yang bergerak.
 */
export function langkahLompat(L: KeadaanLompat, k: KeadaanLumba, dtMs: number, input: InputPemandu): void {
  if (k.selesai) return;
  const dtPenuh = Math.min(100, Math.max(0, dtMs)) / 1000;
  if (dtPenuh <= 0) return;
  k.masaMs += Math.max(0, dtMs);
  k.diLuarJalan = false;
  k.offsetM = 0;
  if (k.soalanDibukaMs !== null) {
    L.lompatDitahan = input.pecut;
    k.kelajuan = 0;
    return;
  }

  // Tekanan lompat baharu (tepi naik) diingat sebentar.
  if (input.pecut && !L.lompatDitahan) L.ingatLompat = INGAT_LOMPAT_S;
  L.lompatDitahan = input.pecut;

  // Sublangkah 1/120 s supaya watak tidak menembusi pelantar nipis.
  let baki = dtPenuh;
  while (baki > 1e-6 && !k.selesai) {
    const dt = Math.min(baki, 1 / 120);
    baki -= dt;
    langkahKecil(L, k, dt, input);
  }
  k.kelajuan = Math.abs(L.vx) * 3.6;
  k.jarakM = Math.max(0, Math.min(1, L.x / ARAS_PANJANG_M)) * TREK_PANJANG_M;
}

function langkahKecil(L: KeadaanLompat, k: KeadaanLumba, dt: number, input: InputPemandu): void {
  const aras = L.aras;
  const laju = lajuLarian(k);
  const kaku = k.masaMs < L.kebalTamatMs - (KEBAL_MS - KAKU_MS);
  const arah = kaku ? 0 : (input.kanan ? 1 : 0) - (input.kiri ? 1 : 0);
  if (kaku) L.ingatLompat = 0;
  if (arah !== 0) L.arah = arah > 0 ? 1 : -1;
  const sasar = arah * laju;
  // Pecutan pantas di tanah, lebih lembut di udara.
  L.vx += (sasar - L.vx) * Math.min(1, dt * (L.diTanah ? 14 : 7));

  L.sejakTanah = L.diTanah ? 0 : L.sejakTanah + dt;
  L.ingatLompat = Math.max(0, L.ingatLompat - dt);
  if (L.ingatLompat > 0 && L.sejakTanah <= IHSAN_TEBING_S) {
    L.vy = HALAJU_LOMPAT;
    L.diTanah = false;
    L.ingatLompat = 0;
    L.sejakTanah = IHSAN_TEBING_S + 1;
  }
  // Gerakan mendatar, dihalang peti padu.
  const separuh = WATAK_LEBAR / 2;
  let xBaharu = Math.max(0.4, L.x + L.vx * dt);
  for (const b of aras.blok) {
    if (b.jenis !== 'peti') continue;
    const atas = b.y + b.h;
    if (L.y >= atas - 0.02 || L.y + WATAK_TINGGI <= b.y) continue;
    if (xBaharu + separuh > b.x && xBaharu - separuh < b.x + b.w) {
      xBaharu = L.x <= b.x + b.w / 2 ? b.x - separuh : b.x + b.w + separuh;
      L.vx = 0;
    }
  }
  L.x = xBaharu;

  // Gerakan menegak dan pendaratan (tanah, atas peti, pelantar sehala).
  const ySebelum = L.y;
  L.vy -= GRAVITI * dt;
  L.y += L.vy * dt;
  L.diTanah = false;
  if (L.vy <= 0) {
    let lantai = -Infinity;
    if (adaTanah(aras, L.x - separuh * 0.6) || adaTanah(aras, L.x + separuh * 0.6)) lantai = 0;
    for (const b of aras.blok) {
      if (b.jenis === 'duri') continue;
      const atas = b.y + b.h;
      if (L.x + separuh > b.x && L.x - separuh < b.x + b.w && ySebelum >= atas - 0.02 && atas > lantai) lantai = atas;
    }
    if (ySebelum >= lantai - 0.02 && L.y <= lantai) {
      L.y = lantai;
      L.vy = 0;
      L.diTanah = true;
    }
  }

  // Titik selamat: berdiri di atas tanah sebenar.
  if (L.diTanah && L.y === 0) L.selamatX = L.x;

  // Bintang.
  for (const s of aras.bintang) {
    if (!s.diambil && Math.abs(s.x - L.x) < 0.6 && s.y > L.y - 0.3 && s.y < L.y + WATAK_TINGGI + 0.3) {
      s.diambil = true;
      L.bintangDiambil += 1;
    }
  }

  // Bahaya: jatuh ke lubang, atau terkena duri (kecuali semasa kebal).
  if (L.y < -4) {
    hidupSemula(L, k, titikSelamat(aras, L.selamatX - 1));
    return;
  }
  if (k.masaMs >= L.kebalTamatMs) {
    for (const b of aras.blok) {
      if (b.jenis !== 'duri') continue;
      if (L.x + separuh * 0.7 > b.x && L.x - separuh * 0.7 < b.x + b.w && L.y < b.y + b.h * 0.8) {
        hidupSemula(L, k, titikSelamat(aras, b.x - 4));
        return;
      }
    }
  }

  if (L.x >= ARAS_PANJANG_M) {
    L.x = ARAS_PANJANG_M;
    k.selesai = true;
  }
}
