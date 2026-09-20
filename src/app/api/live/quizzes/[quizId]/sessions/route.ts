import { NextRequest, NextResponse } from 'next/server';
import { requireQuizHost, generateSessionCode } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/** POST /api/live/quizzes/[quizId]/sessions — mula sesi baharu dalam lobi. */
export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const { data: questions } = await host.supa
    .from('qm_live_questions')
    .select('id')
    .eq('quiz_id', params.quizId)
    .limit(1);
  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'Kuiz mesti ada sekurang-kurangnya satu soalan.' }, { status: 400 });
  }

  const code = await generateSessionCode(host.supa);
  if (!code) {
    return NextResponse.json({ error: 'Kod sesi tidak dapat dijana. Cuba lagi.' }, { status: 500 });
  }

  const { data: session, error } = await host.supa
    .from('qm_live_sessions')
    .insert({
      quiz_id: params.quizId,
      host_id: host.user.id,
      code,
      status: 'lobby',
      current_index: -1,
    })
    .select('id, quiz_id, code, status, current_index')
    .single();

  if (error || !session) {
    return NextResponse.json({ error: error?.message || 'Sesi tidak dapat dicipta.' }, { status: 500 });
  }
  return NextResponse.json({ data: { sessionId: session.id, code: session.code } }, { status: 201 });
}
