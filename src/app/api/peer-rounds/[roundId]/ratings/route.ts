import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { kodPeer, mesejPeer, statusPeer } from '@/lib/peer-mesej';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type Kriteria = { ratee_id: string; k1: number; k2: number; k3: number; k4: number; k5: number; justification?: string | null };

/**
 * POST /api/peer-rounds/[roundId]/ratings
 * Hantar penilaian untuk SEMUA rakan dalam satu badan. Semua baris
 * dimasukkan dalam SATU permintaan PostgREST, iaitu satu transaksi:
 * penghantaran separuh tidak mungkin, kerana r(i) rakan lain akan tidak
 * lengkap tanpa sesiapa menyedarinya.
 * Badan: {ratings: [{ratee_id, k1..k5, justification?}]}
 */
export async function POST(req: NextRequest, { params }: { params: { roundId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const body = await req.json().catch(() => ({}));
  const masuk: Kriteria[] = Array.isArray(body.ratings) ? body.ratings : [];
  if (masuk.length === 0) {
    return NextResponse.json({ error: 'No ratings were submitted.' }, { status: 400 });
  }
  if (masuk.length > 50) {
    return NextResponse.json({ error: 'Too many ratings in one submission.' }, { status: 400 });
  }
  for (const m of masuk) {
    const kriteria = [m.k1, m.k2, m.k3, m.k4, m.k5];
    const sah = typeof m.ratee_id === 'string' && m.ratee_id.length === 36 && m.ratee_id !== auth.user!.id
      && kriteria.every((k) => Number.isInteger(k) && k >= 0 && k <= 2);
    if (!sah) {
      return NextResponse.json(
        { error: 'Each rating needs a teammate and five scores between 0 and 2.' },
        { status: 400 },
      );
    }
  }

  // Kumpulan pelajar ini bagi pusingan itu (fungsi pangkalan data yang
  // sama yang memberi status borang).
  const { data: status, error: sErr } = await auth.supa.rpc('qm_peer_my_status', {
    p_round: params.roundId,
  });
  if (sErr) {
    const kod = kodPeer(sErr);
    return NextResponse.json({ error: mesejPeer(sErr) }, { status: statusPeer(kod) });
  }
  const st = (status ?? {}) as { in_team?: boolean; team_id?: string | null; submitted_count?: number; total_to_evaluate?: number };
  if (!st.in_team || !st.team_id) {
    return NextResponse.json({ error: 'You are not in a group for this round.' }, { status: 403 });
  }
  if ((st.submitted_count ?? 0) >= (st.total_to_evaluate ?? 0) && (st.total_to_evaluate ?? 0) > 0) {
    return NextResponse.json({ error: 'You have already submitted ratings for this round.' }, { status: 409 });
  }

  const baris = masuk.map((m) => ({
    round_id: params.roundId,
    team_id: st.team_id,
    rater_id: auth.user!.id,
    ratee_id: m.ratee_id,
    k1: m.k1,
    k2: m.k2,
    k3: m.k3,
    k4: m.k4,
    k5: m.k5,
    justification:
      typeof m.justification === 'string' && m.justification.trim() ? m.justification.trim() : null,
  }));

  // SATU permintaan = SATU transaksi; kegagalan mana mana baris
  // menggulung semula semuanya (semua atau tiada).
  const { error } = await auth.supa.from('qm_peer_ratings').insert(baris);
  if (error) {
    // Pelanggaran unique: sudah pernah menghantar sebahagian atau semua.
    if ((error as any).code === '23505') {
      return NextResponse.json({ error: 'You have already submitted ratings for this round.' }, { status: 409 });
    }
    const kod = kodPeer(error);
    return NextResponse.json({ error: mesejPeer(error) }, { status: statusPeer(kod) });
  }
  return NextResponse.json({ ok: true, submitted: baris.length }, { status: 201 });
}