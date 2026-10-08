/**
 * Fungsi tulen UI sijil (V2-003b): pemformatan status dan penapis kelayakan.
 * Tiada akses rangkaian atau pangkalan data; diuji oleh
 * scripts/selftest-sijil-ui.ts.
 */

export type BarisKelayakan = {
  participant_id: string;
  display_name: string;
  certificate_name: string | null;
  name_confirmed: boolean;
  eligible: boolean;
  reason: string;
  already_issued: boolean;
};

/**
 * Status sijil dalam Bahasa Inggeris untuk UI: Active atau Revoked.
 */
export function statusSijil(revoked_at: string | null): { label: string; kelas: string } {
  return revoked_at
    ? { label: "Revoked", kelas: "text-red-600" }
    : { label: "Active", kelas: "text-emerald-600" };
}

/**
 * Peserta yang boleh ditandakan untuk pengeluaran: layak DAN belum dikeluarkan.
 * Baris lain ditapis keluar supaya kotak semak tidak perlu disemak satu satu.
 */
export function tickLayak(
  baris: BarisKelayakan[],
  tick: Record<string, boolean>,
): string[] {
  return baris
    .filter((r) => tick[r.participant_id] === true && r.eligible && !r.already_issued)
    .map((r) => r.participant_id);
}

/**
 * Nama yang dipaparkan pada jadual kelayakan: nama sijil jika sudah
 * disahkan, atau tanda "Waiting for name confirmation".
 */
export function labelNamaSijil(r: BarisKelayakan): string {
  if (!r.name_confirmed) return "Waiting for name confirmation";
  return r.certificate_name ?? r.display_name;
}

/**
 * KZ-011: baris jadual kelayakan yang boleh ditandakan untuk pengeluaran:
 * layak DAN belum dikeluarkan. Dipakai oleh kotak semak kepala, butang
 * "Select all eligible" dan pengiraan ringkasan kecil di atas jadual.
 */
export function idBolehPilih(r: BarisKelayakan): boolean {
  return r.eligible && !r.already_issued;
}

/**
 * KZ-011: pecahkan senarai id kepada kelompok saiz tetap untuk pengeluaran
 * berkelompok (kelompok 10 setiap permintaan, supaya PDF berat tidak
 * melanggar had masa Nginx). Fungsi tulen; 0 item -> [], saiz >= panjang ->
 * satu kelompok sahaja.
 */
export function pecahKelompok<T>(ids: T[], saiz: number): T[][] {
  if (saiz <= 0) return [ids];
  const kelompok: T[][] = [];
  for (let i = 0; i < ids.length; i += saiz) {
    kelompok.push(ids.slice(i, i + saiz));
  }
  return kelompok;
}