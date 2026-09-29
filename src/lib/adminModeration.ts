// adminModeration.ts
// Fungsi tulen senarai moderasi ruang kerja admin (V2-011c): tab
// Pending/Reviewed/All dan pengecualian jawapan benih SEED::. Tiada
// pangkalan data di sini supaya semua boleh diuji oleh
// scripts/selftest-admin-ranking.ts.
//
// Konvensyen: komen BM, teks paparan (label tab) Inggeris.

import type { Submission } from './types';

/** Kunci tab halaman Moderation. */
export type TabModerasi = 'pending' | 'reviewed' | 'all';

/** Senarai tab mengikut turutan paparan. */
export const TAB_MODERASI: { key: TabModerasi; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'all', label: 'All' },
];

/**
 * Jawapan benih bermula "SEED::" bukan karya peserta; ia tidak pernah
 * muncul dalam senarai moderasi atau kiraan tab.
 */
export function bukanSeed(s: Submission): boolean {
  return !(typeof s.answer === 'string' && s.answer.startsWith('SEED::'));
}

/** Padanan satu submission terhadap tab. */
export function padanTabModerasi(s: Submission, tab: TabModerasi): boolean {
  if (tab === 'pending') return s.status === 'pending';
  if (tab === 'reviewed') return s.status === 'approved' || s.status === 'rejected';
  return true;
}

/** Penapis utama: tab dahulu, kemudian buang jawapan SEED::. */
export function tapisModerasi(subs: Submission[], tab: TabModerasi): Submission[] {
  return subs.filter((s) => padanTabModerasi(s, tab) && bukanSeed(s));
}

/** Kiraan setiap tab, jawapan SEED:: sentiasa dikecualikan. */
export function kiraTabModerasi(subs: Submission[]): Record<TabModerasi, number> {
  const kira = {} as Record<TabModerasi, number>;
  for (const t of TAB_MODERASI) {
    kira[t.key] = tapisModerasi(subs, t.key).length;
  }
  return kira;
}

/**
 * Indeks submission terpilih daripada senarai dipapar: cari baris itu
 * dalam senarai supaya panel kanan dan senarai kiri sepadan walaupun
 * penomboran aktif. Pulangkan -1 bila tiada.
 */
export function indeksTerpilih(
  subs: Submission[],
  id: string | null,
): number {
  if (!id) return -1;
  return subs.findIndex((s) => s.id === id);
}
