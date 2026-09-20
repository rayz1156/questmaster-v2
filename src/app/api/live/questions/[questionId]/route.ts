import { NextRequest, NextResponse } from 'next/server';
import { requireQuestionHost, validateOptions } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/live/questions/[questionId] — kemas kini separa medan soalan. */
export async function PATCH(req: NextRequest, { params }: { params: { questionId: string } }) {
  const q = await requireQuestionHost(req, params.questionId);
  if (q.response) return q.response;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (typeof body.prompt === 'string') {
    if (!body.prompt.trim()) return NextResponse.json({ error: 'Soalan tidak boleh kosong.' }, { status: 400 });
    patch.prompt = body.prompt.trim();
  }

  if (body.options !== undefined) {
    const opts = validateOptions(body.options);
    if (!opts.ok) return NextResponse.json({ error: opts.error }, { status: 400 });
    patch.options = body.options;
  }

  const correctKey = body.correct_key !== undefined ? body.correct_key : body.correctKey;
  if (correctKey !== undefined) {
    if (typeof correctKey !== 'string') {
      return NextResponse.json({ error: 'correct_key tidak sah.' }, { status: 400 });
    }
    const optionKeys = Array.isArray(patch.options)
      ? (patch.options as { key: string }[]).map((o) => o.key)
      : q.question!.options.map((o) => o.key);
    if (!optionKeys.includes(correctKey)) {
      return NextResponse.json({ error: 'correct_key mesti salah satu kunci pilihan.' }, { status: 400 });
    }
    patch.correct_key = correctKey;
  }

  if (body.points !== undefined) {
    const points = Number(body.points);
    if (!Number.isFinite(points) || points < 1) {
      return NextResponse.json({ error: 'Mata mesti nombor positif.' }, { status: 400 });
    }
    patch.points = Math.floor(points);
  }

  if (body.time_limit_sec !== undefined) {
    const tl = Number(body.time_limit_sec);
    if (!Number.isFinite(tl) || tl < 5) {
      return NextResponse.json({ error: 'Had masa mesti sekurang-kurangnya 5 saat.' }, { status: 400 });
    }
    patch.time_limit_sec = Math.floor(tl);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Tiada medan untuk dikemas kini.' }, { status: 400 });
  }

  const { data: question, error } = await q.supa
    .from('qm_live_questions')
    .update(patch)
    .eq('id', params.questionId)
    .select('id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec')
    .single();

  if (error || !question) {
    return NextResponse.json({ error: error?.message || 'Kemas kini gagal.' }, { status: 500 });
  }
  return NextResponse.json({ data: question });
}

/** DELETE /api/live/questions/[questionId] */
export async function DELETE(req: NextRequest, { params }: { params: { questionId: string } }) {
  const q = await requireQuestionHost(req, params.questionId);
  if (q.response) return q.response;

  const { error } = await q.supa
    .from('qm_live_questions')
    .delete()
    .eq('id', params.questionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
