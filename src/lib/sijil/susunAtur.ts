/**
 * Susun atur templat sijil (V2-015): fungsi tulen sahaja, tiada akses fail
 * atau rangkaian, jadi selat diimport oleh route, alat MCP, komponen UI
 * pelayar dan skrip ujian.
 *
 * `normaliseSusunAtur` mesti dipanggil pada setiap tulisan layout (API dan
 * MCP) dan sebelum PDF dijana; ia mengeluarkan kunci tidak dikenali,
 * mengapit semua nombor, mengesahkan warna dan memangkas rentetan tajuk.
 */

/** Kedudukan nama pada mod full_background; pecahan halaman 0 hingga 1. */
export type SusunAturNama = {
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  color: string;
  weight?: 'bold' | 'regular';
  align?: 'center' | 'left';
};

/** Kedudukan QR; penjuru kiri atas, pecahan; size pecahan lebar halaman. */
export type SusunAturQr = { x: number; y: number; size: number };

/** Kedudukan kod sijil; pecahan halaman. */
export type SusunAturKod = {
  x: number;
  y: number;
  size: number;
  color: string;
  align?: 'center' | 'left' | 'right';
};

/** Layout templat (jsonb `qm_certificate_templates.layout`). */
export type SusunAturSijil = {
  titleBm?: string;
  titleEn?: string;
  mode?: 'standard' | 'full_background';
  name?: SusunAturNama;
  qr?: SusunAturQr | false;
  code?: SusunAturKod | false;
};

/** Warna lalai semua teks sijil, selaras dengan contoh reka bentuk Boss. */
export const WARNA_LALAI = '#001F4B';

const RE_WARNA = /^#[0-9a-fA-F]{6}$/;

/** Panjang maksimum rentetan tajuk selepas pemangkasan. */
export const PANJANG_TAJUK_MAKS = 120;

/** Julat pengapitan; dikongsi dengan penerangan alat MCP dan UI. */
export const NAMA_SAIZ_MIN = 8;
export const NAMA_SAIZ_MAKS = 96;
export const QR_SAIZ_MIN = 0.04;
export const QR_SAIZ_MAKS = 0.2;
export const KOD_SAIZ_MIN = 6;
export const KOD_SAIZ_MAKS = 24;

/** Apit nombor bernilai terhingga ke dalam julat [min, maks]. */
function apit(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, v));
}

/** Warna mesti #RRGGBB (huruf besar atau kecil, kekal seperti asal);
 * selain itu jatuh kepada warna lalai. */
function warna(v: unknown): string {
  return typeof v === 'string' && RE_WARNA.test(v) ? v : WARNA_LALAI;
}

/** Rentetan tajuk: buang ruang tepi dan pangkas kepada 120 aksara. */
function tajuk(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.slice(0, PANJANG_TAJUK_MAKS);
}

/**
 * Normalkan input sewenang-wenangnya menjadi SusunAturSijil yang selamat
 * disimpan dan dilukis. Kunci tidak dikenali dibuang, nombor diapit, warna
 * tidak sah jatuh ke lalai, dan objek tidak lengkap (contoh name tanpa
 * keempat-empat medan nombor) dibuang sepenuhnya supaya janaPdf tidak
 * menerima kedudukan separuh masak. Berkuasa idempoten: hasil yang
 * dinormalkan sekali tidak berubah bila dinormalkan semula.
 */
export function normaliseSusunAtur(input: unknown): SusunAturSijil {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {};
  }
  const s = input as Record<string, unknown>;
  const out: SusunAturSijil = {};

  if (typeof s.titleBm === 'string' && s.titleBm.trim()) out.titleBm = tajuk(s.titleBm);
  if (typeof s.titleEn === 'string' && s.titleEn.trim()) out.titleEn = tajuk(s.titleEn);

  if (s.mode === 'standard' || s.mode === 'full_background') out.mode = s.mode;

  if (typeof s.name === 'object' && s.name !== null && !Array.isArray(s.name)) {
    const nm = s.name as Record<string, unknown>;
    const x = apit(nm.x, 0, 1);
    const y = apit(nm.y, 0, 1);
    const maxWidth = apit(nm.maxWidth, 0, 1);
    const size = apit(nm.size, NAMA_SAIZ_MIN, NAMA_SAIZ_MAKS);
    if (x !== null && y !== null && maxWidth !== null && size !== null) {
      out.name = {
        x,
        y,
        maxWidth,
        size,
        color: warna(nm.color),
        ...(nm.weight === 'bold' || nm.weight === 'regular' ? { weight: nm.weight } : {}),
        align: nm.align === 'left' ? 'left' : 'center',
      };
    }
  }

  if (s.qr === false) {
    out.qr = false;
  } else if (typeof s.qr === 'object' && s.qr !== null && !Array.isArray(s.qr)) {
    const q = s.qr as Record<string, unknown>;
    const x = apit(q.x, 0, 1);
    const y = apit(q.y, 0, 1);
    const size = apit(q.size, QR_SAIZ_MIN, QR_SAIZ_MAKS);
    if (x !== null && y !== null && size !== null) {
      out.qr = { x, y, size };
    }
  }

  if (s.code === false) {
    out.code = false;
  } else if (typeof s.code === 'object' && s.code !== null && !Array.isArray(s.code)) {
    const k = s.code as Record<string, unknown>;
    const x = apit(k.x, 0, 1);
    const y = apit(k.y, 0, 1);
    const size = apit(k.size, KOD_SAIZ_MIN, KOD_SAIZ_MAKS);
    if (x !== null && y !== null && size !== null) {
      out.code = {
        x,
        y,
        size,
        color: warna(k.color),
        align: k.align === 'left' ? 'left' : k.align === 'right' ? 'right' : 'center',
      };
    }
  }

  return out;
}
