/**
 * Medan isian sijil (V2-016b): nilai teks yang educator isi sekali untuk
 * setiap templat kelas (kursus, tarikh, tempat, penandatangan) dan dicetak
 * pada setiap sijil. Fungsi tulen sahaja: tiada akses fail, rangkaian atau
 * pangkalan data, jadi selamat diimport oleh laluan API, janaPdf, UI
 * pelayar dan skrip ujian.
 *
 * `normaliseMedan` mesti dipanggil pada setiap tulisan fields (API dan MCP)
 * dan sebelum PDF dijana; ia membuang kunci asing, memangkas panjang,
 * mengesahkan tarikh ISO sebenar dan membuang rentetan kosong.
 */

/** Medan isian seperti disimpan dalam lajur jsonb `fields` templat. */
export type MedanSijil = {
  /** Nama kursus/program, 1 hingga 160 aksara. */
  course?: string;
  /** Tarikh mula ISO YYYY-MM-DD. */
  date_start?: string;
  /** Tarikh tamat ISO YYYY-MM-DD (pilihan, >= date_start). */
  date_end?: string;
  /** Tempat, 1 hingga 120 aksara. */
  location?: string;
  /** Nama penandatangan, 1 hingga 100 aksara. */
  signer_name?: string;
  /** Jawatan penandatangan, 1 hingga 120 aksara. */
  signer_title?: string;
};

/** Panjang maksimum setiap medan selepas pemangkasan. */
export const PANJANG_MEDAN: Record<keyof MedanSijil, number> = {
  course: 160,
  date_start: 10,
  date_end: 10,
  location: 120,
  signer_name: 100,
  signer_title: 120,
};

/** Nama medan teks sahaja (tarikh disahkan berasingan). */
const KUNCI_TEKS: (keyof MedanSijil)[] = ['course', 'location', 'signer_name', 'signer_title'];

/** Bentuk tarikh ISO YYYY-MM-DD. */
const RE_TARIKH = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tarikh ISO yang sebenar: bentuk betul DAN komponen round-trip melalui
 * Date.UTC (menolak 2026-02-30 dan 2026-13-01).
 */
export function tarikhIsoSah(s: string): boolean {
  if (!RE_TARIKH.test(s)) return false;
  const tahun = Number(s.slice(0, 4));
  const bulan = Number(s.slice(5, 7));
  const hari = Number(s.slice(8, 10));
  const d = new Date(Date.UTC(tahun, bulan - 1, hari));
  return d.getUTCFullYear() === tahun
    && d.getUTCMonth() === bulan - 1
    && d.getUTCDate() === hari;
}

/**
 * Normalkan input sewenang-wenangnya menjadi MedanSijil yang selamat
 * disimpan dan dicetak. Kunci tidak dikenali dibuang, teks dipangkas
 * ruang tepi dan panjang maksimum, tarikh mesti ISO sebenar,
 * date_end mesti >= date_start, dan rentetan kosong dibuang sepenuhnya
 * supaya medan kosong tidak dicetak. Berkuasa idempoten.
 */
export function normaliseMedan(input: unknown): MedanSijil {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {};
  }
  const s = input as Record<string, unknown>;
  const out: MedanSijil = {};

  for (const kunci of KUNCI_TEKS) {
    const v = s[kunci];
    if (typeof v !== 'string') continue;
    const potong = v.trim().slice(0, PANJANG_MEDAN[kunci]);
    if (potong) out[kunci] = potong;
  }

  if (typeof s.date_start === 'string' && tarikhIsoSah(s.date_start)) {
    out.date_start = s.date_start;
  }
  if (typeof s.date_end === 'string' && tarikhIsoSah(s.date_end)) {
    // date_end hanya bermakna bersama date_start dan tidak lebih awal.
    if (out.date_start && s.date_end >= out.date_start) {
      out.date_end = s.date_end;
    }
  }
  return out;
}

/** Bahagian tarikh [hari, bulan 0-11, tahun] daripada rentetan ISO sah. */
function pecahTarikh(iso: string): [number, number, number] {
  return [Number(iso.slice(8, 10)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(0, 4))];
}

/** Nama bulan Bahasa Melayu (sama turutan dengan BULAN_BM janaPdf). */
const BULAN_MEDAN = [
  'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
  'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember',
];

/**
 * Format julat tarikh Bahasa Melayu untuk sijil (V2-016b):
 *   satu hari            : 1 Oktober 2026
 *   bulan sama           : 1 hingga 3 Oktober 2026
 *   bulan berbeza        : 30 September hingga 2 Oktober 2026
 *   tahun berbeza        : tahun penuh pada kedua-dua sisi
 * Input mesti tarikh ISO sah (sudah lulus normaliseMedan).
 */
export function formatJulatTarikhBm(start: string, end?: string): string {
  const [h1, b1, t1] = pecahTarikh(start);
  if (!end || end === start) {
    return `${h1} ${BULAN_MEDAN[b1]} ${t1}`;
  }
  const [h2, b2, t2] = pecahTarikh(end);
  if (t1 === t2 && b1 === b2) {
    return `${h1} hingga ${h2} ${BULAN_MEDAN[b2]} ${t2}`;
  }
  if (t1 === t2) {
    return `${h1} ${BULAN_MEDAN[b1]} hingga ${h2} ${BULAN_MEDAN[b2]} ${t2}`;
  }
  return `${h1} ${BULAN_MEDAN[b1]} ${t1} hingga ${h2} ${BULAN_MEDAN[b2]} ${t2}`;
}

/**
 * Baris butiran sijil: tarikh dan tempat dicantum dengan ' | ' jika
 * kedua-duanya ada; null jika tiada tarikh dan tiada tempat (tidak dicetak).
 */
export function barisButiran(medan: MedanSijil): string | null {
  const tarikh = medan.date_start
    ? formatJulatTarikhBm(medan.date_start, medan.date_end)
    : null;
  const tempat = medan.location ?? null;
  if (tarikh && tempat) return `${tarikh} | ${tempat}`;
  return tarikh ?? tempat;
}
