import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { balasRalatPeer } from '@/lib/peer-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/peer-rounds/[roundId]/form
 * Borang pelajar: senarai rakan sekumpulan yang perlu dinilai (TANPA diri
 * sendiri) dan status penghantaran. Maklumat status datang daripada
 * public.qm_peer_my_status; tiada skor, bendera atau keputusan rakan.
 */
export async function GET(req: NextRequest, { params }: { params: { roundId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  // Pelajar kelas boleh membaca baris pusingan (RLS p_pr_read).
  const { data: round } = await auth.supa
    .from('qm_peer_rounds')
    .select('id, class_id, name, kind, week, opens_at, closes_at')
    .eq('id', params.roundId)
    .maybeSingle();
  if (!round) {
    return NextResponse.json({ error: 'Evaluation round not found.' }, { status: 404 });
  }

  const { data: status, error: sErr } = await auth.supa.rpc('qm_peer_my_status', {
    p_round: params.roundId,
  });
  if (sErr) return balasRalatPeer(sErr);
  const st = (status ?? {}) as {
    in_team?: boolean;
    team_id?: string | null;
    submitted?: boolean;
    submitted_count?: number;
    total_to_evaluate?: number;
  };

  if (!st.in_team || !st.team_id) {
    return NextResponse.json({
      round,
      in_team: false,
      team_id: null,
      teammates: [],
      submitted: false,
      submitted_count: 0,
      total_to_evaluate: 0,
    });
  }

  // Rakan sekumpulan: ahli kumpulan itu, tanpa diri sendiri.
  const { data: members, error: mErr } = await auth.supa
    .from('qm_team_members')
    .select('user_id')
    .eq('team_id', st.team_id)
    .neq('user_id', auth.user!.id);
  if (mErr) return balasRalatPeer(mErr);

  const ids = (members ?? []).map((m: any) => m.user_id);
  let teammates: { id: string; name: string }[] = [];
  if (ids.length > 0) {
    const { data: profs, error: pErr } = await auth.supa
      .from('qm_profiles')
      .select('id, display_name')
      .in('id', ids);
    if (pErr) return balasRalatPeer(pErr);
    // Susunan tetap mengikut susunan ahli, bukan hasil pertanyaan.
    const nameOf = new Map((profs ?? []).map((p: any) => [p.id, p.display_name || '']));
    teammates = ids.map((id) => ({ id, name: nameOf.get(id) || '' }));
  }

  return NextResponse.json({
    round,
    in_team: true,
    team_id: st.team_id,
    teammates,
    submitted: st.submitted ?? false,
    submitted_count: st.submitted_count ?? 0,
    total_to_evaluate: st.total_to_evaluate ?? 0,
  });
}