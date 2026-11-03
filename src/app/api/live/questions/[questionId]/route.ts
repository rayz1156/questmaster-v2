import { NextRequest, NextResponse } from 'next/server';
import { requireQuestionHost, validateOptions } from '@/lib/live-quiz';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/** PATCH /api/live/questions/[questionId], kemas kini separa medan soalan. */
export async function PATCH(req: NextRequest, { params }: { params: { questionId: string } }) {
  const q = await requireQuestionHost(req, params.questionId);
  if (q.response) return q.response;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (typeof body.prompt === 'string') {
    if (!body.prompt.trim()) return ralatJson('The question cannot be empty.', 400);
    patch.prompt = body.prompt.trim();
  }

  if (body.options !== undefined) {
    const opts = validateOptions(body.options);
    if (!opts.ok) return ralatJson(opts.error as string, 400);
    patch.options = body.options;
  }

  const correctKey = body.correct_key !== undefined ? body.correct_key : body.correctKey;
  if (correctKey !== undefined) {
    if (typeof correctKey !== 'string') {
      return ralatJson('correct_key is invalid.', 400);
    }
    const optionKeys = Array.isArray(patch.options)
      ? (patch.options as { key: string }[]).map((o) => o.key)
      : q.question!.options.map((o) => o.key);
    if (!optionKeys.includes(correctKey)) {
      return ralatJson('correct_key must be one of the option keys.', 400);
    }
    patch.correct_key = correctKey;
  }

  if (body.points !== undefined) {
    const points = Number(body.points);
    if (!Number.isFinite(points) || points < 1) {
      return ralatJson('Points must be a positive number.', 400);
    }
    patch.points = Math.floor(points);
  }

  if (body.time_limit_sec !== undefined) {
    const tl = Number(body.time_limit_sec);
    if (!Number.isFinite(tl) || tl < 5) {
      return ralatJson('The time limit must be at least 5 seconds.', 400);
    }
    patch.time_limit_sec = Math.floor(tl);
  }

  if (body.use_countdown !== undefined) {
    if (typeof body.use_countdown !== 'boolean') {
      return ralatJson('use_countdown must be true or false.', 400);
    }
    patch.use_countdown = body.use_countdown;
  }

  if (body.double_points !== undefined) {
    if (typeof body.double_points !== 'boolean') {
      return ralatJson('double_points must be true or false.', 400);
    }
    patch.double_points = body.double_points;
  }

  if (Object.keys(patch).length === 0) {
    return ralatJson('No fields to update.', 400);
  }

  const { data: question, error } = await q.supa
    .from('qm_live_questions')
    .update(patch)
    .eq('id', params.questionId)
    .select('id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec, use_countdown, double_points')
    .single();

  if (error || !question) {
    return ralatJson(error?.message || 'Update failed.', 500);
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

  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ ok: true });
}
