import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';
import { balasRalatPeer, pusinganPendidik } from '@/lib/peer-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * PATCH /api/classes/[id]/peer-rounds/[roundId]
 * Sunting nama, minggu atau tarikh pusingan (pendidik sahaja).
 * Badan: {name?, week?, opens_at?, closes_at?}
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; roundId: string } }) {
  const cek = await pusinganPendidik(req, params.roundId);
  if (cek.response) return cek.response;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (Number.isInteger(body.week) && body.week >= 1 && body.week <= 52) patch.week = body.week;
  if (typeof body.opens_at === 'string' && !Number.isNaN(Date.parse(body.opens_at))) {
    patch.opens_at = new Date(body.opens_at).toISOString();
  }
  if (typeof body.closes_at === 'string' && !Number.isNaN(Date.parse(body.closes_at))) {
    patch.closes_at = new Date(body.closes_at).toISOString();
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }
  if (
    patch.opens_at &&
    patch.closes_at &&
    Date.parse(String(patch.closes_at)) <= Date.parse(String(patch.opens_at))
  ) {
    return NextResponse.json({ error: 'The close date must be after the open date.' }, { status: 400 });
  }
  // Suntingan tarikh sebelah sahaja: banding dengan nilai sedia ada.
  if (patch.opens_at && !patch.closes_at && Date.parse(String(patch.opens_at)) >= Date.parse(String(cek.round!.closes_at))) {
    return NextResponse.json({ error: 'The close date must be after the open date.' }, { status: 400 });
  }
  if (patch.closes_at && !patch.opens_at && Date.parse(String(patch.closes_at)) <= Date.parse(String(cek.round!.opens_at))) {
    return NextResponse.json({ error: 'The close date must be after the open date.' }, { status: 400 });
  }

  const supa = getRouteSupabase(req);
  const { data, error } = await supa
    .from('qm_peer_rounds')
    .update(patch)
    .eq('id', params.roundId)
    .select('id, class_id, name, kind, week, opens_at, closes_at, computed_at')
    .single();
  if (error) return balasRalatPeer(error);
  return NextResponse.json({ round: data });
}

/**
 * DELETE /api/classes/[id]/peer-rounds/[roundId]
 * Padam pusingan, hanya jika tiada rekod penilaian lagi.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string; roundId: string } }) {
  const cek = await pusinganPendidik(req, params.roundId);
  if (cek.response) return cek.response;

  const supa = getRouteSupabase(req);
  const { count } = await supa
    .from('qm_peer_ratings')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', params.roundId);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'This round already has submitted evaluations and cannot be deleted.' },
      { status: 409 },
    );
  }

  const { error } = await supa.from('qm_peer_rounds').delete().eq('id', params.roundId);
  if (error) return balasRalatPeer(error);
  return NextResponse.json({ ok: true });
}