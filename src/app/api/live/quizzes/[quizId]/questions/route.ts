import { NextRequest, NextResponse } from 'next/server';
import { requireQuizHost, validateOptions } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/live/quizzes/[quizId]/questions — tambah soalan. */
export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return NextResponse.json({ error: 'Soalan (prompt) diperlukan.' }, { status: 400 });

  const opts = validateOptions(body.options);
  if (!opts.ok) return NextResponse.json({ error: opts.error }, { status: 400 });

  const correctKey = typeof body.correct_key === 'string' ? body.correct_key : body.correctKey;
  if (typeof correctKey !== 'string' || !opts.keys!.includes(correctKey)) {
    return NextResponse.json({ error: 'correct_key mesti salah satu kunci pilihan.' }, { status: 400 });
  }

  const points = Number.isFinite(Number(body.points)) ? Math.max(1, Math.floor(Number(body.points))) : 1000;
  const timeLimitSec = Number.isFinite(Number(body.time_limit_sec))
    ? Math.max(5, Math.floor(Number(body.time_limit_sec)))
    : 20;

  const { data: last } = await host.supa
    .from('qm_live_questions')
    .select('order_idx')
    .eq('quiz_id', params.quizId)
    .order('order_idx', { ascending: false })
    .limit(1);
  const orderIdx = ((last && last[0]?.order_idx) ?? -1) + 1;

  const { data: question, error } = await host.supa
    .from('qm_live_questions')
    .insert({
      quiz_id: params.quizId,
      order_idx: orderIdx,
      prompt,
      options: body.options,
      correct_key: correctKey,
      points,
      time_limit_sec: timeLimitSec,
    })
    .select('id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec')
    .single();

  if (error || !question) {
    return NextResponse.json({ error: error?.message || 'Soalan tidak dapat disimpan.' }, { status: 500 });
  }
  return NextResponse.json({ data: question }, { status: 201 });
}
