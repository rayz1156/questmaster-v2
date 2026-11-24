/**
 * Semakan pendidik kelas untuk laluan KZ-E: pemilik atau pendidik diterima
 * (qm_certificate_is_educator, sama dengan fungsi SQL tulis) dan akaun
 * tidak digantung. Pelan pemilik kelas untuk ciri e-mel.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function pendidikKelasAktif(supa: SupabaseClient, userId: string, classId: string): Promise<boolean> {
  const { data: prof } = await supa.from('qm_profiles').select('suspended').eq('id', userId).maybeSingle();
  if (!prof || prof.suspended) return false;
  const { data } = await supa.rpc('qm_certificate_is_educator', { p_class: classId });
  return data === true;
}

export async function pelanEmelKelas(supa: SupabaseClient, classId: string): Promise<boolean> {
  const { data: kelas } = await supa.from('qm_classes').select('owner_id').eq('id', classId).maybeSingle();
  const ownerId = (kelas as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return false;
  const { data } = await supa.rpc('qm_effective_plan', { p_user: ownerId });
  return data === 'pro' || data === 'institution' || data === 'unlimited';
}
