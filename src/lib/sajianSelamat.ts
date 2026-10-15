// KZ-017 R2-4 (pembetulan kzsec pusingan 2, penemuan 1): logika keputusan
// pengepala sajian fail dipisahkan ke fungsi tulen supaya boleh diuji tanpa
// pelayan. Sebelum ini perbandingan jenis MIME di route file-redirect adalah
// case-sensitive (ct.startsWith), sedangkan jenis MIME tidak sensitif huruf
// mengikut RFC 2045/7231. Penyerang boleh mengisytihar "image/SVG+XML" semasa
// muat naik untuk melintas senarai sekat dan disajikan inline, lalu stored XSS
// pada origin aplikasi. Penyelesaian R2-1: SENARAI BENARKAN, bukan senarai
// sekat. Hanya jenis yang diketahui selamat untuk paparan inline boleh inline;
// semua jenis lain, termasuk yang tidak dikenali atau kosong, dipaksa
// attachment dengan CSP sandbox.

/** Jenis yang diketahui selamat disajikan inline (padanan TEPAT). */
export const INLINE_SELAMAT = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

/**
 * Normalkan nilai Content-Type: buang parameter (contoh "; charset=utf-8"),
 * buang ruang kosong di hujung dan awal, dan normalkan kepada huruf kecil.
 * Setiap keputusan dan pengepala Content-Type yang dihantar mesti guna nilai
 * hasil fungsi ini, bukan nilai mentah huluan.
 */
export function normMime(ctMentah: string): string {
  return (ctMentah || '').split(';')[0].trim().toLowerCase();
}

/**
 * Adakah jenis ini boleh disajikan inline? Padanan tepat bagi senarai selamat,
 * tambah awalan video/ dan audio/ (jenis media umum tidak boleh menjalankan
 * skrip dalam pelayar moden).
 */
export function bolehInline(ctNorm: string): boolean {
  if (INLINE_SELAMAT.has(ctNorm)) return true;
  if (ctNorm.startsWith('video/') || ctNorm.startsWith('audio/')) return true;
  return false;
}

/**
 * Keputusan pengepala sajian untuk satu jenis Content-Type mentah.
 * - contentType: nilai ternormal (huruf kecil, tanpa parameter).
 * - disposition: 'inline' hanya jika route asal mahu inline DAN jenis berada
 *   dalam senarai selamat; semua lain 'attachment'.
 * - csp: null untuk inline; "sandbox; default-src 'none'" untuk attachment.
 */
export function pengepalaSajian(
  ctMentah: string,
  mahuInline: boolean,
): { contentType: string; disposition: 'inline' | 'attachment'; csp: string | null } {
  const contentType = normMime(ctMentah) || 'application/octet-stream';
  if (mahuInline && bolehInline(contentType)) {
    return { contentType, disposition: 'inline', csp: null };
  }
  return { contentType, disposition: 'attachment', csp: "sandbox; default-src 'none'" };
}