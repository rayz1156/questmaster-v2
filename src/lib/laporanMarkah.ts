/**
 * Fungsi tulen bagi laporan markah (tiket V2-017): kedudukan seri sesi Live
 * Quiz, ringkasan sesi, tiga teratas dan pemangkasan teks.
 *
 * Tiada akses pangkalan data di sini supaya boleh diuji dengan
 * `npx tsx scripts/selftest-mcp-laporan.ts` tanpa env atau Supabase.
 *
 * Kedudukan seri melengkapkan kiraKedudukan dalam src/lib/markahPeserta.ts
 * (satu sumber formula); fungsi di sini hanya membungkusnya untuk laporan
 * sesi serta menambah ringkasan dan pemangkasan.
 */
import { kiraKedudukan } from './markahPeserta';

/**
 * Kedudukan kompetitif dengan seri berkongsi nombor yang sama:
 * [100, 90, 90, 80] memberi [1, 2, 2, 4]. Keputusan selari susunan input.
 */
export function kedudukanSeri(mata: readonly number[]): number[] {
  return kiraKedudukan(mata);
}

/** Ahli pasukan / pemain bagi pengiraan ringkasan sesi. */
export interface BarisRingkasanPemain {
  score: number;
  correct: number;
  answered: number;
}

/** Ringkasan sesi Live Quiz untuk laporan keputusan penuh. */
export interface RingkasanSesi {
  players: number;
  avg_score: number;
  median_score: number;
  accuracy_pct: number | null;
}

/** Median senarai nombor; senarai kosong dipulangkan sebagai 0. */
export function median(nombor: readonly number[]): number {
  if (nombor.length === 0) return 0;
  const atur = [...nombor].sort((a, b) => a - b);
  const tengah = Math.floor(atur.length / 2);
  const nilai =
    atur.length % 2 === 1 ? atur[tengah] : (atur[tengah - 1] + atur[tengah]) / 2;
  // Bundarkan 1 titik perpuluhan supaya median genap tidak memaparkan
  // nombor panjang seperti 833.333333.
  return Math.round(nilai * 10) / 10;
}

/**
 * Ringkasan sesi daripada baris pemain: bilangan pemain, purata dan median
 * markah, serta peratus ketepatan keseluruhan. Ketepatan NULL bila tiada
 * sebarang jawapan (bukan sifar), selari kontrak Insights.
 */
export function ringkasanSesi(pemain: readonly BarisRingkasanPemain[]): RingkasanSesi {
  const jumlah = pemain.length;
  const mata = pemain.map((p) => (Number.isFinite(p.score) ? Number(p.score) : 0));
  const jumlahBetul = pemain.reduce((j, p) => j + (Number(p.correct) || 0), 0);
  const jumlahJawapan = pemain.reduce((j, p) => j + (Number(p.answered) || 0), 0);
  const purata =
    jumlah === 0 ? 0 : Math.round((mata.reduce((a, b) => a + b, 0) / jumlah) * 10) / 10;
  return {
    players: jumlah,
    avg_score: purata,
    median_score: median(mata),
    accuracy_pct:
      jumlahJawapan > 0 ? Math.round((jumlahBetul / jumlahJawapan) * 1000) / 10 : null,
  };
}

/** Pemain dengan nama untuk senarai teratas. */
export interface PemainTeratas {
  name: string;
  score: number;
}

/** Satu baris teratas dalam laporan sesi. */
export interface BarisTeratas {
  rank: number;
  name: string;
  score: number;
}

/**
 * Tiga teratas sesi ikut markah (seri berkongsi kedudukan), ikut masa
 * kemudian nama sebagai pemutus susunan paparan.
 */
export function tigaTeratas(pemain: readonly PemainTeratas[]): BarisTeratas[] {
  const atur = [...pemain].sort(
    (a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const kedudukan = kedudukanSeri(atur.map((p) => p.score));
  return atur.slice(0, 3).map((p, i) => ({ rank: kedudukan[i], name: p.name, score: p.score }));
}

/** Hasil pemangkasan teks. */
export interface TeksPangkas {
  teks: string;
  truncated: boolean;
}

/**
 * Pangkas teks pada had aksara. Teks yang dipotong diberi elipsis "..."
 * selepas had, jadi panjang keluaran boleh melebihi had dengan 3 aksara;
 * ini dipilih supaya kandungan dipotong pada sempadan yang betul dan bukan
 * dipendekkan senyap. Had mesti integer positif.
 */
export function pangkasTeks(teks: string, had: number): TeksPangkas {
  const nilai = typeof teks === 'string' ? teks : String(teks ?? '');
  const sempadan = Number.isFinite(had) && had > 0 ? Math.floor(had) : 0;
  if (nilai.length <= sempadan) return { teks: nilai, truncated: false };
  return { teks: nilai.slice(0, sempadan) + '...', truncated: true };
}
