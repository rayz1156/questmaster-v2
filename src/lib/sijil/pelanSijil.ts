/**
 * Pelan yang layak latar/logo sijil sendiri dan sijil tanpa tera Kuizen
 * (CTO V2-015). Satu sumber untuk laluan aset, pratonton dan pengeluaran,
 * selari dengan pencetus qm_certificate_template_plan_guard (0052).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const PELAN_SIJIL_BERBAYAR = ['pro', 'institution', 'unlimited'] as const;

export function pelanSijilBerbayar(pelan: string | null | undefined): boolean {
  return !!pelan && (PELAN_SIJIL_BERBAYAR as readonly string[]).includes(pelan);
}

/** Pelan berkesan PEMILIK kelas; 'free' jika tidak dapat dibaca. */
export async function pelanPemilikKelas(supa: SupabaseClient, classId: string): Promise<string> {
  const { data: kelas } = await supa
    .from('qm_classes')
    .select('owner_id')
    .eq('id', classId)
    .maybeSingle();
  const ownerId = (kelas as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return 'free';
  const { data, error } = await supa.rpc('qm_effective_plan', { p_user: ownerId });
  return !error && typeof data === 'string' ? data : 'free';
}
