import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import { requireQuizHost } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * DELETE /api/live/quizzes/[quizId]/solo/runs/[runId]
 *
 * Padam satu larian (contoh nama tidak sopan). Jawapan dipadam bersama
 * (on delete cascade). Larian mesti milik kuiz ini.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { quizId: string; runId: string } },
) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const svc = getServiceSupabase();
  const { data: padam } = await svc
    .from('qm_solo_runs')
    .delete()
    .eq('id', params.runId)
    .eq('quiz_id', params.quizId)
    .select('id')
    .maybeSingle();

  if (!padam) return ralatJson('Run not found.', 404);
  return NextResponse.json({ ok: true });
}