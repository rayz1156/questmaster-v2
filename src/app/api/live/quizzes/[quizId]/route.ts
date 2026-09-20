import { NextRequest, NextResponse } from 'next/server';
import { requireQuizHost } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/live/quizzes/[quizId] — kuiz + soalan. Hos nampak correct_key. */
export async function GET(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const { data: questions, error } = await host.supa
    .from('qm_live_questions')
    .select('id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec')
    .eq('quiz_id', params.quizId)
    .order('order_idx');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { quiz: host.quiz, questions: questions || [] } });
}

/** PATCH /api/live/quizzes/[quizId] — badan: {title?,description?} */
export async function PATCH(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string') {
    if (!body.title.trim()) return NextResponse.json({ error: 'Tajuk tidak boleh kosong.' }, { status: 400 });
    patch.title = body.title.trim();
  }
  if (typeof body.description === 'string') patch.description = body.description;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Tiada medan untuk dikemas kini.' }, { status: 400 });
  }

  const { data: quiz, error } = await host.supa
    .from('qm_live_quizzes')
    .update(patch)
    .eq('id', params.quizId)
    .select('id, class_id, owner_id, title, description, created_at')
    .single();

  if (error || !quiz) {
    return NextResponse.json({ error: error?.message || 'Kemas kini gagal.' }, { status: 500 });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
