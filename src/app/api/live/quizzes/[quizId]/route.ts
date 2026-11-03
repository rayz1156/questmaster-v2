import { NextRequest, NextResponse } from 'next/server';
import { requireQuizHost } from '@/lib/live-quiz';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/** GET /api/live/quizzes/[quizId], kuiz + soalan. Hos nampak correct_key. */
export async function GET(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const { data: questions, error } = await host.supa
    .from('qm_live_questions')
    .select('id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec, use_countdown, double_points')
    .eq('quiz_id', params.quizId)
    .order('order_idx');

  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ data: { quiz: host.quiz, questions: questions || [] } });
}

/** PATCH /api/live/quizzes/[quizId], badan: {title?,description?} */
export async function PATCH(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string') {
    if (!body.title.trim()) return ralatJson('The title cannot be empty.', 400);
    patch.title = body.title.trim();
  }
  if (typeof body.description === 'string') patch.description = body.description;
  if (body.streak_bonus !== undefined) {
    if (typeof body.streak_bonus !== 'boolean') {
      return ralatJson('streak_bonus must be true or false.', 400);
    }
    patch.streak_bonus = body.streak_bonus;
  }
  if (Object.keys(patch).length === 0) {
    return ralatJson('No fields to update.', 400);
  }

  const { data: quiz, error } = await host.supa
    .from('qm_live_quizzes')
    .update(patch)
    .eq('id', params.quizId)
    .select('id, class_id, owner_id, title, description, created_at, streak_bonus')
    .single();

  if (error || !quiz) {
    return ralatJson(error?.message || 'Update failed.', 500);
  }
  return NextResponse.json({ data: quiz });
}

/** DELETE /api/live/quizzes/[quizId] */
export async function DELETE(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const { error } = await host.supa
    .from('qm_live_quizzes')
    .delete()
    .eq('id', params.quizId);

  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ ok: true });
}
