/**
 * Pembantu ralat API dwibahasa (KZ-043 A5).
 *
 * Laluan API menyimpan mesej ralat dalam English (sumber) dan memanggil
 * `ralatJson`; mesej dipulangkan kepada pengguna mengikut kuki `kz_lang`
 * permintaan itu. Rentetan yang tiada dalam jadual terjemahan dipulangkan
 * tanpa ubah, jadi mesej mesin (contoh `error.message` Supabase, kod
 * ralat seperti PLAN_LIMIT) tidak pernah rosak.
 *
 * Pelayan sahaja: `bahasaPelayan()` membaca kuki menerusi `cookies()`.
 */

import { NextResponse } from 'next/server';
import { bahasaPelayan } from './pelayan';
import { RALAT_MS } from './kamus/ralat-api.ms';
import type { Bahasa } from './index';

/**
 * Terjemah satu mesej ralat English kepada bahasa yang diminta.
 * Bahasa English (atau mesej yang tiada padanan) dipulangkan seperti asal.
 */
export function terjemahRalat(bahasa: Bahasa, mesejEn: string): string {
  if (bahasa !== 'ms') return mesejEn;
  return RALAT_MS[mesejEn] ?? mesejEn;
}

/**
 * Balasan ralat JSON dalam bahasa peminta. Bentuk `{ error: string }` dan
 * status HTTP tidak berubah berbanding `NextResponse.json` terus.
 * Medan tambahan (contoh `{ code }`) dikekalkan di hadapan `error`.
 */
export function ralatJson(
  mesejEn: string,
  status: number,
  tambahan?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { ...tambahan, error: terjemahRalat(bahasaPelayan(), mesejEn) },
    { status },
  );
}
