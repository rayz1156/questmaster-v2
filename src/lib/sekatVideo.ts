// lib/sekatVideo.ts
//
// Sekatan fail video di seluruh laluan muat naik Kuizen (KZ-039).
//
// Keputusan Boss: tiada muat naik video terus di mana-mana; video hanya melalui
// pautan luar (YouTube). Kandungan sedia ada kekal dipaparkan, jadi sekatan ini
// hanya menghalang penciptaan baharu, bukan pemadaman.
//
// Kenapa semakan berkembar (MIME dan sambungan): MIME dikawal klien dan boleh
// dipalsukan sebagai application/octet-stream, jadi sambungan nama fail juga
// mesti disemak. Sebaliknya nama fail juga dikawal klien, jadi MIME yang benar
// (dihidu daripada bait oleh pelayan) mesti ikut disemak. Kedua-dua belah
// dinormalkan ke huruf kecil supaya "VIDEO/MP4" dan "KLIP.MP4" tidak lulus.

/** Mesej ralat tunggal untuk semua laluan muat naik fail umum. */
export const MESEJ_SEKAT_VIDEO = 'Fail video tidak dibenarkan. Kongsi pautan YouTube.';

/** Mesej ralat untuk laluan muat naik video terus (kini batu nisan 410). */
export const MESEJ_VIDEO_TERUS = 'Muat naik video terus tidak lagi disokong. Kongsi pautan YouTube.';

/** Sambungan yang dianggap video walaupun MIME mengatakan lain. */
const SAMBUNGAN_VIDEO = new Set([
  'mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi',
  'wmv', 'flv', '3gp', 'mpeg', 'mpg', 'ogv',
]);

/**
 * Benar jika nama fail ATAU MIME menunjukkan fail video.
 *
 * Sambungan diambil daripada segmen terakhir nama fail: sambungan inilah yang
 * diputuskan oleh sistem fail, jadi "a.pdf.mp4" ialah video walaupun bahagian
 * tengah kelihatan seperti PDF. Query dan serpihan URL dibuang dahulu supaya
 * nama yang diambil daripada pautan (laluan source_url) tidak tertipu oleh
 * "?fmt=mp4".
 */
export function failVideo(namaFail: string, mime: string | null | undefined): boolean {
  const mimeBersih = (mime ?? '').split(';')[0].trim().toLowerCase();
  if (mimeBersih.startsWith('video/')) return true;

  const nama = (namaFail ?? '').split('?')[0].split('#')[0].trim();
  const titik = nama.lastIndexOf('.');
  if (titik < 0 || titik === nama.length - 1) return false;
  return SAMBUNGAN_VIDEO.has(nama.substring(titik + 1).toLowerCase());
}