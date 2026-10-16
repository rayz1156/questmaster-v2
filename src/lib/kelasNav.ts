/**
 * Kelas yang dipaut oleh menu sisi pelajar untuk Intro Board dan
 * Learning Board (KZ-022c). Fungsi tulen supaya boleh diuji tanpa
 * pangkalan data: scripts/selftest-kz022c.ts.
 *
 * Keutamaan pemilihan kelas:
 *   1. Kelas dalam laluan semasa (/participant/classes/<id>/...).
 *   2. Kelas terakhir yang dipilih di halaman Home (storan pelayar).
 *   3. Kelas lalai, sama seperti Home: kelas aktif pertama ikut susunan,
 *      atau kelas pertama jika semua sudah tamat.
 * Hanya kelas yang pelajar ini benar-benar sertai diterima; id lain
 * (contohnya storan lama) diabaikan.
 */

/** Kunci storan pelayar untuk kelas yang dipilih di Home. */
export const KUNCI_KELAS_AKTIF = "kz-kelas-aktif";

const CORAK_LALUAN = /^\/participant\/classes\/([^/?#]+)/;

/** Id kelas daripada laluan halaman kelas pelajar, atau null. */
export function kelasDariLaluan(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const m = CORAK_LALUAN.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Pilih kelas untuk pautan menu sisi.
 * @param idSah id kelas yang pelajar sertai, dalam susunan Home
 * @param idLalai kelas lalai Home (boleh null jika tiada kelas)
 */
export function pilihKelasNav(
  pathname: string | null | undefined,
  simpanan: string | null | undefined,
  idSah: string[],
  idLalai: string | null,
  /** Pengekstrak id kelas daripada laluan; lalai: laluan pelajar. */
  dariLaluanFn: (p: string | null | undefined) => string | null = kelasDariLaluan,
): string | null {
  const sah = new Set(idSah);
  const dariLaluan = dariLaluanFn(pathname);
  if (dariLaluan && sah.has(dariLaluan)) return dariLaluan;
  if (simpanan && sah.has(simpanan)) return simpanan;
  if (idLalai && sah.has(idLalai)) return idLalai;
  return null;
}

/* ===== Pendidik (KZ-022d) ===== */

/** Kunci storan pelayar untuk kelas terakhir yang dibuka pendidik. */
export const KUNCI_KELAS_PENDIDIK = "kz-kelas-aktif-pendidik";

const CORAK_LALUAN_PENDIDIK = /^\/educator\/classes\/([^/?#]+)/;

/** Id kelas daripada laluan halaman kelas pendidik, atau null. */
export function kelasDariLaluanPendidik(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const m = CORAK_LALUAN_PENDIDIK.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Pautan Intro Board dan Learning Board kelas untuk pendidik. */
export function pautanPapanKelasPendidik(classId: string) {
  const asas = `/educator/classes/${encodeURIComponent(classId)}`;
  return {
    intro: `${asas}/board`,
    learning: `${asas}/learning-board`,
  };
}

/** Pautan Intro Board dan Learning Board untuk satu kelas. */
export function pautanPapanKelas(classId: string) {
  const asas = `/participant/classes/${encodeURIComponent(classId)}`;
  return {
    intro: `${asas}/board`,
    learning: `${asas}/learning-board`,
  };
}
