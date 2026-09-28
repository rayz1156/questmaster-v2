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

/**
 * Panggil qm_reserve_upload. Gagal memulangkan RalatKuota yang boleh
 * dibalas terus oleh laluan; kejayaan memulangkan null.
 */
export async function reserveMuatNaik(
  supa: any,
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
  const teks: string = error.message || String(error);
  const m = /QM_[A-Z_]+/.exec(teks);
  const kod = m ? m[0] : 'QM_UNKNOWN';
  // Buang awalan kod supaya klien memaparkan mesej yang boleh dibaca.
  const mesej = teks.replace(/^.*?QM_[A-Z_]+:\s*/, '').trim() || teks;
  return { status: statusKod(kod), body: { error: mesej, code: kod } };
}

/**
 * Panggil qm_record_upload. Kegagalan dicatat dalam log pelayan tetapi
 * TIDAK menggagalkan permintaan: fail sudah berada di storan, jadi
 * membalas 413 selepas bait sampai hanya mengelirukan pengguna. Merekod
 * gagal ialah ketidakselakuan yang perlu dibaiki, bukan ralat pengguna.
 */
export async function rekodMuatNaik(
  supa: any,
  pClass: string | null,
  fileCode: string,
  bytes: number,
  mime: string,
  source: string,
): Promise<void> {
  const { error } = await supa.rpc('qm_record_upload', {
    p_class: pClass,
    p_file_code: fileCode,
    p_bytes: bytes,
    p_mime: mime,
    p_source: source,
  });
  if (error) {
    console.error(
      `[kuota-storan] qm_record_upload gagal source=${source} code=${fileCode}: ${error.message}`,
    );
  }
}
