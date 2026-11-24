/**
 * Muat naik aset sijil tanpa shell (KZ-B).
 *
 * Dua sumber untuk klien yang tiada shell (contoh chat claude.ai):
 *   - source_url: pelayan memuat turun sendiri melalui fetchRemoteToDisk
 *     (upload-guard.ts: https sahaja, alamat dalaman disekat pada alamat
 *     yang diselesaikan, setiap pengalihan disahkan semula, bait sebenar
 *     dikira, jenis dikesan daripada bait).
 *   - content_base64: fail kecil (tandatangan, logo), sehingga 1 MB.
 * Bait disahkan PNG atau JPEG sebenar. Pilihan buangLatarPutih menukar
 * piksel putih kepada lutsinar dan sentiasa memulangkan PNG.
 *
 * Pelayan sahaja. Panggil selepas kebenaran pendidik disahkan.
 */
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRemoteToDisk, UploadGuardError } from '@/lib/upload-guard';
import { tandatanganImej } from '@/lib/sijil/aset';

export type JenisAset = 'background' | 'logo' | 'signature';

/** Had saiz mengikut jenis (spesifikasi KZ-B). */
export const HAD_ASET: Record<JenisAset, number> = {
  background: 8 * 1024 * 1024,
  logo: 8 * 1024 * 1024,
  signature: 1 * 1024 * 1024,
};
/** Had base64 selepas dinyahkod, untuk semua jenis. */
export const HAD_BASE64 = 1 * 1024 * 1024;

export class RalatAset extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type ImejMasuk = { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' };

function jenisMime(b: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (!tandatanganImej(b)) return null;
  return b[0] === 0x89 ? 'image/png' : 'image/jpeg';
}

/**
 * Pautan kongsi Google Drive (file/d/<id>/view atau open?id=<id>) ditukar
 * kepada pautan muat turun terus. Pautan lain dipulangkan tanpa ubah.
 */
export function pautanMuatTurun(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === 'drive.google.com') {
      const m = /\/file\/d\/([A-Za-z0-9_-]+)/.exec(u.pathname);
      const id = m?.[1] ?? u.searchParams.get('id');
      if (id) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
    }
  } catch {
    /* URL tidak sah: biar fetchRemoteToDisk melaporkannya */
  }
  return raw;
}

/** Muat turun imej daripada URL https dengan perlindungan SSRF. */
export async function imejDariUrl(sourceUrl: string, maxBytes: number): Promise<ImejMasuk> {
  let fail;
  try {
    fail = await fetchRemoteToDisk(pautanMuatTurun(sourceUrl.trim()), {
      allowedMimePrefixes: ['image/png', 'image/jpeg'],
      maxBytes,
      maxRedirects: 5,
    });
  } catch (e) {
    if (e instanceof UploadGuardError) throw new RalatAset(e.message, (e as { status?: number }).status ?? 400);
    throw new RalatAset('Fail tidak dapat dimuat turun daripada source_url.', 502);
  }
  try {
    const bytes = new Uint8Array(await readFile(fail.tmpPath));
    const mime = jenisMime(bytes);
    if (!mime) throw new RalatAset('Fail bukan imej PNG atau JPEG yang sah.', 415);
    return { bytes, mime };
  } finally {
    await fail.cleanup();
  }
}

/** Nyahkod base64 (dengan atau tanpa awalan data:) dan sahkan imej. */
export function imejDariBase64(b64: string, maxBytes: number = HAD_BASE64): ImejMasuk {
  const bersih = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=_-]+$/.test(bersih)) throw new RalatAset('content_base64 bukan base64 yang sah.');
  // Anggaran saiz sebelum menyahkod supaya rentetan besar ditolak awal.
  if (Math.floor((bersih.length * 3) / 4) > maxBytes + 3) {
    throw new RalatAset(`Fail melebihi had ${Math.round(maxBytes / 1024)} KB.`, 413);
  }
  const bytes = new Uint8Array(Buffer.from(bersih, 'base64'));
  if (bytes.length > maxBytes) throw new RalatAset(`Fail melebihi had ${Math.round(maxBytes / 1024)} KB.`, 413);
  const mime = jenisMime(bytes);
  if (!mime) throw new RalatAset('Fail bukan imej PNG atau JPEG yang sah.', 415);
  return { bytes, mime };
}

/**
 * Jadikan latar putih lutsinar. Piksel yang komponen paling gelapnya
 * >= AMBANG_PENUH menjadi lutsinar sepenuhnya; antara AMBANG_LEMBUT dan
 * AMBANG_PENUH alfa dikurangkan beransur supaya tepi dakwat licin.
 * Hasil sentiasa PNG RGBA.
 */
const AMBANG_PENUH = 235;
const AMBANG_LEMBUT = 200;
/** Had piksel supaya imej sangat besar tidak menghabiskan memori pelayan. */
const MAX_PIKSEL = 12_000_000;

export function buangLatarPutih(imej: ImejMasuk): ImejMasuk {
  let lebar: number;
  let tinggi: number;
  let data: Uint8Array;
  try {
    if (imej.mime === 'image/png') {
      const png = PNG.sync.read(Buffer.from(imej.bytes));
      lebar = png.width;
      tinggi = png.height;
      data = png.data;
    } else {
      const j = jpeg.decode(Buffer.from(imej.bytes), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 12 });
      lebar = j.width;
      tinggi = j.height;
      data = j.data;
    }
  } catch {
    throw new RalatAset('Imej tidak dapat dinyahkod untuk membuang latar putih.', 415);
  }
  if (lebar * tinggi > MAX_PIKSEL) throw new RalatAset('Imej terlalu besar untuk membuang latar putih.', 413);

  const keluar = new PNG({ width: lebar, height: tinggi });
  for (let i = 0; i < lebar * tinggi * 4; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const minimum = Math.min(r, g, b);
    let alfa = a;
    if (minimum >= AMBANG_PENUH) {
      alfa = 0;
    } else if (minimum > AMBANG_LEMBUT) {
      alfa = Math.round(a * ((AMBANG_PENUH - minimum) / (AMBANG_PENUH - AMBANG_LEMBUT)));
    }
    keluar.data[i] = r;
    keluar.data[i + 1] = g;
    keluar.data[i + 2] = b;
    keluar.data[i + 3] = alfa;
  }
  return { bytes: new Uint8Array(PNG.sync.write(keluar)), mime: 'image/png' };
}

/** Nama objek rawak di bawah prefiks yang diberi, ikut sambungan jenis. */
export function laluanAset(prefiks: string, kind: JenisAset, mime: string): string {
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  return `${prefiks}${kind}-${randomBytes(8).toString('hex')}.${ext}`;
}

/** Simpan bait ke bucket certificate-assets (service role). */
export async function simpanAset(svc: SupabaseClient, path: string, imej: ImejMasuk): Promise<void> {
  const { error } = await svc.storage
    .from('certificate-assets')
    .upload(path, imej.bytes, { contentType: imej.mime, upsert: false });
  if (error) throw new RalatAset(error.message, 500);
}

/** Padam objek lama hanya jika tiada baris lain merujuknya. */
export async function padamJikaTidakDipakai(svc: SupabaseClient, path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { data: dipakai, error } = await svc.rpc('qm_certificate_asset_in_use', { p_path: path });
  if (!error && dipakai === false) {
    await svc.storage.from('certificate-assets').remove([path]).catch(() => undefined);
  }
}

/**
 * Baca sumber imej daripada badan permintaan: tepat satu daripada
 * source_url atau content_base64, ditambah pilihan remove_white_background.
 */
export async function bacaImejPermintaan(
  body: Record<string, unknown>,
  kind: JenisAset,
): Promise<ImejMasuk> {
  const url = typeof body.source_url === 'string' ? body.source_url.trim() : '';
  const b64 = typeof body.content_base64 === 'string' ? body.content_base64 : '';
  if ((url ? 1 : 0) + (b64 ? 1 : 0) !== 1) {
    throw new RalatAset('Beri tepat satu daripada source_url atau content_base64.');
  }
  let imej = url ? await imejDariUrl(url, HAD_ASET[kind]) : imejDariBase64(b64, Math.min(HAD_BASE64, HAD_ASET[kind]));
  if (body.remove_white_background === true) imej = buangLatarPutih(imej);
  if (imej.bytes.length > HAD_ASET[kind]) {
    throw new RalatAset(`Fail melebihi had ${Math.round(HAD_ASET[kind] / 1024 / 1024)} MB untuk ${kind}.`, 413);
  }
  return imej;
}
