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
  if (host.response || !host.quiz) {
    return host.response || NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });
  }

  const { data: questions } = await host.supa
    .from('qm_live_questions')
    .select('id')
    .eq('quiz_id', params.quizId)
    .limit(1);
  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'The quiz needs at least one question.' }, { status: 400 });
  }

  const code = await generateSessionCode(host.supa);
  if (!code) {
    return NextResponse.json({ error: 'Could not generate a session code. Please try again.' }, { status: 500 });
  }

  // Bahagian 2.3: petik had pemain pemilik kuiz pada masa sesi dicipta, supaya
  // menurunkan taraf pengguna tidak menjejaskan sesi yang sedang berjalan.
  const { data: ownerProfile } = (await host.supa
    .from('qm_profiles')
    .select('max_live_players')
    .eq('id', host.quiz.owner_id)
    .maybeSingle()) as { data: { max_live_players: number } | null };
  const maxPlayers = ownerProfile?.max_live_players ?? 50;

  const { data: session, error } = await host.supa
    .from('qm_live_sessions')
    .insert({
      quiz_id: params.quizId,
      host_id: host.user.id,
      code,
      status: 'lobby',
      current_index: -1,
      max_players: maxPlayers,
      // Petik tetapan bonus rentetan kuiz sekarang, supaya menukarnya
      // kemudian tidak mengubah sesi yang sedang berjalan.
      streak_bonus: host.quiz.streak_bonus !== false,
    })
    .select('id, quiz_id, code, status, current_index')
    .single();

  if (error || !session) {
    return NextResponse.json({ error: error?.message || 'The session could not be created.' }, { status: 500 });
  }
  return NextResponse.json({ data: { sessionId: session.id, code: session.code } }, { status: 201 });
}
