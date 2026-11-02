/**
 * Pembantu bahasa untuk komponen pelayan (KZ-040).
 *
 * Hanya boleh diimport oleh fail yang berjalan di pelayan (layout, metadata,
 * route handler). Komponen klien membaca bahasa menerusi `BahasaProvider`
 * dalam `src/lib/i18n/BahasaProvider.tsx`.
 *
 * Nilai kuki `kz_lang` tidak dipercayai: ia melalui `sahBahasa` yang hanya
 * menerima 'en' / 'ms', jadi kuki terogut tidak boleh menyuntik apa-apa
 * selain memilih antara dua kamus yang ada.
 */

import { cookies } from 'next/headers';
import { NAMA_KUKI, sahBahasa, BAHASA_LALAI, type Bahasa } from './index';

/**
 * Bahasa semasa permintaan, dibaca daripada kuki `kz_lang`.
 * Tiada kuki atau nilai tidak dikenali memulangkan English.
 */
export function bahasaPelayan(): Bahasa {
  try {
    const kuki = cookies();
    return sahBahasa(kuki.get(NAMA_KUKI)?.value);
  } catch {
    // cookies() boleh gagal dalam konteks yang bukan permintaan (contoh:
    // penjana statik); pengguna baharu tetap menerima English.
    return BAHASA_LALAI;
  }
}