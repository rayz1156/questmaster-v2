// =====================================================================
//  Jenama pemasangan, ditentukan semasa bina melalui NEXT_PUBLIC_BRAND.
//  NEXT_PUBLIC_ disuntik semasa bina, jadi selamat dalam komponen klien
//  dan pelayan. Satu kod, dua pemasangan (KZ-028a).
// =====================================================================

export const JENAMA = process.env.NEXT_PUBLIC_BRAND === 'veltrix' ? 'veltrix' : 'stafkita';

export type Jenama = typeof JENAMA;
