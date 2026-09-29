// adminHunts.ts
// Fungsi tulen senarai aktiviti (hunts) ruang kerja admin (V2-011c):
// tab status, carian tajuk dan penapis kelas. Tiada pangkalan data di
// sini supaya semua boleh diuji oleh scripts/selftest-admin-ranking.ts.
//
// Konvensyen: komen BM, teks paparan (label tab) Inggeris.

import type { Hunt } from './types';

/** Kunci tab halaman Activities. */
export type TabAktiviti = 'all' | 'active' | 'draft' | 'archived';

/** Senarai tab mengikut turutan paparan. */
export const TAB_AKTIVITI: { key: TabAktiviti; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Draft' },
  { key: 'archived', label: 'Archived' },
];

export interface PilihanTapisAktiviti {
  tab: TabAktiviti;
  q?: string;
  /** Id kelas; '' bermakna semua kelas. */
  classId?: string;
}

/** Carian tajuk aktiviti, tidak peka huruf besar. */
export function padanCarianAktiviti(h: Hunt, q: string): boolean {
  const jarum = q.trim().toLowerCase();
  if (!jarum) return true;
  return String(h.title || '').toLowerCase().includes(jarum);
}

/** Padanan satu aktiviti terhadap tab status. */
export function padanTabAktiviti(h: Hunt, tab: TabAktiviti): boolean {
  if (tab === 'all') return true;
  return h.status === tab;
}

/** Penapis utama senarai aktiviti. Susunan kekal created_at menurun. */
export function tapisAktiviti(hunts: Hunt[], pilihan: PilihanTapisAktiviti): Hunt[] {
  const { tab, q = '', classId = '' } = pilihan;
  return hunts.filter(
    (h) =>
      padanTabAktiviti(h, tab) &&
      padanCarianAktiviti(h, q) &&
      (!classId || h.class_id === classId),
  );
}

/**
 * Kiraan setiap tab dalam konteks carian dan penapis kelas semasa,
 * supaya nombor pada tab sepadan dengan paparan selepas bertukar tab.
 */
export function kiraTabAktiviti(
  hunts: Hunt[],
  pilihan: { q?: string; classId?: string },
): Record<TabAktiviti, number> {
  const kira = {} as Record<TabAktiviti, number>;
  for (const t of TAB_AKTIVITI) {
    kira[t.key] = tapisAktiviti(hunts, {
      tab: t.key,
      q: pilihan.q,
      classId: pilihan.classId,
    }).length;
  }
  return kira;
}
