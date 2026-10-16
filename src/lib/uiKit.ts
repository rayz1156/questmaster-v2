/**
 * Kit UI KZ-021: fungsi tulen pembantu untuk komponen dalam
 * `src/components/ui/` (palet indeks, inisial, penomboran halaman,
 * skala carta).
 *
 * Semua fungsi di sini tulen: tiada Supabase, tiada jaringan, tiada
 * ketergantungan React. Inisial dan palet indeks TIDAK ditulis semula;
 * ia diguna semula daripada `src/lib/papanPemukaPeserta.ts` (KZ-020)
 * supaya avatar dan petak inisial kekal warna yang sama di semua skrin.
 *
 * Ujian: `scripts/selftest-kz021.ts`.
 */

// Guna semula logik sedia ada supaya tidak ada dua takrifan inisial/warna.
export { inisial, warnaIndeks } from "./papanPemukaPeserta";
export type { PasanganWarna } from "./papanPemukaPeserta";

import { warnaIndeks } from "./papanPemukaPeserta";

/* ============================================================
 * Penomboran halaman (DataTable / Pagination)
 * ============================================================ */

/**
 * Jumlah muka surat untuk `bilItem` item pada `saizHalaman` item setiap
 * muka surat. Sekurang-kurangnya 1 muka surat walaupun senarai kosong,
 * supaya jadual kosong tetap memaparkan "PAGE 1 OF 1".
 */
export function jumlahMukaSurat(bilItem: number, saizHalaman: number): number {
  const saiz = Math.max(1, Math.floor(saizHalaman) || 1);
  const bil = Math.max(0, Math.floor(bilItem) || 0);
  return Math.max(1, Math.ceil(bil / saiz));
}

/**
 * Senarai nombor muka surat untuk baris penomboran, gaya "Prev 1 2 ... 6 7
 * Next". `null` mewakili elipsis (...). `tepi` ialah bilangan muka surat
 * di hujung kiri dan kanan yang sentiasa dipaparkan.
 *
 * Contoh (jumlah 7, tepi 1): muka 1 -> [1,2,null,7]; muka 4 ->
 * [1,null,3,4,5,null,7]; muka 7 -> [1,null,6,7]. Jumlah kecil (<= 7
 * dengan tepi 1) dipaparkan penuh tanpa elipsis.
 */
export function senaraiMukaSurat(semasa: number, jumlah: number, tepi = 1): (number | null)[] {
  const jum = Math.max(1, Math.floor(jumlah) || 1);
  const sem = Math.min(Math.max(1, Math.floor(semasa) || 1), jum);
  const t = Math.max(1, Math.floor(tepi) || 1);
  // Jumlah kecil: papar semua, tiada elipsis.
  if (jum <= t * 2 + 3) return Array.from({ length: jum }, (_, i) => i + 1);

  const ada = new Set<number>();
  for (let i = 1; i <= t; i++) ada.add(i);
  for (let i = jum - t + 1; i <= jum; i++) ada.add(i);
  for (let i = sem - t; i <= sem + t; i++) if (i >= 1 && i <= jum) ada.add(i);

  const keluar: (number | null)[] = [];
  let sebelum: number | null = null;
  for (let i = 1; i <= jum; i++) {
    if (ada.has(i)) {
      if (sebelum !== null && i - sebelum > 1) keluar.push(null);
      keluar.push(i);
      sebelum = i;
    }
  }
  return keluar;
}

/**
 * Potong senarai kepada satu muka surat. `halaman` bermula 1 dan
 * diapit kepada julat sah; halaman di luar julang memulangkan
 * muka surat terakhir yang sah (atau pertama).
 */
export function potongHalaman<T>(senarai: T[] | null | undefined, halaman: number, saizHalaman: number): T[] {
  const sen = senarai || [];
  const saiz = Math.max(1, Math.floor(saizHalaman) || 1);
  const jum = jumlahMukaSurat(sen.length, saiz);
  const sem = Math.min(Math.max(1, Math.floor(halaman) || 1), jum);
  return sen.slice((sem - 1) * saiz, sem * saiz);
}

/* ============================================================
 * Skala carta (BarChart / LineChart, SVG tanpa pustaka)
 * ============================================================ */

/** Satu bar carta bar yang sudah berskala untuk dipaparkan. */
export type BarCarta = {
  label: string;
  nilai: number;
  /** Tinggi bar dalam piksel (sekurang-kurangnya `tinggiMin`). */
  tinggi: number;
  /** Nisbah 0..1 berbanding nilai tertinggi; bar tertinggi ialah 1. */
  nisbah: number;
};

/**
 * Skala carta bar (KZ-021): untuk setiap baris, kira nisbah terhadap
 * nilai tertinggi dan tinggi dalam piksel. Baris nilai 0 masih
 * dipaparkan sebagai tunas `tinggiMin` supaya pengguna tahu ada
 * berapa entri (sama seperti dataCartaBar KZ-020).
 */
export function skalaBar<T>(
  baris: T[] | null | undefined,
  labelOf: (r: T) => string,
  nilaiOf: (r: T) => number,
  tinggiMaks: number,
  tinggiMin = 4
): BarCarta[] {
  const sen = baris || [];
  const maks = sen.reduce((m, r) => Math.max(m, nilaiOf(r) || 0), 0);
  const tinggi = Math.max(tinggiMin, Math.min(tinggiMaks, tinggiMaks));
  return sen.map((r) => {
    const nilai = nilaiOf(r) || 0;
    const nisbah = maks > 0 ? nilai / maks : 0;
    return {
      label: labelOf(r),
      nilai,
      nisbah,
      tinggi: Math.max(tinggiMin, Math.round(nisbah * tinggi)),
    };
  });
}

/**
 * Normalisasi nilai garis (LineChart) kepada 0..1 mengikut julat
 * `min`..`maks`. Julat sifar memulangkan 0.5 supaya garis datar
 * berada di tengah paksi, bukan melekat di bawah.
 */
export function skalaGaris(nilai: number, min: number, maks: number): number {
  const julat = maks - min;
  if (!Number.isFinite(julat) || julat <= 0) return 0.5;
  const n = (nilai - min) / julat;
  return Math.min(1, Math.max(0, n));
}

/**
 * Tukar nisbah 0..1 kepada koordinat piksel dalam kotak SVG.
 * Digunakan oleh LineChart untuk titik x/y.
 */
export function titikSvg(nisbah: number, panjang: number): number {
  const p = Math.max(0, Math.min(1, nisbah || 0));
  return Math.round(p * panjang * 100) / 100;
}

/* ============================================================
 * Label masa ProjectCard
 * ============================================================ */

/** Warna lencana masa ProjectCard ikut sisa hari (kunci WarnaKit). */
export type WarnaMasa = "green" | "yellow" | "red" | "gray";

/**
 * Label baki masa ProjectCard (KZ-DS-v3 bahagian ProjectCard):
 * "Due Tomorrow" merah, "N Days Left" kuning, "Done" hijau, lain-lain
 * kelabu. `segera` tidak dipakai di sini; warna diambil terus.
 */
export function labelMasa(hariSisa: number, siap: boolean): { label: string; warna: WarnaMasa } {
  if (siap) return { label: "Done", warna: "green" };
  if (hariSisa < 0) return { label: "Overdue", warna: "red" };
  if (hariSisa === 0) return { label: "Due Today", warna: "red" };
  if (hariSisa === 1) return { label: "Due Tomorrow", warna: "red" };
  if (hariSisa <= 7) return { label: `${hariSisa} Days Left`, warna: "yellow" };
  return { label: `${hariSisa} Days Left`, warna: "gray" };
}

/** Pasangan latar/teks untuk InitialTile dan Avatar ikut indeks baris. */
export function paletIndeks(indeks: number) {
  return warnaIndeks(indeks);
}
