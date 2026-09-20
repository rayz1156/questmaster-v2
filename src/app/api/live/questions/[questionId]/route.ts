import { NextRequest, NextResponse } from 'next/server';
import { requireQuestionHost, validateOptions } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/** PATCH /api/live/questions/[questionId] — kemas kini separa medan soalan. */
export async function PATCH(req: NextRequest, { params }: { params: { questionId: string } }) {
  const q = await requireQuestionHost(req, params.questionId);
  if (q.response) return q.response;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (typeof body.prompt === 'string') {
    if (!body.prompt.trim()) return NextResponse.json({ error: 'The question cannot be empty.' }, { status: 400 });
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
      return NextResponse.json({ error: 'correct_key is invalid.' }, { status: 400 });
    }
    const optionKeys = Array.isArray(patch.options)
      ? (patch.options as { key: string }[]).map((o) => o.key)
      : q.question!.options.map((o) => o.key);
    if (!optionKeys.includes(correctKey)) {
      return NextResponse.json({ error: 'correct_key must be one of the option keys.' }, { status: 400 });
    }
    patch.correct_key = correctKey;
  }

  if (body.points !== undefined) {
    const points = Number(body.points);
    if (!Number.isFinite(points) || points < 1) {
      return NextResponse.json({ error: 'Points must be a positive number.' }, { status: 400 });
    }
    patch.points = Math.floor(points);
  }

  if (body.time_limit_sec !== undefined) {
    const tl = Number(body.time_limit_sec);
    if (!Number.isFinite(tl) || tl < 5) {
      return NextResponse.json({ error: 'The time limit must be at least 5 seconds.' }, { status: 400 });
    }
    patch.time_limit_sec = Math.floor(tl);
  }

  if (body.use_countdown !== undefined) {
    if (typeof body.use_countdown !== 'boolean') {
      return NextResponse.json({ error: 'use_countdown must be true or false.' }, { status: 400 });
    }
    patch.use_countdown = body.use_countdown;
  }

  if (body.double_points !== undefined) {
    if (typeof body.double_points !== 'boolean') {
      return NextResponse.json({ error: 'double_points must be true or false.' }, { status: 400 });
    }
    patch.double_points = body.double_points;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
  }

  const { data: question, error } = await q.supa
    .from('qm_live_questions')
    .update(patch)
    .eq('id', params.questionId)
    .select('id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec, use_countdown, double_points')
    .single();

  if (error || !question) {
    return NextResponse.json({ error: error?.message || 'Update failed.' }, { status: 500 });
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
