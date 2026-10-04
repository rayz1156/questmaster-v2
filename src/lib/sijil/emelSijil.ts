/**
 * Pembantu tulen untuk emel sijil (KZ-008). Diekstrak supaya boleh diuji
 * dengan npx tsx tanpa panggilan rangkaian; logik TIDAK disalin ke tempat
 * lain. Tiada kebergantungan baharu.
 */

/** Had saiz lampiran PDF (bait). Melebihi ini: emel dihantar tanpa lampiran. */
export const MAKS_LAMPIRAN = 5 * 1024 * 1024;

/** Had sasaran setiap panggilan API (selari dengan RPC qm_certificate_email_targets). */
export const MAKS_SEKALI = 20;

/**
 * Sahkan `pdf_path` selamat untuk dimuat turun (KZ-008): mesti string,
 * bermula dengan folder kelas `${classId}/`, berakhir `.pdf` dan tidak
 * mengandungi `..`. Laluan kelas lain, laluan menaik direktori atau bukan
 * PDF TIDAK pernah dimuat turun (kriteria penerimaan 3).
 */
export function pathSelamat(pdfPath: unknown, classId: string): boolean {
  if (typeof pdfPath !== "string" || pdfPath.length === 0) return false;
  if (!pdfPath.startsWith(`${classId}/`)) return false;
  if (!pdfPath.endsWith(".pdf")) return false;
  if (pdfPath.includes("..")) return false;
  return true;
}

/** Satu hasil untukSetiap: nilai fn atau ralat yang ditangkap. */
export type HasilUntukSetiap<R> = { ok: true; nilai: R } | { ok: false; ralat: unknown };

/**
 * Jalankan fn ke atas setiap item dengan keserentakan terhad (KZ-008:
 * serentak 3 untuk penghantaran emel, supaya 20 kelompok tidak melebihi
 * timeout nginx 60 saat). Ralat satu item ditangkap dan tidak menghentikan
 * yang lain. Hasil dipulangkan mengikut SUSUNAN INPUT, bukan susunan siap.
 * Tiada kebergantungan baharu: gelung pekerja ringkas sahaja.
 */
export async function untukSetiap<T, R>(
  senarai: readonly T[],
  serentak: number,
  fn: (item: T, indeks: number) => Promise<R>,
): Promise<HasilUntukSetiap<R>[]> {
  const hasil: HasilUntukSetiap<R>[] = new Array(senarai.length);
  let seterusnya = 0;
  const pekerja = async (): Promise<void> => {
    // Ambil indeks seterusnya sehingga habis; seterusnya++ selamat kerana
    // JavaScript satu urutan (tiada perlumbaan sebenar).
    for (;;) {
      const i = seterusnya;
      seterusnya += 1;
      if (i >= senarai.length) return;
      try {
        hasil[i] = { ok: true, nilai: await fn(senarai[i], i) };
      } catch (e) {
        hasil[i] = { ok: false, ralat: e };
      }
    }
  };
  const bilangan = Math.max(1, Math.min(serentak, Math.max(senarai.length, 1)));
  await Promise.all(Array.from({ length: bilangan }, () => pekerja()));
  return hasil;
}