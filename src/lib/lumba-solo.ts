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
/**
 * KZ-UTT: tetingkap jawab mod ujian (T1, T2, T3). Mesti sama dengan
 * UJIAN_JAWAB_TETINGKAH_MS dalam enjin klien (lumbaSoloEnjin.ts).
 */
export const UJIAN_SOALAN_TETINGKAH_MS = 45_000;
/** KZ-UTT: titik pengukuran yang sah. */
export const TITIK_UKUR = ['T1', 'T2', 'T3'] as const;
export type TitikUkur = (typeof TITIK_UKUR)[number];

/** KZ-UTT: titik pengukuran sah atau null. */
export function sahkanTitikUkur(t: unknown): TitikUkur | null {
  return typeof t === 'string' && (TITIK_UKUR as readonly string[]).includes(t) ? (t as TitikUkur) : null;
}

/** KZ-UTT: tetingkap jawab pelayan bagi larian (45 s mod ujian, 30 s biasa). */
export function tetingkahSoalan(ujian: boolean): number {
  return ujian ? UJIAN_SOALAN_TETINGKAH_MS : SOALAN_TETINGKAH_MS;
}

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
export function kiraMata(
  points: number,
  ms: number,
  betul: boolean,
  tetingkah: number = SOALAN_TETINGKAH_MS,
): number {
  if (!betul) return 0;
  const t = Math.max(0, ms);
  if (t > tetingkah) return 0;
  const bonus = 0.5 * Math.max(0, 1 - t / tetingkah);
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

/* ============================================================
 * KZ-UTT Fasa 2: item tinjauan (logik tulen, diuji selftest-kz-utt)
 * ============================================================ */

/** Had bilangan item tinjauan bagi satu kuiz. */
export const TINJAUAN_MAX_ITEM = 40;

/** Item tinjauan yang sudah disahkan (bentuk simpanan). */
export interface ItemTinjauan {
  code: string | null;
  construct: string | null;
  prompt: string;
  scale_min: number;
  scale_max: number;
  label_min: string | null;
  label_max: string | null;
  points: TitikUkur[];
}

function teksPilihan(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Sahkan satu item tinjauan daripada badan permintaan pendidik. Skala hanya
 * 0 hingga 10 (MAILS) atau 1 hingga N (N 2 hingga 10). Pulangkan ralat dalam
 * Bahasa Inggeris kerana klien memaparkannya terus (istilah UI).
 */
export function sahkanItemTinjauan(raw: unknown): { item: ItemTinjauan | null; ralat: string | null } {
  if (!raw || typeof raw !== 'object') return { item: null, ralat: 'Invalid item.' };
  const r = raw as Record<string, unknown>;
  const prompt = typeof r.prompt === 'string' ? r.prompt.trim() : '';
  if (!prompt || prompt.length > 500) return { item: null, ralat: 'Each item needs a prompt of 1 to 500 characters.' };
  const min = Number(r.scale_min);
  const max = Number(r.scale_max);
  if (!Number.isInteger(min) || (min !== 0 && min !== 1)) {
    return { item: null, ralat: 'scale_min must be 0 or 1.' };
  }
  if (!Number.isInteger(max) || max < 2 || max > 10 || max <= min) {
    return { item: null, ralat: 'scale_max must be 2 to 10 and above scale_min.' };
  }
  const titikMentah = Array.isArray(r.points) ? r.points : ['T1', 'T2', 'T3'];
  const points: TitikUkur[] = [];
  for (const t of titikMentah) {
    const s = sahkanTitikUkur(t);
    if (!s) return { item: null, ralat: 'points must contain only T1, T2 or T3.' };
    if (!points.includes(s)) points.push(s);
  }
  if (points.length === 0) return { item: null, ralat: 'Each item needs at least one point (T1, T2 or T3).' };
  points.sort();
  return {
    item: {
      code: teksPilihan(r.code, 40),
      construct: teksPilihan(r.construct, 40),
      prompt,
      scale_min: min,
      scale_max: max,
      label_min: teksPilihan(r.label_min, 80),
      label_max: teksPilihan(r.label_max, 80),
      points,
    },
    ralat: null,
  };
}

/** Nilai jawapan tinjauan sah jika integer dalam julat skala item. */
export function nilaiTinjauanSah(item: { scale_min: number; scale_max: number }, v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isInteger(n) || n < item.scale_min || n > item.scale_max) return null;
  return n;
}
