/**
 * Pembantu klien untuk penilaian rakan sebaya (bahagian pelayar).
 * Auth berdasarkan localStorage (storageKey 'qm-auth'); panggilan API
 * menghantar Authorization: Bearer, bukan kuki.
 */
import { supabase } from '@/lib/supabase';

/** Pengepala Bearer bagi panggilan API dari pelayar. */
export async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/** Panggil API penilaian dengan token pengguna semasa. */
export async function peerApi(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...(await authHeader()), ...(init?.headers ?? {}) };
  return fetch(url, { ...init, headers });
}

export type PusinganTerbuka = {
  round_id: string;
  name: string;
  class_id: string;
  closes_at: string;
};

/**
 * Pusingan terbuka pertama yang pelajar BELUM hantar sepenuhnya, untuk
 * sepanduk pada halaman Teams dan Home. Sepanduk hilang selepas dihantar.
 * Keahlian kelas dibaca melalui RLS (ahli kelas boleh membaca pusingan).
 */
export async function pusinganTerbukaBelumHantar(): Promise<PusinganTerbuka | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data: kelas } = await supabase
    .from('qm_class_members')
    .select('class_id')
    .eq('user_id', session.user.id);
  const classIds = (kelas ?? []).map((k: any) => k.class_id);
  if (classIds.length === 0) return null;

  const now = new Date().toISOString();
  const { data: rounds } = await supabase
    .from('qm_peer_rounds')
    .select('id, class_id, name, closes_at')
    .in('class_id', classIds)
    .lte('opens_at', now)
    .gte('closes_at', now)
    .order('opens_at', { ascending: true });
  if (!rounds || rounds.length === 0) return null;

  for (const r of rounds) {
    try {
      const { data: st } = await supabase.rpc('qm_peer_my_status', { p_round: r.id });
      const s = st as { submitted?: boolean } | null;
      if (!s || s.submitted !== true) {
        return { round_id: r.id, name: r.name, class_id: r.class_id, closes_at: r.closes_at };
      }
    } catch {
      // Fungsi status gagal (contoh bukan ahli): langkau pusingan ini.
    }
  }
  return null;
}