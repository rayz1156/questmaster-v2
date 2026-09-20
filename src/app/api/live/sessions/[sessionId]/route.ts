import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import type { LiveSessionRow } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/live/sessions/[sessionId] — keadaan hos penuh.
 * Hos sahaja (pemilik sesi, pendidik kelas atau admin). Termasuk soalan semasa
 * dengan correct_key kerana ini laluan hos.
 */
export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  interface QuizRef { class_id: string; owner_id: string }
  interface ProfileRef { role: string; suspended: boolean | null }
  interface AnswerRef { choice_key: string }
  const { data: session } = await auth.supa
    .from('qm_live_sessions')
    .select('id, quiz_id, host_id, code, status, current_index, question_started_at, created_at, ended_at')
    .eq('id', params.sessionId)
    .maybeSingle();
  const ses = session as LiveSessionRow | null;
  if (!ses) return NextResponse.json({ error: 'Sesi tidak dijumpai.' }, { status: 404 });

  const isHost = ses.host_id === auth.user!.id;
  let isEducator = isHost;
  let isAdmin = false;
  if (!isHost) {
    const { data: quiz } = await auth.supa
      .from('qm_live_quizzes')
      .select('class_id, owner_id')
      .eq('id', ses.quiz_id)
      .maybeSingle();
    const qz = quiz as QuizRef | null;
    if (qz && qz.owner_id === auth.user!.id) isEducator = true;
    if (qz) {
      const { data: member } = await auth.supa
        // Pendidik ada dalam qm_class_educators (educator_id), bukan qm_class_members (peserta).
        .from('qm_class_educators')
        .select('educator_id, accepted_at')
        .eq('class_id', qz.class_id)
        .eq('educator_id', auth.user!.id)
        .not('accepted_at', 'is', null)
        .maybeSingle();
      if (member) isEducator = true;
    }
    const { data: profile } = await auth.supa
      .from('qm_profiles')
      .select('role, suspended')
      .eq('id', auth.user!.id)
      .maybeSingle();
    const me = profile as ProfileRef | null;
    if (me && !me.suspended && ['admin', 'superadmin'].includes(me.role)) isAdmin = true;
  }

  if (!isEducator && !isAdmin) {
    return NextResponse.json({ error: 'Anda bukan hos sesi ini.' }, { status: 403 });
  }

  const { data: quiz } = await auth.supa
    .from('qm_live_quizzes')
    .select('id, class_id, title, description')
    .eq('id', ses.quiz_id)
    .maybeSingle();

  const { data: questions, error: qErr } = await auth.supa
    .from('qm_live_questions')
    .select('id, order_idx, prompt, options, correct_key, points, time_limit_sec')
    .eq('quiz_id', ses.quiz_id)
    .order('order_idx');
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  const allQuestions = questions || [];

  const { data: players, error: pErr } = await auth.supa
    .from('qm_live_players')
    .select('id, nickname, score, total_ms, joined_at')
    .eq('session_id', params.sessionId)
    .order('score', { ascending: false });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const currentQuestion =
    ses.current_index >= 0 && ses.current_index < allQuestions.length
      ? allQuestions[ses.current_index]
      : null;

  // Taburan jawapan bagi soalan semasa (hos sahaja).
  let distribution: Record<string, number> | null = null;
  if (currentQuestion) {
    const { data: answers } = (await auth.supa
      .from('qm_live_answers')
      .select('choice_key')
      .eq('session_id', params.sessionId)
      .eq('question_id', currentQuestion.id)) as { data: AnswerRef[] | null };
    distribution = {};
    for (const opt of currentQuestion.options || []) {
      distribution[opt.key] = 0;
    }
    for (const a of answers || []) {
      const k = a.choice_key;
      distribution[k] = (distribution[k] || 0) + 1;
    }
  }

  return NextResponse.json({
    data: {
      session: ses,
      quiz: quiz,
      questions: allQuestions,
      players: players || [],
      playerCount: (players || []).length,
      currentQuestion,
      distribution,
    },
  });
}
