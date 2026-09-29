// adminUsers.ts
// Fungsi tulen senarai pengguna ruang kerja admin (V2-011b): penapis tab,
// carian dan status serta kiraan tab. Tiada pangkalan data di sini supaya
// kesemuanya boleh diuji oleh scripts/selftest-admin-ui.ts.
//
// Konvensyen: komen BM, teks paparan (label tab) Inggeris.

import type { Profile } from './types';
import type { UserMeta } from './data';

/** Kunci tab halaman Users. */
export type TabPengguna = 'all' | 'educators' | 'participants' | 'admins' | 'pending' | 'suspended';

/** Penapis lajur Email. */
export type StatusPengguna = 'all' | 'verified' | 'unverified' | 'expiring';

/** Pelan dikira "hampir tamat" bila tarikh tamat jatuh dalam tempoh ini. */
export const HARI_TAMAT_PELAN = 14;

/** Senarai tab mengikut turutan paparan. */
export const TAB_PENGGUNA: { key: TabPengguna; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'educators', label: 'Educators' },
  { key: 'participants', label: 'Participants' },
  { key: 'admins', label: 'Admins' },
  { key: 'pending', label: 'Pending approval' },
  { key: 'suspended', label: 'Suspended' },
];

/** Empat pelan sah untuk qm_set_plan (0040, V2-008). */
export type PelanAdmin = 'free' | 'pro' | 'institution' | 'unlimited';
export const PELAN_ADMIN: PelanAdmin[] = ['free', 'pro', 'institution', 'unlimited'];
export const LABEL_PELAN: Record<PelanAdmin, string> = {
  free: 'Free (quizzes only)',
  pro: 'Pro (all features)',
  institution: 'Institution (all features)',
  unlimited: 'Unlimited (internal)',
};
/** Label pendek untuk sel jadual. */
export const LABEL_PELAN_PENDEK: Record<PelanAdmin, string> = {
  free: 'Free',
  pro: 'Pro',
  institution: 'Institution',
  unlimited: 'Unlimited',
};

/** Pelan tersimpan profil; nilai lain dianggap free untuk paparan. */
export function pelanProfil(u: Profile): PelanAdmin {
  const p: string | undefined = u.plan;
  return PELAN_ADMIN.includes(p as PelanAdmin) ? (p as PelanAdmin) : 'free';
}

export interface PilihanTapis {
  tab: TabPengguna;
  q?: string;
  status: StatusPengguna;
  /** Masa rujukan disuntik supaya ujian tidak bergantung pada jam mesin. */
  now?: number | Date;
}

export interface PilihanKira {
  q?: string;
  status: StatusPengguna;
  now?: number | Date;
}

function masaKini(now?: number | Date): number {
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'number') return now;
  return Date.now();
}

/** Tarikh ISO kepada milisaat; null atau rentetan rosak menjadi null. */
function masaIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Pendidik menunggu kelulusan: educator, belum diluluskan, tidak digantung. */
export function pendingPendidik(u: Profile): boolean {
  return u.role === 'educator' && !u.approved && !u.suspended;
}

/** Emel belum disahkan: ada emel pada meta tetapi belum disahkan. */
export function emelBelumSah(id: string, meta: Record<string, UserMeta>): boolean {
  const m = meta[id];
  return !!m && !!m.email && !m.email_confirmed_at;
}

/**
 * Pelan tamat dalam 14 hari akan datang. Pelan yang SUDAH tamat tidak
 * dikira "expiring": label penapis bermaksud "akan tamat", bukan "sudah
 * tamat". Rentetan tarikh tidak sah diabaikan.
 */
export function pelanTamatDalam(u: Profile, now?: number | Date): boolean {
  const t = masaIso(u.plan_expires_at);
  if (t === null) return false;
  const kini = masaKini(now);
  return t > kini && t <= kini + HARI_TAMAT_PELAN * 86_400_000;
}

/** Carian nama, username dan emel, case-insensitive. */
export function padanCarian(u: Profile, meta: Record<string, UserMeta>, q: string): boolean {
  const jarum = q.trim().toLowerCase();
  if (!jarum) return true;
  const nama = (u.display_name || '').toLowerCase();
  const namaPengguna = (u.username || '').toLowerCase();
  const emel = (meta[u.id]?.email || '').toLowerCase();
  return nama.includes(jarum) || namaPengguna.includes(jarum) || emel.includes(jarum);
}

/** Padanan satu pengguna terhadap tab. */
export function padanTab(u: Profile, tab: TabPengguna): boolean {
  switch (tab) {
    case 'educators':
      return u.role === 'educator';
    case 'participants':
      return u.role === 'participant';
    case 'admins':
      return u.role === 'admin' || u.role === 'superadmin';
    case 'pending':
      return pendingPendidik(u);
    case 'suspended':
      return !!u.suspended;
    default:
      return true;
  }
}

/** Padanan satu pengguna terhadap penapis status emel/pelan. */
export function padanStatus(u: Profile, meta: Record<string, UserMeta>, status: StatusPengguna, now?: number | Date): boolean {
  if (status === 'verified') {
    const m = meta[u.id];
    return !!m && !!m.email_confirmed_at;
  }
  if (status === 'unverified') return emelBelumSah(u.id, meta);
  if (status === 'expiring') return pelanTamatDalam(u, now);
  return true;
}

/**
 * Penapis utama: tab dahulu, kemudian carian, kemudian status. Susunan
 * baris kekal seperti input (adminListProfiles susun created_at menurun).
 */
export function tapisPengguna(
  users: Profile[],
  meta: Record<string, UserMeta>,
  pilihan: PilihanTapis,
): Profile[] {
  const { tab, q = '', status, now } = pilihan;
  return users.filter(
    (u) => padanTab(u, tab) && padanCarian(u, meta, q) && padanStatus(u, meta, status, now),
  );
}

/**
 * Kiraan setiap tab DALAM konteks carian dan status semasa, supaya nombor
 * pada tab sepadan dengan apa yang pengguna akan lihat bila bertukar tab.
 */
export function kiraTab(
  users: Profile[],
  meta: Record<string, UserMeta>,
  pilihan: PilihanKira,
): Record<TabPengguna, number> {
  const kira = {} as Record<TabPengguna, number>;
  for (const t of TAB_PENGGUNA) {
    kira[t.key] = tapisPengguna(users, meta, {
      tab: t.key,
      q: pilihan.q,
      status: pilihan.status,
      now: pilihan.now,
    }).length;
  }
  return kira;
}
