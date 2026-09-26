import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas, balasRalatPeer } from '@/lib/peer-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai. Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * GET /api/classes/[id]/peer-rounds
 * Senarai pusingan penilaian rakan kelas ini (pendidik sahaja).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const ok = await semakPendidikKelas(auth.supa, params.id, auth.user!.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await auth.supa
    .from('qm_peer_rounds')
    .select('id, class_id, name, kind, week, opens_at, closes_at, computed_at, created_at')
    .eq('class_id', params.id)
    .order('opens_at', { ascending: true });
  if (error) return balasRalatPeer(error);
  return NextResponse.json({ rounds: data ?? [] });
}

/**
 * POST /api/classes/[id]/peer-rounds
 * Cipta pusingan penilaian. Fasa 1 hanya pusingan formatif; pusingan
 * bermarkah (sumatif) belum boleh dicipta. Had enam pusingan dan sekatan
 * pelan dikuatkuasakan oleh pencetus pangkalan data.
 * Badan: {name, opens_at, closes_at, week?}
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const ok = await semakPendidikKelas(auth.supa, params.id, auth.user!.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const opensAt = typeof body.opens_at === 'string' ? body.opens_at : '';
  const closesAt = typeof body.closes_at === 'string' ? body.closes_at : '';
  const week =
    Number.isInteger(body.week) && body.week >= 1 && body.week <= 52 ? body.week : null;

  if (!name) return NextResponse.json({ error: 'A round name is required.' }, { status: 400 });
  if (!opensAt || !closesAt || Number.isNaN(Date.parse(opensAt)) || Number.isNaN(Date.parse(closesAt))) {
    return NextResponse.json({ error: 'Valid open and close dates are required.' }, { status: 400 });
  }
  if (Date.parse(closesAt) <= Date.parse(opensAt)) {
    return NextResponse.json({ error: 'The close date must be after the open date.' }, { status: 400 });
  }
  // Fasa 1: sumatif dijangka datang kemudian.
  if (body.kind && body.kind !== 'formatif') {
    return NextResponse.json(
      { error: 'Marked (summative) rounds are not available yet. They will come in a later phase.' },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supa
    .from('qm_peer_rounds')
    .insert({
      class_id: params.id,
      name,
      kind: 'formatif',
      week,
      opens_at: new Date(opensAt).toISOString(),
      closes_at: new Date(closesAt).toISOString(),
      created_by: auth.user!.id,
    })
    .select('id, class_id, name, kind, week, opens_at, closes_at, computed_at, created_at')
    .single();
  if (error) return balasRalatPeer(error);
  return NextResponse.json({ round: data }, { status: 201 });
}