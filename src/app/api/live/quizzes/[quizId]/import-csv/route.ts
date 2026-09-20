import { NextRequest, NextResponse } from 'next/server';
import { requireQuizHost, parseQuizCsv, QUIZ_CSV_MAX_BYTES } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai. Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * POST /api/live/quizzes/[quizId]/import-csv
 * Badan: {content}. Balas: {created:n} atau 400 dengan {errors:[{row,message}]}.
 *
 * Semua atau tiada: satu baris rosak bermakna TIADA soalan dimasukkan, jadi
 * pendidik boleh membetulkan fail dan memuat naik semula tanpa soalan
 * bertindih separuh jalan.
 */
export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const body = await req.json().catch(() => ({}));
  if (typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json({ error: 'A CSV file is required.' }, { status: 400 });
  }
  if (body.content.length > QUIZ_CSV_MAX_BYTES) {
    return NextResponse.json(
      { error: 'That file is too large. The limit is about 500 KB.' },
      { status: 400 },
    );
  }

  const { questions, errors } = parseQuizCsv(body.content);
  if (errors.length > 0) {
    return NextResponse.json(
      { created: 0, error: 'Nothing was imported. Fix the rows below and upload again.', errors },
      { status: 400 },
    );
  }

  const { data: last } = await host.supa
    .from('qm_live_questions')
    .select('order_idx')
    .eq('quiz_id', params.quizId)
    .order('order_idx', { ascending: false })
    .limit(1);
  let orderIdx = ((last && last[0]?.order_idx) ?? -1) + 1;

  const rows = questions.map((q) => ({
    quiz_id: params.quizId,
    order_idx: orderIdx++,
    prompt: q.prompt,
    options: q.options,
    correct_key: q.correct_key,
    points: q.points,
    time_limit_sec: q.time_limit_sec,
    use_countdown: q.use_countdown,
    double_points: q.double_points,
  }));

  const { error } = await host.supa.from('qm_live_questions').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ created: rows.length });
}
