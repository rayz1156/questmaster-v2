// adminRanking.ts
// Fungsi tulen ranking kelas dan pengasingan token jawapan moderasi
// (V2-011c). Tiada pangkalan data di sini supaya semua boleh diuji oleh
// scripts/selftest-admin-ranking.ts.
//
// Konvensyen: komen BM, teks paparan (label) Inggeris.

import type { Challenge, Submission } from './types';

/** Nama fallback pengguna tanpa nama dalam ranking individu. */
export const NAMA_PENGGUNA_KOSONG = 'Student';

/** Baris ranking individu untuk tab Ranking butiran kelas. */
export interface BarisRankingIndividu {
  user_id: string;
  nama: string;
  /** Jumlah mata challenge bagi submission yang diluluskan. */
  skor: number;
  /** Bilangan jawapan yang diluluskan. */
  diluluskan: number;
}

/**
 * Nama paparan pengguna dalam ranking; null atau kosong (selepas trim)
 * menjadi "Student" supaya UUID tidak pernah dipaparkan sebagai nama.
 */
export function namaRanking(
  namaById: Record<string, string | null | undefined>,
  userId: string,
): string {
  const nama = (namaById[userId] || '').trim();
  return nama.length > 0 ? nama : NAMA_PENGGUNA_KOSONG;
}

/**
 * Ranking individu satu kelas: jumlah qm_challenges.points bagi setiap
 * submission `approved` setiap pengguna, serta bilangan jawapan
 * diluluskan.
 *
 * Peraturan:
 * - Submission bukan `approved` (pending, rejected) diabaikan sepenuhnya.
 * - Submission yang challenge-nya tiada dalam senarai (challenge dipadam
 *   atau di luar kelas) diabaikan supaya skor tidak berdasar angin.
 * - Susunan: skor menurun, kemudian bilangan diluluskan menurun, kemudian
 *   nama menaik, kemudian user_id untuk kestabilan mutlak pada seri penuh.
 * - namaById pilihan: tanpanya semua nama menjadi "Student".
 */
export function kiraRankingIndividu(
  submissions: Submission[],
  challenges: Challenge[],
  namaById: Record<string, string | null | undefined> = {},
): BarisRankingIndividu[] {
  const mataChallenge = new Map<string, number>();
  for (const c of challenges) {
    const p = Number(c.points);
    mataChallenge.set(c.id, Number.isFinite(p) ? p : 0);
  }

  const jumlah = new Map<string, number>();
  const kiraan = new Map<string, number>();
  for (const s of submissions) {
    if (s.status !== 'approved') continue;
    if (!mataChallenge.has(s.challenge_id)) continue;
    jumlah.set(s.user_id, (jumlah.get(s.user_id) || 0) + (mataChallenge.get(s.challenge_id) || 0));
    kiraan.set(s.user_id, (kiraan.get(s.user_id) || 0) + 1);
  }

  const userIds = Array.from(new Set(Array.from(jumlah.keys()).concat(Array.from(kiraan.keys()))));
  return userIds
    .map((user_id) => ({
      user_id,
      nama: namaRanking(namaById, user_id),
      skor: jumlah.get(user_id) || 0,
      diluluskan: kiraan.get(user_id) || 0,
    }))
    .sort((a, b) => {
      if (a.skor !== b.skor) return b.skor - a.skor;
      if (a.diluluskan !== b.diluluskan) return b.diluluskan - a.diluluskan;
      if (a.nama !== b.nama) return a.nama < b.nama ? -1 : 1;
      return a.user_id < b.user_id ? -1 : 1;
    });
}

/* =========================================================
 * Token jawapan moderasi (URL selamat)
 * ========================================================= */

export interface TokenJawapan {
  jenis: 'teks' | 'url';
  nilai: string;
}

/**
 * URL sah hanya bila skema http atau https. Skema lain (javascript:,
 * data:, mailto:) ditolak supaya tidak pernah menjadi href pautan.
 * Rentetan mesti dianggap URL oleh pelayar (try/catch new URL) dan
 * hostname wajib ada.
 */
export function urlSelamat(teks: string): string | null {
  const bersih = String(teks || '').trim();
  if (!/^https?:\/\//i.test(bersih)) return null;
  try {
    const u = new URL(bersih);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Pecah jawapan kepada token: perkataan yang ialah URL http/https sah
 * menjadi token url (dipaparkan sebagai pautan noopener), selebihnya
 * teks biasa. Rentetan dengan banyak ruang dikekalkan dengan menyertai
 * semula ruang antara token; pemaparan akhir guna whitespace-pre-wrap.
 */
export function tokenJawapan(answer: string | null | undefined): TokenJawapan[] {
  const teks = String(answer ?? '');
  if (teks.length === 0) return [];
  const out: TokenJawapan[] = [];
  // Pemisah dengan tangkapan mengekalkan ruang sebagai token sendiri.
  const tolakTeks = (nilai: string) => {
    const sebelum = out[out.length - 1];
    if (sebelum && sebelum.jenis === 'teks') sebelum.nilai += nilai;
    else out.push({ jenis: 'teks', nilai });
  };
  const bahagian = teks.split(/(\s+)/);
  for (const b of bahagian) {
    if (b.length === 0) continue;
    if (/^\s+$/.test(b)) {
      // Ruang digabung ke token teks sedia ada supaya rehat baris asal kekal.
      tolakTeks(b);
      continue;
    }
    const url = urlSelamat(b);
    if (url) out.push({ jenis: 'url', nilai: url });
    else tolakTeks(b);
  }
  return out;
}

/**
 * Ringkas jawapan untuk sel jadual: dipotong ke panjang maksimum tanpa
 * memotong di tengah perkataan bila boleh, dan elipsis ditambah.
 */
export function ringkasJawapan(answer: string | null | undefined, max = 80): string {
  const teks = String(answer ?? '').trim();
  if (teks.length <= max) return teks;
  const potong = teks.slice(0, max);
  const ruang = potong.lastIndexOf(' ');
  return (ruang > max * 0.6 ? potong.slice(0, ruang) : potong) + '...';
}
