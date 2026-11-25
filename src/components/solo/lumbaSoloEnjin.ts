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
 *   - soalan pertama pada 5 saat, kemudian setiap 15 saat (rehat 4 saat
 *     selepas setiap soalan); kereta perlahan semasa soalan dibuka tetapi
 *     stereng kekal aktif (KZ-055);
 *   - trek berselekoh: tanpa stereng, kereta hanyut ke luar selekoh dan
 *     tersasar keluar jalan (KZ-056). Pemain mesti mengemudi sendiri.
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
/** Tetingkah jawab setiap soalan; melebihi ini dikira salah (tamat masa). */
export const JAWAB_TETINGKAH_MS = 30_000;
/** KZ-055: masa memandu bebas sebelum soalan pertama dibuka. */
export const SOALAN_PERTAMA_MS = 5_000;
/** KZ-055: rehat memandu minimum selepas satu soalan ditutup. */
export const REHAT_SOALAN_MS = 4_000;
/**
 * KZ-UTT (mod ujian T1, T2, T3): pemanduan 8 saat antara soalan, tetingkap
 * jawab 45 saat, kereta BERHENTI semasa soalan (tiada hanyutan, stereng atau
 * terbabas), tiada penalti atau bonus had laju (pelayan tidak mendedahkan
 * betul atau salah), dan larian tamat selepas soalan terakhir dijawab,
 * bukan ikut jarak trek.
 */
export const UJIAN_PEMANDUAN_MS = 8_000;
/** KZ-UTT: tetingkap jawab mod ujian. Mesti sama dengan pelayan (lumba-solo.ts). */
export const UJIAN_JAWAB_TETINGKAH_MS = 45_000;
/** KZ-UTT: masa memandu selepas soalan terakhir sebelum larian ditamatkan. */
export const UJIAN_LARIAN_KELUAR_MS = 3_000;
/** KZ-UTT: jarak berhenti sebelum garisan penamat jika soalan belum habis. */
export const UJIAN_RUANG_PENAMAT_M = 40;

/** Separuh lebar jalan: |offset| melebihi ini bermakna keluar jalan. */
export const SEPARUH_JALAN_M = 3.5;
/** Offset lateral maksimum (kereta tidak boleh hilang jauh). */
export const OFFSET_MAX_M = 6;
/** Kadar perubahan offset lateral, meter sesaat. */
export const KADAR_OFFSET_M_S = 6;
/** KZ-056: pekali hanyutan ke luar selekoh (m/s per v^2 x kelengkungan). */
export const PEKALI_HANYUT = 1.6;
/** KZ-056: had kadar hanyutan, meter sesaat (sentiasa di bawah kadar stereng). */
export const HANYUT_MAX_M_S = 4.2;
/** KZ-056: amplitud angin sisi (m/s pada kelajuan penuh); jalan lurus pun perlu dikawal. */
export const ANGIN_SISI_M_S = 0.8;

/* ===== Geometri trek (dikongsi dengan paparan 3D supaya selekoh sepadan) ===== */

/** Garis tengah trek pada paksi x dunia (positif = kanan pemandu). */
export function tengahTrekX(d: number): number {
  return 46 * Math.sin(d / 270) + 17 * Math.sin(d / 103 + 1.3);
}
/** Terbitan pertama tengahTrekX (cerun selekoh). */
export function cerunTrekX(d: number): number {
  return (46 / 270) * Math.cos(d / 270) + (17 / 103) * Math.cos(d / 103 + 1.3);
}
/**
 * Kelengkungan trek pada jarak d (1/meter). Positif bermaksud jalan membelok
 * ke kanan, jadi kereta hanyut ke kiri (offset negatif) jika tidak dikemudi.
 */
export function kelengkunganTrek(d: number): number {
  const dd = -(46 / (270 * 270)) * Math.sin(d / 270) - (17 / (103 * 103)) * Math.sin(d / 103 + 1.3);
  const c = cerunTrekX(d);
  return dd / Math.pow(1 + c * c, 1.5);
}

/** Kadar hanyutan lateral (m/s) pada jarak d dan kelajuan km/j. */
export function kadarHanyut(d: number, kelajuanKmj: number): number {
  const v = kelajuanKmj / 3.6;
  const masuk = Math.min(1, Math.max(0, d / 120)); // lembut dekat garisan mula
  const selekoh = -kelengkunganTrek(d) * v * v * PEKALI_HANYUT;
  const angin = ANGIN_SISI_M_S * Math.min(1, v / 25) * (Math.sin(d / 47 + 0.4) * 0.7 + Math.sin(d / 19 + 2.1) * 0.3);
  const h = (selekoh + angin) * masuk;
  return Math.max(-HANYUT_MAX_M_S, Math.min(HANYUT_MAX_M_S, h));
}

/** Input pemandu pada satu bingkai (kekunci atau butang sentuh). */
export interface InputPemandu {
  kiri: boolean;
  kanan: boolean;
  pecut: boolean;
  brek: boolean;
  /** Stereng analog -1 (kiri) hingga 1 (kanan); jika ada, menggantikan kiri/kanan. */
  stereng?: number;
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
  /** Masa soalan terakhir ditutup, atau null jika belum ada. */
  soalanDitutupMs: number | null;
  /** Kereta sampai garisan penamat. */
  selesai: boolean;
  /** KZ-UTT: larian mod ujian (kereta berhenti semasa soalan). */
  ujian: boolean;
  /** KZ-UTT: jumlah masa simulasi ketika soalan terbuka dalam mod ujian, ms. */
  jedaMs: number;
}

/** Keadaan awal larian. */
export function ciptaKeadaanLumba(ujian = false): KeadaanLumba {
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
    soalanDitutupMs: null,
    selesai: false,
    ujian,
    jedaMs: 0,
  };
}

/** KZ-UTT: tetingkap jawab bagi larian ini (45 s mod ujian, 30 s biasa). */
export function tetingkahJawab(k: KeadaanLumba): number {
  return k.ujian ? UJIAN_JAWAB_TETINGKAH_MS : JAWAB_TETINGKAH_MS;
}

/**
 * KZ-UTT: masa memandu sebenar (tolak masa soalan dalam mod ujian). Dipakai
 * untuk kereta komputer dan kedudukan supaya lawan tidak terus memecut
 * ketika pemain berhenti menjawab.
 */
export function masaPandu(k: KeadaanLumba): number {
  return Math.max(0, k.masaMs - k.jedaMs);
}

/**
 * KZ-UTT: semua soalan mod ujian sudah dijawab dan masa memandu keluar
 * selepas soalan terakhir sudah berlalu. Pemanggil kemudian menamatkan larian.
 */
export function ujianSelesai(k: KeadaanLumba, jumlahSoalan: number): boolean {
  return (
    k.ujian &&
    jumlahSoalan > 0 &&
    k.soalanDijawab >= jumlahSoalan &&
    k.soalanDibukaMs === null &&
    k.soalanDitutupMs !== null &&
    k.masaMs >= k.soalanDitutupMs + UJIAN_LARIAN_KELUAR_MS
  );
}

/** KZ-UTT: sambung larian mod ujian yang sudah menjawab n soalan. */
export function sambungUjian(k: KeadaanLumba, dijawab: number): void {
  const n = Math.max(0, Math.floor(dijawab));
  k.soalanKe = n;
  k.soalanDijawab = n;
  // Rujukan masa untuk soalan seterusnya (8 s dari mula) dan untuk
  // ujianSelesai jika semua soalan sudah dijawab sebelum terputus.
  k.soalanDitutupMs = n > 0 ? 0 : null;
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

/** Buka soalan baharu; kereta perlahan tetapi pemain masih boleh mengemudi. */
export function bukaSoalan(k: KeadaanLumba): void {
  k.soalanDibukaMs = k.masaMs;
  k.soalanKe += 1;
}

/** Tutup soalan semasa (dijawab atau diabaikan selepas tetingkap tamat). */
export function tutupSoalan(k: KeadaanLumba): void {
  if (k.soalanDibukaMs !== null) {
    k.soalanDibukaMs = null;
    k.soalanDijawab += 1;
    k.soalanDitutupMs = k.masaMs;
  }
}

/**
 * KZ-UTT: batalkan soalan yang dibuka tetapi tidak sampai kepada pemain
 * (rangkaian gagal). Soalan tidak dikira dijawab; ia dibuka semula selepas
 * tempoh pemanduan seterusnya dan pelayan menghidang soalan yang sama.
 */
export function batalSoalan(k: KeadaanLumba): void {
  if (k.soalanDibukaMs !== null) {
    k.soalanDibukaMs = null;
    k.soalanKe = Math.max(k.soalanDijawab, k.soalanKe - 1);
    k.soalanDitutupMs = k.masaMs;
  }
}

/** Masa berlalu sejak soalan semasa dibuka, atau null bila tiada soalan. */
export function masaSoalanBerlalu(k: KeadaanLumba): number | null {
  return k.soalanDibukaMs === null ? null : k.masaMs - k.soalanDibukaMs;
}

/**
 * Masanya untuk membuka soalan baharu: tiada soalan terbuka, soalan pertama
 * selepas 5 saat, kemudian setiap 15 saat, dengan rehat memandu sekurang-kurangnya
 * 4 saat selepas soalan sebelumnya ditutup.
 */
export function perluSoalan(k: KeadaanLumba): boolean {
  if (k.ujian) {
    // KZ-UTT: 8 saat memandu sebelum soalan pertama dan selepas setiap soalan.
    const rujukan = k.soalanDitutupMs ?? 0;
    return !k.selesai && k.soalanDibukaMs === null && k.masaMs >= rujukan + UJIAN_PEMANDUAN_MS;
  }
  return (
    !k.selesai &&
    k.soalanDibukaMs === null &&
    k.masaMs >= SOALAN_PERTAMA_MS + k.soalanKe * SOALAN_SETIAP_MS &&
    (k.soalanDitutupMs === null || k.masaMs >= k.soalanDitutupMs + REHAT_SOALAN_MS)
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
  const m = masaPandu(k);
  if (jarakKomputer(0, m) > k.jarakM) pos = (pos + 1) as 1 | 2 | 3;
  if (jarakKomputer(1, m) > k.jarakM) pos = (pos + 1) as 1 | 2 | 3;
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

  if (k.ujian && k.soalanDibukaMs !== null) {
    // KZ-UTT: kereta berhenti semasa soalan. Tiada stereng, hanyutan atau
    // angin, jadi kereta tidak boleh terbabas ketika pemain menjawab.
    k.jedaMs += Math.max(0, dtMs);
    k.kelajuan += (0 - k.kelajuan) * Math.min(1, dt / 0.3);
    if (k.kelajuan < 0.5) k.kelajuan = 0;
    k.jarakM = Math.min(TREK_PANJANG_M - UJIAN_RUANG_PENAMAT_M, k.jarakM + (k.kelajuan / 3.6) * dt);
    return;
  }

  const had = hadLajuEfektif(k);

  let sasaran: number;
  if (input.brek) sasaran = 0;
  else if (k.soalanDibukaMs !== null) sasaran = had * 0.5; // semasa soalan: perlahan, pecut tiada kesan
  else if (input.pecut) sasaran = had;
  else sasaran = had * 0.75;
  // KZ-055: stereng sentiasa aktif, termasuk semasa soalan (tiada lagi autopilot).
  const arah =
    input.stereng !== undefined
      ? Math.max(-1, Math.min(1, input.stereng))
      : (input.kanan ? 1 : 0) - (input.kiri ? 1 : 0);
  k.offsetM += arah * KADAR_OFFSET_M_S * dt;
  // KZ-056: hanyutan ke luar selekoh; tiada pembetulan automatik.
  k.offsetM += kadarHanyut(k.jarakM, k.kelajuan) * dt;
  k.offsetM = Math.max(-OFFSET_MAX_M, Math.min(OFFSET_MAX_M, k.offsetM));

  k.diLuarJalan = Math.abs(k.offsetM) > SEPARUH_JALAN_M;
  if (k.diLuarJalan) sasaran = Math.min(sasaran, had * 0.35);

  // Kelajuan menghampiri sasaran secara lembut (panduan rasa kereta).
  k.kelajuan += (sasaran - k.kelajuan) * Math.min(1, dt / 0.7);
  if (k.kelajuan < 0) k.kelajuan = 0;

  k.jarakM += (k.kelajuan / 3.6) * dt;
  if (k.ujian) {
    // KZ-UTT: larian ujian tamat selepas soalan terakhir (ujianSelesai),
    // bukan di garisan penamat; kereta menunggu sebelum garisan.
    k.jarakM = Math.min(TREK_PANJANG_M - UJIAN_RUANG_PENAMAT_M, k.jarakM);
    return;
  }
  if (k.jarakM >= TREK_PANJANG_M) {
    k.jarakM = TREK_PANJANG_M;
    k.selesai = true;
  }
}
