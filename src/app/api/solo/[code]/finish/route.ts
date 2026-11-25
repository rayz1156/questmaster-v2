import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import {
  barisPapanLarian,
  kedudukanLarian,
  muatKuizSolo,
  semakLarian,
} from '@/lib/lumba-solo-api';
import { kiraElapsedMs } from '@/lib/lumba-solo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * POST /api/solo/[code]/finish, pengepala x-run-token.
 *
 * Tamatkan larian: pemain boleh menamatkan lumba pada bila masa (soalan
 * yang tinggal tidak dikira), atau memanggil selepas semua soalan dijawab.
 * Larian yang sudah finished atau expired ditolak (409). elapsed_ms sentiasa
 * dikira pelayan daripada started_at dan finished_at.
 */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const svc = getServiceSupabase();
  const kuiz = await muatKuizSolo(svc, params.code);
  if (!kuiz) return ralatJson('Challenge not found.', 404);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const semakan = await semakLarian(req, svc, kuiz, body.runToken);
  if (semakan.response) return semakan.response;
  const larian = semakan.larian!;
  if (larian.status !== 'playing') {
    return ralatJson('This run has already finished.', 409);
  }

  const tamat = new Date().toISOString();
  const { data: upd, error } = await svc
    .from('qm_solo_runs')
    .update({
      finished_at: tamat,
      elapsed_ms: kiraElapsedMs(larian.started_at, tamat),
      status: 'finished',
    })
    .eq('id', larian.id)
    .eq('status', 'playing')
    .select(
      'id, quiz_id, user_id, nickname, token_hash, question_ids, next_idx, served_at, started_at, finished_at, score, correct, wrong, elapsed_ms, status, test_mode, measure_point',
    )
    .maybeSingle();
  if (error) return ralatJson('Could not finish the run.', 503);
  if (!upd) return ralatJson('This run has already finished.', 409);

  const selesai = upd as unknown as typeof larian & { elapsed_ms: number | null };
  const { rank, best } = await kedudukanLarian(svc, kuiz.id, barisPapanLarian(selesai));

  // KZ-UTT: mod ujian tidak memulangkan bilangan betul atau salah.
  if (selesai.test_mode === true) {
    return NextResponse.json({
      score: selesai.score,
      elapsedMs: selesai.elapsed_ms,
      rank,
      best,
      testMode: true,
    });
  }

  return NextResponse.json({
    score: selesai.score,
    correct: selesai.correct,
    wrong: selesai.wrong,
    elapsedMs: selesai.elapsed_ms,
    rank,
    best,
  });
}