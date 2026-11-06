import { NextRequest, NextResponse } from 'next/server';
import { requireQuizHost, validateOptions } from '@/lib/live-quiz';
import { validateQuestion } from '@/lib/arena/validate';
import { arenaInputToLiveRow } from '@/lib/kuiz-bank';
import { ARENA_QTYPES } from '@/lib/arena/types';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

const LAJUR_BALAS =
  'id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec, use_countdown, double_points, qtype, data, hint';

/**
 * POST /api/live/quizzes/[quizId]/questions, tambah soalan.
 *
 * KZ-045: dua bentuk badan diterima.
 *   1. Format lama (Kahoot): { prompt, options, correct_key, points,
 *      time_limit_sec, use_countdown, double_points }.
 *   2. Format Arena: { type, prompt, data, hint?, points?, time_limit_sec? },
 *      disahkan oleh validateQuestion dan disimpan melalui arenaInputToLiveRow.
 * Bentuk dikesan melalui medan `type`; format lama tidak menghantarnya.
 */
export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const body = await req.json().catch(() => ({}));

  const { data: last } = await host.supa
    .from('qm_live_questions')
    .select('order_idx')
    .eq('quiz_id', params.quizId)
    .order('order_idx', { ascending: false })
    .limit(1);
  const orderIdx = ((last && last[0]?.order_idx) ?? -1) + 1;

  // ---- Bentuk 2: format Arena (KZ-045) ----
  const jenis = typeof body.type === 'string' ? body.type : '';
  if (jenis !== '') {
    if (!(ARENA_QTYPES as readonly string[]).includes(jenis)) {
      return ralatJson('type must be one of ' + ARENA_QTYPES.join(', ') + '.', 400);
    }
    const sah = validateQuestion(body);
    if (!sah.ok) return ralatJson(sah.error, 400);
    const baris = arenaInputToLiveRow(sah.value);
    const { data: question, error } = await host.supa
      .from('qm_live_questions')
      .insert({
        quiz_id: params.quizId,
        order_idx: orderIdx,
        prompt: baris.prompt,
        options: baris.options,
        correct_key: baris.correct_key,
        qtype: baris.qtype,
        data: baris.data,
        hint: baris.hint,
        points: baris.points,
        time_limit_sec: baris.time_limit_sec,
      })
      .select(LAJUR_BALAS)
      .single();

    if (error || !question) {
      return ralatJson(error?.message || 'The question could not be saved.', 500);
    }
    return NextResponse.json({ data: question }, { status: 201 });
  }

  // ---- Bentuk 1: format lama (kekal seperti sebelum KZ-045) ----
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return ralatJson('A question prompt is required.', 400);

  const opts = validateOptions(body.options);
  if (!opts.ok) return ralatJson(opts.error as string, 400);

  const correctKey = typeof body.correct_key === 'string' ? body.correct_key : body.correctKey;
  if (typeof correctKey !== 'string' || !opts.keys!.includes(correctKey)) {
    return ralatJson('correct_key must be one of the option keys.', 400);
  }

  const points = Number.isFinite(Number(body.points)) ? Math.max(1, Math.floor(Number(body.points))) : 1000;
  const timeLimitSec = Number.isFinite(Number(body.time_limit_sec))
    ? Math.max(5, Math.floor(Number(body.time_limit_sec)))
    : 20;
  const useCountdown = body.use_countdown === undefined ? true : body.use_countdown !== false;
  const doublePoints = body.double_points === true;

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
      use_countdown: useCountdown,
      double_points: doublePoints,
    })
    .select(LAJUR_BALAS)
    .single();

  if (error || !question) {
    return ralatJson(error?.message || 'The question could not be saved.', 500);
  }
  return NextResponse.json({ data: question }, { status: 201 });
}
