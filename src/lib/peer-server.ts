import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/supabase-route';
import { kodPeer, mesejPeer, statusPeer } from '@/lib/peer-mesej';

export { NextRequest, NextResponse };

/**
 * Semakan pendidik bagi laluan penilaian rakan: pemilik ATAU pendidik
 * kelas (jemputan sudah diterima). Pendidik ada dalam qm_class_educators
 * (educator_id), bukan qm_class_members (jadual peserta). Pentadbir yang
 * tidak digantung juga dibenarkan, selaras dengan corak laluan live quiz.
 */
export async function semakPendidikKelas(
  supa: SupabaseClient,
  classId: string,
  userId: string,
): Promise<boolean> {
  const { data: edu } = await supa
    .from('qm_class_educators')
    .select('educator_id')
    .eq('class_id', classId)
    .eq('educator_id', userId)
    .not('accepted_at', 'is', null)
    .maybeSingle();
  if (edu) return true;
  const { data: prof } = await supa
    .from('qm_profiles')
    .select('role, suspended')
    .eq('id', userId)
    .maybeSingle();
  return !!prof && !prof.suspended && ['admin', 'superadmin'].includes(prof.role);
}

/** Balas ralat pangkalan data sebagai mesej boleh baca dengan status betul. */
export function balasRalatPeer(e: { message?: string } | null | undefined): NextResponse {
  const kod = kodPeer(e);
  return NextResponse.json({ error: mesejPeer(e) }, { status: statusPeer(kod) });
}

/** Ambil satu pusingan dan sahkan pemanggil pendidik kelas itu. */
export async function pusinganPendidik(
  req: NextRequest,
  roundId: string,
): Promise<{ round: any | null; response: NextResponse | null }> {
  const auth = await requireUser(req);
  if (auth.response) return { round: null, response: auth.response };
  const { data: round } = await auth.supa
    .from('qm_peer_rounds')
    .select('id, class_id, name, kind, week, opens_at, closes_at, computed_at')
    .eq('id', roundId)
    .maybeSingle();
  if (!round) {
    return {
      round: null,
      response: NextResponse.json({ error: 'Evaluation round not found.' }, { status: 404 }),
    };
  }
  const ok = await semakPendidikKelas(auth.supa, round.class_id, auth.user!.id);
  if (!ok) {
    return {
      round: null,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { round, response: null };
}