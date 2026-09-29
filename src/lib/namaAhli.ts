/**
 * Nama paparan untuk seorang ahli kelas yang dipulangkan oleh
 * listClassMembers (src/lib/data.ts). Baris ahli mempunyai bentuk
 * { user_id, joined_at, qm_profiles: { id, display_name, email, role } | null }.
 *
 * Pepijat lama pada halaman People (tiket V2-007): ia membaca
 * m.display_name || m.full_name || m.email || m.user_id, jadi apabila nama
 * berada dalam m.qm_profiles, UUID pengguna dipaparkan sebagai nama.
 *
 * Peraturan: UUID TIDAK BOLEH dipaparkan sebagai nama. Urutan:
 *   1. m.qm_profiles.display_name (bukan kosong)
 *   2. m.qm_profiles.email (bahagian sebelum @)
 *   3. "Student"
 */

// UUID v4 yang biasa: 8-4-4-4-12 aksara heksadesimal.
// Temuan R4 (V2-007-sec): nama yang SAH secara tak sengaja berbentuk UUID
// juga akan ditolak oleh CORAK_UUID dan jatuh kepada emel atau "Student".
// Ini disengajakan dan didokumenkan: UUID pengguna tidak sepatutnya
// dipaparkan sebagai nama (ia mendedahkan user_id), jadi sebarang rentetan
// berbentuk UUID dianggap data identiti, bukan nama, walau pun ia mungkin
// memang nama pilihan pengguna itu sendiri.
const CORAK_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tapis nilai nama: mesti rentetan bukan kosong dan bukan UUID. */
function namaSah(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const bersih = v.trim();
  if (bersih.length === 0 || CORAK_UUID.test(bersih)) return null;
  return bersih;
}

/** Bahagian sebelum @ bagi emel, atau null jika bukan emel sah. */
function imelKeNama(v: unknown): string | null {
  const bersih = namaSah(v);
  if (!bersih) return null;
  const at = bersih.indexOf('@');
  if (at <= 0) return null;
  return namaSah(bersih.slice(0, at));
}

export function namaAhli(m: unknown): string {
  const p = (m as { qm_profiles?: { display_name?: unknown; email?: unknown } | null } | null)?.qm_profiles;
  if (p) {
    const dariProfil = namaSah(p.display_name);
    if (dariProfil) return dariProfil;
    const dariEmel = imelKeNama(p.email);
    if (dariEmel) return dariEmel;
  }
  return 'Student';
}
