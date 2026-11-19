/**
 * KZ-053: logik tulen Lumba Solo. Tiada DOM, tiada Supabase: boleh diuji
 * dengan npx tsx dan diguna oleh laluan API pelayan.
 *
 * Keselamatan: fail ini TIDAK membaca atau memulangkan correct_key; ia
 * hanya mengira markah pelayan, menyusun papan dan mengesahkan input.
 * Markah sebenar sentiasa dikira di sini (pelayan), bukan di klien.
 *
 * Bahagian node:crypto hanya selamat di pelayan dan skrip ujian; JANGAN
 * import fail ini daripada komponen klien (klien menerima markah daripada
 * respons API sahaja).
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/* ============================================================
 * Pemalar permainan (KZ-053)
 * ============================================================ */

/** Maksimum soalan dalam satu larian; kelebihan dibuang selepas kocok. */
export const SOLO_MAX_SOALAN = 30;
/** Kuiz mesti sekurang-kurangnya ini banyak soalan serasi Live. */
export const SOLO_MIN_SOALAN = 3;
/** Tetingkap jawab setiap soal, dikira di pelayan daripada served_at. */
export const SOALAN_TETINGKAH_MS = 30_000;
/** Larian playing lebih lama daripada ini dianggap tergendala (expired). */
export const LARIAN_EXP_MS = 30 * 60 * 1000;
/** Had kadar: maksimum larian dimulakan dalam tetingkap kadar. */
export const KADAR_MAX_LARIAN = 20;
/** Tetingkap had kadar. */
export const KADAR_TETINGKAH_MS = 10 * 60 * 1000;
/** Bilangan baris papan yang dipaparkan. */
export const PAPAR_PAPAN = 10;
/** Pertanyaan DB boleh mengambil larian finished terbaik setakat ini;
 * susunan "terbaik per pemain" selesai dalam kod supaya logik boleh diuji. */
export const PAPAR_MAX_DB = 500;
/** Panjang maksimum nickname (selari kekangan qm_solo_runs). */
export const NICKNAME_MAX = 24;

/**
 * Abjad kod solo: huruf besar dan nombor TANPA 0, O, 1 dan I supaya kod
 * tidak boleh salah baca. Enam aksara, contoh KZ53AA.
 */
export const ABJAD_KOD_SOLO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Kod solo sah: 6 aksara daripada abjad tanpa keliru. */
export function sahkanKodSolo(kod: unknown): boolean {
  return typeof kod === 'string' &&
    new RegExp(`^[${ABJAD_KOD_SOLO}]{6}$`).test(kod);
}

/** Jana kod solo baharu (pelayan; guna RNG kripto supaya tidak boleh jangka). */
export function janaKodSolo(): string {
  let keluar = '';
  for (let i = 0; i < 6; i++) {
    keluar += ABJAD_KOD_SOLO[randomInt(ABJAD_KOD_SOLO.length)];
  }
  return keluar;
}

/**
 * Sahkan nickname bebas: buang ruang lebih, 1 hingga 24 aksara.
 * Pulangkan rentetan bersih atau null bila tidak sah. (Corak join Arena.)
 */
export function sahkanNickname(nama: unknown): string | null {
  if (typeof nama !== 'string') return null;
  const bersih = nama.trim().replace(/\s+/g, ' ');
  if (bersih.length < 1 || bersih.length > NICKNAME_MAX) return null;
  return bersih;
}

/* ============================================================
 * Markah pelayan
 * ============================================================
 * Tiket KZ-053:
 *   betul:  round(points * (1 + 0.5 * max(0, 1 - ms/30000)))
 *   salah:  0
 * Jadi betul serta-merta mendapat 1.5 kali mata, betul tepat pada saat
 * ke-30 mendapat 1.0 kali, dan lewat (ms > 30000) dikira salah oleh
 * laluan jawab, jadi tiada mata.
 */

/** Kira mata satu jawapan Lumba Solo. Satu-satunya tempat formula ini wujud. */
export function kiraMata(points: number, ms: number, betul: boolean): number {
  if (!betul) return 0;
  const t = Math.max(0, ms);
  if (t > SOALAN_TETINGKAH_MS) return 0;
  const bonus = 0.5 * Math.max(0, 1 - t / SOALAN_TETINGKAH_MS);
  const asas = Math.max(0, Math.floor(points));
  return Math.round(asas * (1 + bonus));
}

/* ============================================================
 * Kocokan soalan
 * ============================================================ */

/**
 * Kocok senarai (Fisher-Yates, salinan; input tidak diubah). Fungsi rawak
 * boleh dijinjak untuk ujian. Deterministik bila rng tetap.
 */
export function kocok<T>(senarai: readonly T[], rng: () => number = Math.random): T[] {
  const keluar = [...senarai];
  for (let i = keluar.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const sementara = keluar[i] as T;
    keluar[i] = keluar[j] as T;
    keluar[j] = sementara;
  }
  return keluar;
}

/* ============================================================
 * Papan top scorer
 * ============================================================ */

/** Baris larian finished seperti dibaca daripada pangkalan data. */
export interface BarisLarianPapan {
  id: string;
  nickname: string;
  userId: string | null;
  score: number;
  elapsedMs: number | null;
  finishedAt: string | null;
}

/** Baris papan siap disusun dengan kedudukan. */
export interface BarisPapan {
  rank: number;
  runId: string;
  nickname: string;
  score: number;
  elapsedMs: number | null;
  finishedAt: string | null;
}

/**
 * Banding dua baris larian untuk susunan papan: markah menurun, kemudian
 * masa menaik (null di belakang), kemudian siap lebih awal dahulu.
 */
export function bandingPapan(a: BarisLarianPapan, b: BarisLarianPapan): number {
  if (a.score !== b.score) return b.score - a.score;
  const ea = a.elapsedMs ?? Number.MAX_SAFE_INTEGER;
  const eb = b.elapsedMs ?? Number.MAX_SAFE_INTEGER;
  if (ea !== eb) return ea - eb;
  const fa = a.finishedAt ?? '';
  const fb = b.finishedAt ?? '';
  return fa < fb ? -1 : fa > fb ? 1 : 0;
}

/** Kunci pemain papan: user_id jika ada, jika tidak nickname kecil. */
export function kunciPemain(r: BarisLarianPapan): string {
  return r.userId ?? 'g:' + r.nickname.toLowerCase();
}

/**
 * Topeng nama untuk papan awam kuiz berkelas (PDPA, pelajar bawah umur):
 * setiap perkataan menjadi huruf pertama diikuti titik, contoh
 * "Siti Nur Aisyah" -> "S. N. A.". Nama kosong -> "?".
 */
export function topengNama(nama: string): string {
  const huruf = nama
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => Array.from(p)[0]!.toUpperCase() + '.');
  return huruf.length ? huruf.join(' ') : '?';
}

/** Papan dengan nama bertopeng (untuk pemanggil yang bukan ahli kelas). */
export function topengPapan(papan: readonly BarisPapan[]): BarisPapan[] {
  return papan.map((r) => ({ ...r, nickname: topengNama(r.nickname) }));
}

/**
 * Susun papan: SATU baris terbaik bagi setiap pemain (kunci user_id jika
 * ada, jika tidak lower(nickname)), tertib markah menurun kemudian masa
 * menaik, potong kepada 10 teratas.
 */
export function susunPapan(larian: readonly BarisLarianPapan[]): BarisPapan[] {
  const terbaik = new Map<string, BarisLarianPapan>();
  for (const r of larian) {
    const k = kunciPemain(r);
    const sedia = terbaik.get(k);
    if (!sedia || bandingPapan(r, sedia) < 0) terbaik.set(k, r);
  }
  return Array.from(terbaik.values())
    .sort(bandingPapan)
    .slice(0, PAPAR_PAPAN)
    .map((r, i) => ({
      rank: i + 1,
      runId: r.id,
      nickname: r.nickname,
      score: r.score,
      elapsedMs: r.elapsedMs,
      finishedAt: r.finishedAt,
    }));
}

/**
 * Kedudukan satu larian dalam papan penuh (sebelum dipotong 10): 1 teratas,
 * null bila larian tiada dalam senarai (contohnya belum finished).
 */
export function kedudukanPapan(
  larian: readonly BarisLarianPapan[],
  runId: string,
): number | null {
  const terbaik = new Map<string, BarisLarianPapan>();
  for (const r of larian) {
    const k = kunciPemain(r);
    const sedia = terbaik.get(k);
    if (!sedia || bandingPapan(r, sedia) < 0) terbaik.set(k, r);
  }
  const tertib = Array.from(terbaik.values()).sort(bandingPapan);
  const idx = tertib.findIndex((r) => r.id === runId);
  return idx === -1 ? null : idx + 1;
}

/* ============================================================
 * Token larian
 * ============================================================ */

/** Hash token larian untuk disimpan (sha256 hex). Token mentah tidak disimpan. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Banding token mentah dengan hash disimpan secara timing-safe. Kes
 * panjang tidak sepadan tetap menjalankan perbandingan supaya masa fungsi
 * tidak mendedahkan sama ada hash itu sah.
 */
export function tokenSama(token: string, hash: string): boolean {
  const dihitung = createHash('sha256').update(token, 'utf8').digest();
  const simpan = Buffer.from(hash, 'hex');
  if (simpan.length !== dihitung.length) {
    timingSafeEqual(dihitung, dihitung);
    return false;
  }
  return timingSafeEqual(dihitung, simpan);
}

/** Masa larian dalam ms, dikira pelayan daripada cap masa mula dan tamat. */
export function kiraElapsedMs(startedAt: string, finishedAt: string): number {
  const mula = Date.parse(startedAt);
  const tamat = Date.parse(finishedAt);
  if (!Number.isFinite(mula) || !Number.isFinite(tamat)) return 0;
  return Math.max(0, Math.round(tamat - mula));
}

/** Hash IP permintaan: hanya hash yang disimpan, bukan alamat mentah. */
export function hashIp(ip: string): string {
  return createHash('sha256').update('qm-solo:' + ip, 'utf8').digest('hex');
}
