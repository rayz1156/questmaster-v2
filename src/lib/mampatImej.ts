/**
 * Pemampatan imej sisi klien dengan <canvas>, tanpa kebergantungan baharu
 * (tiket V2-002b).
 *
 * Aturan:
 *   - image/jpeg, image/png, image/webp dengan lebar > 1600px ATAU saiz
 *     > 1MB ditukar kepada WebP kualiti 0.82, lebar maksimum 1600px.
 *   - GIF dan SVG tidak diubah (canvas memusnahkan animasi; SVG tidak perlu).
 *   - Sesuatu yang gagal dipampat memulangkan fail asal, bukan ralat:
 *     muat naik mesti kekal berfungsi walaupun pelayar lama tidak menyokong
 *     canvas.toBlob('image/webp').
 */

const LEBAR_MAKS = 1600;
const SAIZ_AMBANG = 1024 * 1024;
const KUALITI = 0.82;

const JENIS_DIPAMPAT = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Adakah fail ini patut dipampat? GIF, SVG dan fail kecil tidak diubah. */
export function patutDipampat(file: File): boolean {
  if (!JENIS_DIPAMPAT.has(file.type)) return false;
  if (file.size <= SAIZ_AMBANG) return false;
  return true;
}

/**
 * Mampatkan imej kepada WebP. Memulangkan fail asal apabila pemampatan
 * tidak perlu atau tidak dapat dilakukan.
 */
export async function mampatImej(file: File): Promise<File> {
  if (!patutDipampat(file)) return file;
  if (typeof document === 'undefined') return file;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      // Saiz > 1MB tetapi lebar <= 1600: kekal saiz, turunkan kualiti sahaja.
      const lebar = Math.min(bitmap.width, LEBAR_MAKS);
      const tinggi = Math.round(bitmap.height * (lebar / bitmap.width));

      const canvas = document.createElement('canvas');
      canvas.width = lebar;
      canvas.height = tinggi;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, lebar, tinggi);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', KUALITI),
      );
      if (!blob || blob.size >= file.size) return file;

      const nama = file.name.replace(/\.[^.]+$/, '') + '.webp';
      return new File([blob], nama, { type: 'image/webp', lastModified: Date.now() });
    } finally {
      bitmap.close();
    }
  } catch {
    // Pelayar tidak menyokong createImageBitmap atau imej rosak: teruskan
    // dengan fail asal. Penolakan saiz masih dikawal di pelayan.
    return file;
  }
}
