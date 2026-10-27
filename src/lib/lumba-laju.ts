/**
 * Logik tulen mod Lumba Laju (Speed Race), KZ-012.
 *
 * Tiada import Supabase atau next/server di sini supaya modul ini selamat
 * diimport oleh komponen klien dan diuji dengan scripts/selftest-kz012.ts.
 * Pengiraan maju, nitro dan markah sebenar berlaku dalam fungsi pangkalan
 * data qm_race_submit (migrasi 0058); fungsi di sini hanya untuk paparan,
 * pengesahan input dan anggaran.
 */

export const RACE_MIN_MINUTES = 1;
export const RACE_MAX_MINUTES = 60;
export const RACE_DEFAULT_MINUTES = 5;

/** Mod permainan sesi. */
export type ModPermainan = 'classic' | 'race' | 'boss';

/** Integer 1..60 sahaja; selain itu null. Rentetan nombor bulat diterima. */
export function sahMinitLumba(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) n = Number(v);
  else return null;
  if (!Number.isInteger(n)) return null;
  if (n < RACE_MIN_MINUTES || n > RACE_MAX_MINUTES) return null;
  return n;
}

/** Sahkan mod permainan daripada badan permintaan. Tiada = classic. */
export function sahModPermainan(v: unknown): ModPermainan | null {
  if (v === undefined || v === null || v === '') return 'classic';
  if (v === 'classic' || v === 'race' || v === 'boss') return v;
  return null;
}

export interface NilaiLumba {
  base: number;
  nitro: number;
  streak: number;
}
export const NILAI_LALAI: NilaiLumba = { base: 5, nitro: 3, streak: 2 };

export interface ProfilAnggaran {
  nama: 'laju' | 'biasa' | 'lemah';
  /** Jawapan yang perlu untuk sampai penamat. */
  jumlah: number;
  /** Jawapan yang sempat dibuat dalam masa lumba. */
  dalamMasa: number;
  sampai: boolean;
  saatSampai: number;
}

const PROFIL = [
  { nama: 'laju' as const, peratus: 1, nitroPurata: 1, faktorBonus: 1 / 3, saat: 4 },
  { nama: 'biasa' as const, peratus: 0.7, nitroPurata: 0.4, faktorBonus: 0.16, saat: 5 },
  { nama: 'lemah' as const, peratus: 0.55, nitroPurata: 0.2, faktorBonus: 0.08, saat: 8 },
];

/**
 * Berapa soalan perlu ada supaya pelajar yang paling banyak menjawab pun tidak
 * berjumpa soalan yang sama. Setiap profil menjawab sehingga sampai penamat
 * atau masa habis, mana yang dahulu. Cadangan = jumlah tertinggi, dibundar
 * ke atas kepada gandaan 5, minimum 5.
 */
export function cadanganSoalan(
  minit: number,
  nilai: NilaiLumba = NILAI_LALAI,
): { disyorkan: number; profil: ProfilAnggaran[] } {
  const saatLumba = Math.max(0, minit) * 60;
  const profil = PROFIL.map((p) => {
    const maju = nilai.base + nilai.nitro * p.nitroPurata + nilai.streak * p.faktorBonus;
    const betulPerlu = Math.ceil(100 / Math.max(maju, 0.01));
    const jumlah = Math.ceil(betulPerlu / p.peratus);
    const dalamMasa = Math.floor(saatLumba / p.saat);
    const saatSampai = jumlah * p.saat;
    return {
      nama: p.nama,
      jumlah,
      dalamMasa,
      sampai: saatSampai <= saatLumba,
      saatSampai,
    };
  });
  const dilihat = Math.max(...profil.map((p) => Math.min(p.jumlah, p.dalamMasa)));
  const disyorkan = Math.max(5, Math.ceil(dilihat / 5) * 5);
  return { disyorkan, profil };
}

/** Berapa kali setiap soalan dijangka muncul dalam satu lumba. */
export function ulanganSoalan(disyorkan: number, bilSoalan: number): number {
  if (bilSoalan <= 0) return 0;
  if (bilSoalan >= disyorkan) return 1;
  return Math.ceil(disyorkan / bilSoalan);
}

export interface BarisPapanLumba {
  id: string;
  nickname: string;
  score: number;
  race_distance: number | string | null;
  race_rank: number | null;
}

/**
 * Susun pemain: yang sudah sampai ikut kedudukan sampai, kemudian jarak
 * menurun, markah menurun, dan nama. `kedudukan` 1..N (tiada seri).
 */
export function susunPapan<T extends BarisPapanLumba>(pemain: T[]): (T & { kedudukan: number })[] {
  const jarak = (p: BarisPapanLumba) => Number(p.race_distance) || 0;
  const rank = (p: BarisPapanLumba) =>
    typeof p.race_rank === 'number' && p.race_rank > 0 ? p.race_rank : Number.POSITIVE_INFINITY;
  return [...pemain]
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        jarak(b) - jarak(a) ||
        (Number(b.score) || 0) - (Number(a.score) || 0) ||
        (a.nickname < b.nickname ? -1 : a.nickname > b.nickname ? 1 : 0),
    )
    .map((p, i) => ({ ...p, kedudukan: i + 1 }));
}

export interface BarisJawapanLumba {
  player_id: string;
  choice_key: string;
  is_correct: boolean;
  attempt: number | null;
}

export interface TaburanPertama {
  /** Bilangan pemilih setiap pilihan pada cubaan pertama. */
  pilihan: Record<string, number>;
  jumlahPertama: number;
  betulPertama: number;
  /** Satu titik perpuluhan, null bila tiada jawapan. */
  peratusBetulPertama: number | null;
  jumlahSemuaCubaan: number;
}

/** Taburan jawapan cubaan pertama bagi SATU soalan. */
export function taburanCubaanPertama(
  jawapan: BarisJawapanLumba[],
  kunciPilihan: string[],
): TaburanPertama {
  const pilihan: Record<string, number> = {};
  for (const k of kunciPilihan) pilihan[k] = 0;
  let jumlahPertama = 0;
  let betulPertama = 0;
  for (const a of jawapan) {
    if ((a.attempt ?? 1) !== 1) continue;
    jumlahPertama += 1;
    if (a.is_correct) betulPertama += 1;
    pilihan[a.choice_key] = (pilihan[a.choice_key] ?? 0) + 1;
  }
  return {
    pilihan,
    jumlahPertama,
    betulPertama,
    peratusBetulPertama:
      jumlahPertama > 0 ? Math.round((betulPertama / jumlahPertama) * 1000) / 10 : null,
    jumlahSemuaCubaan: jawapan.length,
  };
}

/** Baki nitro 0..1: penuh serta-merta, sifar selepas separuh had masa. */
export function nitroBaki(servedAtMs: number, nowMs: number, hadSaat: number): number {
  if (!Number.isFinite(servedAtMs) || !Number.isFinite(nowMs) || !(hadSaat > 0)) return 0;
  const lalu = Math.max(0, nowMs - servedAtMs);
  return Math.max(0, Math.min(1, 1 - lalu / (hadSaat * 500)));
}

/* ============================================================
 * Masa bonus kelajuan ditetapkan guru (KZ-032). Guru memilih
 * tempoh bonus sesi semasa Start session; bar pemain dan
 * pengiraan nitro/kritikal di pelayan (migrasi 0067) mesti guna
 * tempoh yang sama. BUKAN had masa: jawapan selepas bar habis
 * masih diterima, hanya bonus yang hilang.
 * ============================================================ */

/** Nilai tempoh bonus yang sah, keputusan Boss 27 Okt 2026. */
export const NILAI_BONUS_SEC = [15, 30, 45, 60] as const;

/** Tempoh bonus lalai untuk sesi lama yang tiada race_bonus_sec. */
export const BONUS_LALAI_SEC = 30;

/** Sahkan tempoh bonus daripada badan permintaan; 15/30/45/60 sahaja. */
export function sahBonusKelajuan(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) n = Number(v);
  else return null;
  if (!Number.isInteger(n)) return null;
  return (NILAI_BONUS_SEC as readonly number[]).includes(n) ? n : null;
}

/**
 * Baki bonus kelajuan 0..1: penuh serta-merta, sifar selepas tempoh
 * bonus guru (bonusSec saat) habis. Menggantikan nitroBaki pada bar
 * pemain race/boss mulai KZ-032; nitroBaki kekal supaya padanan formula
 * lama dalam selftest-live-quiz tidak berubah.
 */
export function bonusBaki(servedAtMs: number, nowMs: number, bonusSec: number): number {
  if (!Number.isFinite(servedAtMs) || !Number.isFinite(nowMs) || !(bonusSec > 0)) return 0;
  const lalu = Math.max(0, nowMs - servedAtMs);
  return Math.max(0, Math.min(1, 1 - lalu / (bonusSec * 1000)));
}

/** Akhiran ordinal Inggeris: 1st, 2nd, 3rd, 4th, 11th, 21st, 112th. */
export function ordinal(n: number): string {
  const v = Math.abs(Math.trunc(n));
  const s = v % 100;
  if (s >= 11 && s <= 13) return `${v}th`;
  switch (v % 10) {
    case 1: return `${v}st`;
    case 2: return `${v}nd`;
    case 3: return `${v}rd`;
    default: return `${v}th`;
  }
}

/** Jam baki mm:ss daripada milisaat (tidak negatif). */
export function formatJam(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Kocok salinan senarai (Fisher-Yates). `rawak` boleh disuntik untuk ujian. */
export function kocok<T>(senarai: T[], rawak: () => number = Math.random): T[] {
  const b = senarai.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rawak() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/* ============================================================
 * Mod Lawan Raksasa (Boss Battle), KZ-013. Fungsi tulen sahaja;
 * pengiraan sebenar nyawa dan kerosakan berlaku dalam fungsi
 * pangkalan data qm_boss_* (migrasi 0060).
 * ============================================================ */

/** Pemalar kesukaran raksasa: nyawa setiap pemain setiap minit. */
export const TAHAP_RAKSASA = { easy: 55, medium: 65, hard: 70 } as const;
export type TahapRaksasa = keyof typeof TAHAP_RAKSASA;

/**
 * Sahkan tahap raksasa daripada badan permintaan. Tiada atau kosong = medium
 * (lalai), supaya klien lama yang tidak menghantar bossLevel tetap berfungsi.
 */
export function sahTahapRaksasa(v: unknown): TahapRaksasa | null {
  if (v === undefined || v === null || v === '') return 'medium';
  if (v === 'easy' || v === 'medium' || v === 'hard') return v;
  return null;
}

/** Nyawa raksasa: bilangan pemain x minit x k, sekurang-kurangnya 1. */
export function nyawaRaksasa(bilPemain: number, minit: number, k: number): number {
  const n = Math.max(0, Math.floor(bilPemain));
  const m = Math.max(0, Math.floor(minit));
  return Math.max(1, Math.round(n * m * k));
}

/**
 * Bilangan soalan yang disyorkan untuk satu pertarungan supaya soalan tidak
 * berulang. Pelajar biasa menjawab setiap 5 saat, jadi jumlah jawapan yang
 * sempat dibuat ialah floor(minit*60/5); dibundar ke atas kepada gandaan 5,
 * minimum 5. Rujukan: 1 minit -> 15, 3 minit -> 40, 5 minit -> 60.
 */
export function cadanganSoalanRaksasa(minit: number): number {
  const jawapan = Math.floor(Math.max(0, minit) * 60 / 5);
  return Math.max(5, Math.ceil(jawapan / 5) * 5);
}

/**
 * Jangkaan hasil pertarungan bagi panel guru (Inggeris, untuk pengguna),
 * daripada simulasi CTO 400 pertarungan setiap tahap pada kelas biasa.
 */
export function jangkaanRaksasa(tahap: TahapRaksasa): string {
  switch (tahap) {
    case 'easy':
      return 'The class almost always wins; the boss usually falls about three quarters of the way through.';
    case 'hard':
      return 'A tense fight; a less accurate class can lose, especially in short battles.';
    default:
      return 'The class usually wins in the final moments (around 85% of the time used).';
  }
}

export interface BarisPenyerang {
  id: string;
  nickname: string;
  boss_damage: number | string | null;
}

/**
 * Susun penyerang: kerosakan menurun, seri dipecahkan ikut nama (huruf kecil)
 * menaik. `kedudukan` 1..N. Peraturan yang sama dengan qm_boss_state.position
 * supaya skrin guru dan telefon pemain sepadan.
 */
export function susunPenyerang<T extends BarisPenyerang>(pemain: T[]): (T & { kedudukan: number })[] {
  return [...pemain]
    .sort(
      (a, b) =>
        (Number(b.boss_damage) || 0) - (Number(a.boss_damage) || 0) ||
        (a.nickname.toLowerCase() < b.nickname.toLowerCase() ? -1
          : a.nickname.toLowerCase() > b.nickname.toLowerCase() ? 1 : 0),
    )
    .map((p, i) => ({ ...p, kedudukan: i + 1 }));
}

export type FasaRaksasa = 'calm' | 'angry' | 'rage';

/**
 * Fasa raksasa ikut baki nyawa: calm bila melebihi 50%, angry bila melebihi
 * 25%, rage selainnya. maxHp 0 (belum bermula) dianggap calm.
 */
export function fasaRaksasa(hp: number, maxHp: number): FasaRaksasa {
  if (!(maxHp > 0)) return 'calm';
  const nisbah = hp / maxHp;
  if (nisbah > 0.5) return 'calm';
  if (nisbah > 0.25) return 'angry';
  return 'rage';
}

/** Tindakan kawalan mod perbincangan (hanya sesi race yang sudah tamat). */
export const TINDAKAN_REVIEW = [
  'review_start',
  'review_next',
  'review_prev',
  'review_reveal',
  'review_end',
] as const;
export type TindakanReview = (typeof TINDAKAN_REVIEW)[number];

/**
 * Keadaan review seterusnya. Pulangkan ralat (mesej Inggeris untuk pengguna)
 * atau indeks dan status dedah baharu.
 */
export function langkahReview(
  tindakan: TindakanReview,
  indeks: number,
  jumlahSoalan: number,
): { ok: true; index: number; revealed: boolean | null } | { ok: false; error: string } {
  if (jumlahSoalan <= 0) return { ok: false, error: 'This quiz has no questions.' };
  switch (tindakan) {
    case 'review_start':
      return { ok: true, index: 0, revealed: false };
    case 'review_end':
      return { ok: true, index: -1, revealed: false };
    case 'review_reveal':
      if (indeks < 0) return { ok: false, error: 'Start the question review first.' };
      return { ok: true, index: indeks, revealed: true };
    case 'review_next':
      if (indeks < 0) return { ok: false, error: 'Start the question review first.' };
      if (indeks >= jumlahSoalan - 1) return { ok: false, error: 'This is the last question.' };
      return { ok: true, index: indeks + 1, revealed: false };
    case 'review_prev':
      if (indeks < 0) return { ok: false, error: 'Start the question review first.' };
      if (indeks <= 0) return { ok: false, error: 'This is the first question.' };
      return { ok: true, index: indeks - 1, revealed: false };
  }
}
