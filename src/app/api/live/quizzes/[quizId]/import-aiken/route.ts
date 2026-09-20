import { NextRequest, NextResponse } from 'next/server';
import { requireQuizHost, parseAiken } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * POST /api/live/quizzes/[quizId]/import-aiken
 * Badan: {content}. Balas: {created:n, skipped:n}. Blok rosak dilangkau.
 */
export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const body = await req.json().catch(() => ({}));
  if (typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json({ error: 'Aiken content is required.' }, { status: 400 });
  }

  const { questions, skipped } = parseAiken(body.content);
  if (questions.length === 0) {
    return NextResponse.json({ created: 0, skipped, error: 'No valid questions found.' }, { status: 400 });
  }

  const { data: last } = await host.supa
    .from('qm_live_questions')
    .select('order_idx')
    .eq('quiz_id', params.quizId)
    .order('order_idx', { ascending: false })
    .limit(1);
  let orderIdx = ((last && last[0]?.order_idx) ?? -1) + 1;

  const rows = questions.map((qq) => ({
    quiz_id: params.quizId,
    order_idx: orderIdx++,
    prompt: qq.prompt,
    options: qq.options,
    correct_key: qq.correct_key,
    points: 1000,
    time_limit_sec: 20,
  }));

  const { error } = await host.supa
    .from('qm_live_questions')
    .insert(rows);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ created: rows.length, skipped });
}
