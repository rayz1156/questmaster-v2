/**
 * GET   /api/lna/rounds/[roundId]: maklumat pusingan + item + jawapan
 *        sendiri (pelajar dan guru).
 * PATCH /api/lna/rounds/[roundId]: tutup pusingan (guru sahaja).
 *
 * KZ-035. Pelajar membaca item pusingan terbuka dan jawapan sendiri
 * sahaja; laporan dan jawapan orang lain tidak pernah sampai ke sini.
 * Semasa menutup, `mastery_snapshot` disimpan dengan memanggil RPC
 * qm_mastery_summary menggunakan klien Bearer guru (corak
 * /api/analytics/mastery) supaya delta penguasaan pra/pasca boleh
 * dikira kemudian.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';
import { bacaJsonKecil } from '@/lib/bilikAi';
import { aksesRound, ralatLna, labelOutcome } from '@/lib/lnaAkses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(
  req: NextRequest,
  { params }: { params: { roundId: string } },
) {
  const akses = await aksesRound(req, String(params.roundId ?? ''));
  if (akses.response) return akses.response;
  const supa = akses.supa!;
  const round = akses.round!;
  const lna = akses.lna!;

  // Item LNA ikut susunan, dengan label Outcome.
  const { data: items, error: errItem } = await supa
    .from('qm_lna_items')
    .select('outcome_id, position, qm_learning_outcomes(label, code)')
    .eq('lna_id', lna.id)
    .order('position', { ascending: true });
  if (errItem) {
    console.error('[lna] baca item gagal:', errItem.message);
    return NextResponse.json({ error: 'Pusingan tidak dapat dibaca.' }, { status: 500 });
  }

  // Jawapan pemanggil sendiri sahaja (pelajar atau guru).
  const { data: mine, error: errMine } = await supa
    .from('qm_lna_responses')
    .select('outcome_id, importance, current_level, submitted_at')
    .eq('round_id', round.id)
    .eq('user_id', akses.user!.id);
  if (errMine) {
    console.error('[lna] baca jawapan sendiri gagal:', errMine.message);
    return NextResponse.json({ error: 'Pusingan tidak dapat dibaca.' }, { status: 500 });
  }

  return NextResponse.json({
    round: {
      id: round.id,
      lna_id: round.lna_id,
      kind: round.kind,
      status: round.status,
      opened_at: round.opened_at,
      closed_at: round.closed_at,
      title: lna.title,
    },
    items: ((items ?? []) as unknown as {
      outcome_id: string;
      position: number;
      qm_learning_outcomes: unknown;
    }[]).map((i) => ({
      outcomeId: i.outcome_id,
      position: i.position,
      label: labelOutcome(i.qm_learning_outcomes),
    })),
    myResponses: (mine ?? []).map((m: {
      outcome_id: string;
      importance: number;
      current_level: number;
      submitted_at: string;
    }) => ({
      outcomeId: m.outcome_id,
      importance: m.importance,
      currentLevel: m.current_level,
      submittedAt: m.submitted_at,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { roundId: string } },
) {
  const akses = await aksesRound(req, String(params.roundId ?? ''));
  if (akses.response) return akses.response;
  if (akses.role !== 'teacher') {
    return ralatLna(403, 'TEACHER_ONLY', 'Hanya guru boleh menutup pusingan.');
  }
  const supa = akses.supa!;
  const round = akses.round!;
  const lna = akses.lna!;

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  const body = hasil.body;

  const status = String(body.status ?? '');
  if (status !== 'closed') {
    return NextResponse.json(
      { error: 'status mesti closed.' },
      { status: 400 },
    );
  }
  if (round.status === 'closed') {
    return NextResponse.json(
      { error: 'Pusingan ini sudah ditutup.' },
      { status: 409 },
    );
  }

  // Snapshot penguasaan semasa pusingan ditutup: RPC dengan klien Bearer
  // guru (kebenaran disemak dalam qm_mastery_summary sendiri).
  const supaBearer = getRouteSupabase(req);
  const { data: snapshot, error: errRpc } = await supaBearer.rpc(
    'qm_mastery_summary',
    { p_class_id: lna.class_id },
  );
  if (errRpc || !snapshot) {
    console.error('[lna] mastery_snapshot gagal:', errRpc?.message);
    return NextResponse.json(
      { error: 'Pusingan tidak dapat ditutup.' },
      { status: 500 },
    );
  }

  const { data: roundTutup, error } = await supa
    .from('qm_lna_rounds')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      mastery_snapshot: snapshot,
    })
    .eq('id', round.id)
    .select('id, lna_id, kind, status, opened_at, closed_at')
    .single();
  if (error || !roundTutup) {
    console.error('[lna] tutup pusingan gagal:', error?.message);
    return NextResponse.json({ error: 'Pusingan tidak dapat ditutup.' }, { status: 500 });
  }

  return NextResponse.json({ round: roundTutup });
}
