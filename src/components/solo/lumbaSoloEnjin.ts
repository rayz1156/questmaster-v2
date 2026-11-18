/**
 * KZ-053: enjin permainan Lumba Solo. TULEN: tiada DOM, tiada canvas, tiada
 * import; boleh diuji tanpa pelayar (selftest-kz053) dan dibundel ke klien.
 *
 * Semua markah sebenar datang daripada pelayan; kedudukan melawan kereta
 * komputer di sini hiasan semata dan tidak disimpan. Had laju, penalti dan
 * penamat mengikut tiket KZ-053:
 *   - had laju bermula 120 km/j, betul +20 (maksimum 240);
 *   - salah atau tamat masa: penalti 8 saat pada separuh had laju;
 *   - keluar jalan memperlahankan kereta;
 *   - soalan muncul setiap 15 saat, kereta bergerak perlahan sendiri
 *     (autopilot) semasa soalan dibuka.
 */

/** Had laju awal km/j. */
export const HAD_LAJU_AWAL = 120;
/** Had laju maksimum km/j selepas jawapan betul berulang. */
export const HAD_LAJU_MAX = 240;
/** Tambahan had laju bagi setiap jawapan betul. */
export const BONUS_BETUL = 20;
/** Tempoh penalti selepas jawapan salah atau tamat masa, dalam saat. */
export const PENALTI_SAAT = 8;
/** Kelajuan tetap kereta komputer (km/j), 2 lawan. */
export const KELAJUAN_KOMPUTER = [150, 175] as const;
/** Panjang trek; memberi kira-kira 90 hingga 150 saat pada had purata. */
export const TREK_PANJANG_M = 4800;
/** Soalan baharu dibuka setiap 15 saat masa simulasi. */
export const SOALAN_SETIAP_MS = 15_000;
/** Separuh lebar jalan: |offset| melebihi ini bermakna keluar jalan. */
export const SEPARUH_JALAN_M = 3.5;
/** Offset lateral maksimum (kereta tidak boleh hilang jauh). */
export const OFFSET_MAX_M = 6;
/** Kadar perubahan offset lateral, meter sesaat. */
export const KADAR_OFFSET_M_S = 5;

/** Input pemandu pada satu bingkai (kekunci atau butang sentuh). */
export interface InputPemandu {
  kiri: boolean;
  kanan: boolean;
  pecut: boolean;
  brek: boolean;
}

export const TIADA_INPUT: InputPemandu = { kiri: false, kanan: false, pecut: false, brek: false };

/** Keadaan simulasi satu larian; dikemas kini dalam tempat oleh langkahLumba. */
export interface KeadaanLumba {
  /** Masa simulasi sejak mula, ms. */
  masaMs: number;
  /** Jarak dilalui pemain, meter. */
  jarakM: number;
  /** Kelajuan semasa pemain, km/j. */
  kelajuan: number;
  /** Had laju semasa (berubah dengan jawapan), km/j. */
  hadLaju: number;
  /** Masa penalti berakhir, atau null bila tiada penalti. */
  penaltiTamatMs: number | null;
  /** Offset lateral dari tengah jalan, meter (positif ke kanan). */
  offsetM: number;
  /** Kereta di luar jalan pada bingkai terakhir. */
  diLuarJalan: boolean;
  /** Bilangan soalan yang sudah dibuka. */
  soalanKe: number;
  /** Masa soalan semasa dibuka, atau null bila tiada soalan terbuka. */
  soalanDibukaMs: number | null;
  /** Bilangan soalan yang sudah dijawab (atau ditutup). */
  soalanDijawab: number;
  /** Kereta sampai garisan penamat. */
  selesai: boolean;
}

/** Keadaan awal larian. */
export function ciptaKeadaanLumba(): KeadaanLumba {
  return {
    masaMs: 0,
    jarakM: 0,
    kelajuan: 0,
    hadLaju: HAD_LAJU_AWAL,
    penaltiTamatMs: null,
    offsetM: 0,
    diLuarJalan: false,
    soalanKe: 0,
    soalanDibukaMs: null,
    soalanDijawab: 0,
    selesai: false,
  };
}

/** Penalti sedang berkesan pada masa simulasi sekarang. */
export function penaltiAktif(k: KeadaanLumba): boolean {
  return k.penaltiTamatMs !== null && k.masaMs < k.penaltiTamatMs;
}

/** Had laju berkesan: separuh semasa penalti (sekurang-kurangnya 30 km/j). */
export function hadLajuEfektif(k: KeadaanLumba): number {
  return penaltiAktif(k) ? Math.max(30, k.hadLaju / 2) : k.hadLaju;
}

/** Jawapan betul: had laju naik, bercuak pada 240. */
export function jawabBetul(k: KeadaanLumba): void {
  k.hadLaju = Math.min(HAD_LAJU_MAX, k.hadLaju + BONUS_BETUL);
}

/** Jawapan salah atau tamat masa: penalti 8 saat pada separuh had laju. */
export function jawabSalah(k: KeadaanLumba): void {
  k.penaltiTamatMs = k.masaMs + PENALTI_SAAT * 1000;
}

/** Buka soalan baharu; kereta masuk mod autopilot perlahan. */
export function bukaSoalan(k: KeadaanLumba): void {
  k.soalanDibukaMs = k.masaMs;
  k.soalanKe += 1;
}

/** Tutup soalan semasa (dijawab atau diabaikan selepas tetingkap tamat). */
export function tutupSoalan(k: KeadaanLumba): void {
  if (k.soalanDibukaMs !== null) {
    k.soalanDibukaMs = null;
    k.soalanDijawab += 1;
  }
}

/** Masa berlalu sejak soalan semasa dibuka, atau null bila tiada soalan. */
export function masaSoalanBerlalu(k: KeadaanLumba): number | null {
  return k.soalanDibukaMs === null ? null : k.masaMs - k.soalanDibukaMs;
}

/** Masanya untuk membuka soalan baharu (tiada soalan terbuka, setiap 15 saat). */
export function perluSoalan(k: KeadaanLumba): boolean {
  return (
    !k.selesai &&
    k.soalanDibukaMs === null &&
    k.masaMs >= k.soalanKe * SOALAN_SETIAP_MS
  );
}

/** Jarak kereta komputer ke-i pada masa simulasi tertentu, meter. */
export function jarakKomputer(index: 0 | 1, masaMs: number): number {
  const kmj = KELAJUAN_KOMPUTER[index];
  return (kmj / 3.6) * (masaMs / 1000);
}

/**
 * Kedudukan pemain 1 hingga 3 berbanding dua kereta komputer pada masa
 * simulasi keadaan itu. Hiasan sahaja; tidak disimpan di mana-mana.
 */
export function kedudukanPemain(k: KeadaanLumba): 1 | 2 | 3 {
  let pos: 1 | 2 | 3 = 1;
  if (jarakKomputer(0, k.masaMs) > k.jarakM) pos = (pos + 1) as 1 | 2 | 3;
  if (jarakKomputer(1, k.masaMs) > k.jarakM) pos = (pos + 1) as 1 | 2 | 3;
  return pos;
}

/**
 * Kemas kini simulasi satu bingkai. dtMs dihadkan kepada 100 ms supaya
 * lompatan bingkai tidak melompat fizik; pemanggil berhenti apabila tab
 * tersembunyi, jadi lompatan besar tidak sepatutnya berlaku.
 */
export function langkahLumba(k: KeadaanLumba, dtMs: number, input: InputPemandu): void {
  if (k.selesai) return;
  const dt = Math.min(100, Math.max(0, dtMs)) / 1000;
  if (dt <= 0) return;
  k.masaMs += Math.max(0, dtMs);

  const had = hadLajuEfektif(k);

  let sasaran: number;
  if (k.soalanDibukaMs !== null) {
    // Autopilot semasa soalan: perlahan dan kembali ke tengah jalan.
    sasaran = had * 0.5;
    k.offsetM += (0 - k.offsetM) * Math.min(1, dt / 0.8);
  } else {
    if (input.brek) sasaran = 0;
    else if (input.pecut) sasaran = had;
    else sasaran = had * 0.75;
    const arah = (input.kanan ? 1 : 0) - (input.kiri ? 1 : 0);
    k.offsetM += arah * KADAR_OFFSET_M_S * dt;
    k.offsetM = Math.max(-OFFSET_MAX_M, Math.min(OFFSET_MAX_M, k.offsetM));
  }

  k.diLuarJalan = Math.abs(k.offsetM) > SEPARUH_JALAN_M;
  if (k.diLuarJalan) sasaran = Math.min(sasaran, had * 0.35);

  // Kelajuan menghampiri sasaran secara lembut (panduan rasa kereta).
  k.kelajuan += (sasaran - k.kelajuan) * Math.min(1, dt / 0.7);
  if (k.kelajuan < 0) k.kelajuan = 0;

  k.jarakM += (k.kelajuan / 3.6) * dt;
  if (k.jarakM >= TREK_PANJANG_M) {
    k.jarakM = TREK_PANJANG_M;
    k.selesai = true;
  }
}
