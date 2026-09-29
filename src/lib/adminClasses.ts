// adminClasses.ts
// Fungsi tulen senarai kelas ruang kerja admin (V2-011c): tab, carian,
// penapis pendidik dan susunan. Tiada pangkalan data di sini supaya
// semua boleh diuji oleh scripts/selftest-admin-ranking.ts.
//
// Konvensyen: komen BM, teks paparan (label tab) Inggeris.

/** Baris qm_classes yang diperlukan halaman Classes. */
export interface KelasAdmin {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  join_code?: string | null;
  is_archived?: boolean | null;
  ended_at?: string | null;
  created_at: string;
  owner_id: string;
  scoring_mode?: string | null;
  leaderboard_visible?: boolean | null;
}

/** Kunci tab halaman Classes. */
export type TabKelas = 'all' | 'active' | 'ended' | 'archived';

/** Susunan senarai kelas. */
export type SusunKelas = 'newest' | 'name' | 'members';

/** Senarai tab mengikut turutan paparan. */
export const TAB_KELAS: { key: TabKelas; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'ended', label: 'Ended' },
  { key: 'archived', label: 'Archived' },
];

/**
 * Status paparan satu kelas. Diarkib menang ke atas Ended kerana tab
 * Archived ialah tempat pentadbir mencari kelas yang sudah disimpan.
 */
export function statusKelas(k: KelasAdmin): TabKelas {
  if (k.is_archived) return 'archived';
  if (k.ended_at) return 'ended';
  return 'active';
}

/** Label pil status kelas. */
export function labelStatusKelas(k: KelasAdmin): string {
  const s = statusKelas(k);
  if (s === 'archived') return 'Archived';
  if (s === 'ended') return 'Ended';
  return 'Active';
}

export interface PilihanTapisKelas {
  tab: TabKelas;
  q?: string;
  /** Id pemilik kelas; '' bermakna semua pendidik. */
  educatorId?: string;
  susun?: SusunKelas;
  /** Peta kiraan ahli untuk susunan Most members. */
  kiraanAhli?: Record<string, number>;
}

/** Carian nama dan join_code, tidak peka huruf besar. */
export function padanCarianKelas(k: KelasAdmin, q: string): boolean {
  const jarum = q.trim().toLowerCase();
  if (!jarum) return true;
  const nama = String(k.name || '').toLowerCase();
  const kod = String(k.join_code || '').toLowerCase();
  return nama.includes(jarum) || kod.includes(jarum);
}

/** Padanan satu kelas terhadap tab. */
export function padanTabKelas(k: KelasAdmin, tab: TabKelas): boolean {
  if (tab === 'all') return true;
  return statusKelas(k) === tab;
}

/** Penapis utama senarai kelas, termasuk susunan. */
export function tapisKelas(kelas: KelasAdmin[], pilihan: PilihanTapisKelas): KelasAdmin[] {
  const { tab, q = '', educatorId = '', susun = 'newest', kiraanAhli = {} } = pilihan;
  const ditapis = kelas.filter(
    (k) =>
      padanTabKelas(k, tab) &&
      padanCarianKelas(k, q) &&
      (!educatorId || k.owner_id === educatorId),
  );
  const salinan = [...ditapis];
  if (susun === 'name') {
    salinan.sort((a, b) => {
      const na = String(a.name || '').toLowerCase();
      const nb = String(b.name || '').toLowerCase();
      if (na !== nb) return na < nb ? -1 : 1;
      return a.created_at < b.created_at ? 1 : -1;
    });
  } else if (susun === 'members') {
    salinan.sort((a, b) => {
      const ma = kiraanAhli[a.id] || 0;
      const mb = kiraanAhli[b.id] || 0;
      if (ma !== mb) return mb - ma;
      return a.created_at < b.created_at ? 1 : -1;
    });
  } else {
    // Terbaru dahulu; created_at menurun.
    salinan.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
  return salinan;
}

/**
 * Kiraan setiap tab dalam konteks carian dan penapis pendidik semasa,
 * supaya nombor pada tab sepadan dengan apa yang pentadbir akan lihat.
 */
export function kiraTabKelas(
  kelas: KelasAdmin[],
  pilihan: { q?: string; educatorId?: string },
): Record<TabKelas, number> {
  const kira = {} as Record<TabKelas, number>;
  for (const t of TAB_KELAS) {
    kira[t.key] = tapisKelas(kelas, {
      tab: t.key,
      q: pilihan.q,
      educatorId: pilihan.educatorId,
    }).length;
  }
  return kira;
}
