/**
 * Pembantu kuota storan untuk laluan muat naik (tiket V2-002b).
 *
 * Dua panggilan fungsi pangkalan data untuk setiap muat naik:
 *   qm_reserve_upload SEBELUM bait dihantar ke FileLu
 *   qm_record_upload  SELEPAS fail berjaya sampai
 *
 * Kedua-duanya dipanggil melalui klien Supabase Bearer pengguna (bukan
 * service role) supaya auth.uid() dalam fungsi SECURITY DEFINER melihat
 * pemanggil yang sebenar dan RLS keahlian dikuatkuasakan.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type RalatKuota = {
  status: number;
  body: { error: string; code: string };
};

/** Peta kod QM_* kepada status HTTP. Kuota = 413, video = 415, lain = 403. */
function statusKod(kod: string): number {
  if (kod === 'QM_VIDEO_BLOCKED') return 415;
  if (kod.startsWith('QM_LIMIT_')) return 413;
  return 403;
}

/** Tukar ralat RPC kepada RalatKuota dengan kod QM_* yang boleh dibaca. */
function ralatDaripadaRpc(error: { message?: string } | null): RalatKuota {
  const teks: string = error?.message || String(error);
  const m = /QM_[A-Z_]+/.exec(teks);
  const kod = m ? m[0] : 'QM_UNKNOWN';
  // Buang awalan kod supaya klien memaparkan mesej yang boleh dibaca.
  const mesej = teks.replace(/^.*?QM_[A-Z_]+:\s*/, '').trim() || teks;
  return { status: statusKod(kod), body: { error: mesej, code: kod } };
}

/**
 * Panggil qm_reserve_upload. Gagal memulangkan RalatKuota yang boleh
 * dibalas terus oleh laluan; kejayaan memulangkan null.
 */
export async function reserveMuatNaik(
  supa: SupabaseClient,
  pClass: string | null,
  bytes: number,
  mime: string,
): Promise<RalatKuota | null> {
  const { error } = await supa.rpc('qm_reserve_upload', {
    p_class: pClass,
    p_bytes: bytes,
    p_mime: mime,
  });
  if (!error) return null;
  return ralatDaripadaRpc(error);
}

/**
 * Panggil qm_record_upload. Kejayaan memulangkan null; kegagalan
 * memulangkan RalatKuota. Pemanggil WAJIB memadam fail yang sudah sampai
 * ke storan (fileluDelete) dan membalas ralat ini kepada klien: rekod yang
 * gagal bermakna fail itu tidak dikira dalam kuota, jadi ia tidak boleh
 * dibiarkan berada di storan secara senyap (kzsec 2/3).
 */
export async function rekodMuatNaik(
  supa: SupabaseClient,
  pClass: string | null,
  fileCode: string,
  bytes: number,
  mime: string,
  source: string,
): Promise<RalatKuota | null> {
  const { error } = await supa.rpc('qm_record_upload', {
    p_class: pClass,
    p_file_code: fileCode,
    p_bytes: bytes,
    p_mime: mime,
    p_source: source,
  });
  if (!error) return null;
  const ralat = ralatDaripadaRpc(error);
  console.error(
    `[kuota-storan] qm_record_upload gagal source=${source} code=${fileCode}: ${error.message}`,
  );
  return ralat;
}
