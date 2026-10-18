// =====================================================================
//  Pemilih lapisan teks mengikut jenama pemasangan, KZ-028a.
//  Veltrix Academy (NEXT_PUBLIC_BRAND='veltrix') guna Inggeris (en-MY),
//  StafKita Akademi (lalai) guna Bahasa Melayu (ms-MY).
// =====================================================================
import { JENAMA } from '@/lib/brand';
import { ms } from './ms';
import { en } from './en';

export const teks: typeof ms = JENAMA === 'veltrix' ? en : ms;

// Lokal tarikh paparan
export const LOKAL = JENAMA === 'veltrix' ? 'en-MY' : 'ms-MY';
