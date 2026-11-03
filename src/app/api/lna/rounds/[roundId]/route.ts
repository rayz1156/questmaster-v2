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
import { senaraiMasteryDaripadaSummary } from '@/lib/lna';
import { ralatJson } from '@/lib/i18n/ralatApi';

// Pembetulan CTO (kzsec #2): simpan hanya medan yang diperlukan enjin skor
// (user_id, outcome_id, mastery_pct, scored), tanpa nama pelajar. Bentuk
// kekal serasi dengan senaraiMasteryDaripadaSummary.
function snapshotMinimum(ringkasan: unknown) {
  const ikutPelajar = new Map<string, { outcome_id: string; mastery_pct: number | null; scored: number }[]>();
  for (const m of senaraiMasteryDaripadaSummary(ringkasan)) {
    const senarai = ikutPelajar.get(m.userId) ?? [];
    senarai.push({ outcome_id: m.outcomeId, mastery_pct: m.masteryPct, scored: m.scored });
    ikutPelajar.set(m.userId, senarai);
  }
  return {
    disimpan_pada: new Date().toISOString(),
    students: Array.from(ikutPelajar.entries()).map(([user_id, outcomes]) => ({ user_id, outcomes })),
  };
}

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

  // Item LNA ikut susunan (KZ-038: kunci itemId; item Outcome membawa
  // label Outcome, item bebas membawa label sendiri).
  const { data: items, error: errItem } = await supa
    .from('qm_lna_items')
    .select('id, outcome_id, label, position, qm_learning_outcomes(label, code)')
    .eq('lna_id', lna.id)
    .order('position', { ascending: true });
  if (errItem) {
    console.error('[lna] baca item gagal:', errItem.message);
    return ralatJson('The round could not be read.', 500);
  }

  // Jawapan pemanggil sendiri sahaja (pelajar atau guru), dikunci item.
  const { data: mine, error: errMine } = await supa
    .from('qm_lna_responses')
    .select('item_id, importance, current_level, submitted_at')
    .eq('round_id', round.id)
    .eq('user_id', akses.user!.id);
  if (errMine) {
    console.error('[lna] baca jawapan sendiri gagal:', errMine.message);
    return ralatJson('The round could not be read.', 500);
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
      id: string;
      outcome_id: string | null;
      label: string | null;
      position: number;
      qm_learning_outcomes: unknown;
    }[]).map((i) => ({
      itemId: i.id,
      outcomeId: i.outcome_id,
      label: i.outcome_id != null
        ? labelOutcome(i.qm_learning_outcomes)
        : (i.label ?? ''),
      kind: i.outcome_id != null ? 'outcome' as const : 'bebas' as const,
      position: i.position,
    })),
    myResponses: (mine ?? []).map((m: {
      item_id: string;
      importance: number;
      current_level: number;
      submitted_at: string;
    }) => ({
      itemId: m.item_id,
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
    return ralatJson('status must be closed.', 400);
  }
  if (round.status === 'closed') {
    return ralatJson('This round is already closed.', 409);
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
    return ralatJson('The round could not be closed.', 500);
  }

  const { data: roundTutup, error } = await supa
    .from('qm_lna_rounds')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      mastery_snapshot: snapshotMinimum(snapshot),
    })
    .eq('id', round.id)
    .select('id, lna_id, kind, status, opened_at, closed_at')
    .single();
  if (error || !roundTutup) {
    console.error('[lna] tutup pusingan gagal:', error?.message);
    return ralatJson('The round could not be closed.', 500);
  }

  return NextResponse.json({ round: roundTutup });
}
