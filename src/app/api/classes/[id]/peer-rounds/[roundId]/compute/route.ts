import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';
import { balasRalatPeer, pusinganPendidik } from '@/lib/peer-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * POST /api/classes/[id]/peer-rounds/[roundId]/compute
 * Jalankan public.qm_peer_compute bagi pusingan ini (pendidik sahaja).
 * Kebenaran dan sekatan pelan disemak di dalam fungsi pangkalan data itu
 * sendiri, kerana konteks SECURITY DEFINER membutakan penjaga pencetus.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; roundId: string } }) {
  const cek = await pusinganPendidik(req, params.roundId);
  if (cek.response) return cek.response;

  const supa = getRouteSupabase(req);
  const { data, error } = await supa.rpc('qm_peer_compute', { p_round: params.roundId });
  if (error) return balasRalatPeer(error);
  return NextResponse.json({ written: data ?? 0 });
}