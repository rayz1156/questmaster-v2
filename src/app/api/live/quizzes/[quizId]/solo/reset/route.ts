import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import { requireQuizHost } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * POST /api/live/quizzes/[quizId]/solo/reset
 *
 * Padam SEMUA larian kuiz ini (jawapan ikut cascade). UI meminta
 * pengesahan sebelum memanggil laluan ini.
 */
export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from('qm_solo_runs')
    .delete()
    .eq('quiz_id', params.quizId)
    .select('id');

  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ ok: true, deleted: (data ?? []).length });
}