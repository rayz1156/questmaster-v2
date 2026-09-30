/**
 * Pembantu semakan bait aset sijil (V2-016a), diekstrak daripada laluan
 * asset-finalize V2-015 supaya laluan pendidik dan laluan galeri admin
 * memakai tandatangan yang sama. Akses storan dengan kunci service role
 * dipanggil HANYA selepas kebenaran disahkan oleh pemanggil.
 */

/** Had muat naik aset sijil: 8 MB supaya PNG A4 300 dpi diterima. */
export const MAX_ASET_BYTES = 8 * 1024 * 1024;

/**
 * Muat turun 16 bait pertama objek storage dengan header Range melalui
 * kunci service role. Versi storage-js yang dipasang tidak menyokong
 * pilihan range pada download(), jadi fetch mentah digunakan; jika pelayan
 * abaikan Range, badan penuh diterima dan hanya 16 bait pertama dibaca.
 */
export async function muat16Bait(path: string): Promise<Uint8Array | null> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!base || !key) return null;
  const selamat = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${base}/storage/v1/object/certificate-assets/${selamat}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Range: 'bytes=0-15' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/** Tandatangan PNG (89 50 4E 47) atau JPEG (FF D8 FF) pada bait pertama. */
export function tandatanganImej(b: Uint8Array): boolean {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  return false;
}
