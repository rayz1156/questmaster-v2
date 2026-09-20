import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import type { LiveSessionRow } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * POST /api/live/sessions/[sessionId]/control
 * Badan: {action}. action: start | next | reveal | end | reset.
 * - start:  lobby -> asking, current_index 0, set question_started_at
 * - next:   ke soalan berikut, status asking, set semula question_started_at
 * - reveal: status revealed, tutup jawapan soalan semasa
 * - end:    status ended, set ended_at
 * - reset:  kembali lobby, current_index -1, padam qm_live_answers dan set
 *           semula skor pemain kepada 0 (jangan padam pemain)
 */
export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  interface QuizRef { class_id: string; owner_id: string }
  interface ProfileRef { role: string; suspended: boolean | null }
  const { data: session } = await auth.supa
    .from('qm_live_sessions')
    .select('id, quiz_id, host_id, code, status, current_index, question_started_at')
    .eq('id', params.sessionId)
    .maybeSingle();
  const ses = session as LiveSessionRow | null;
  if (!ses) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

  // Sahkan hos: pemilik sesi, pendidik kelas kuiz atau admin.
  if (ses.host_id !== auth.user!.id) {
    const { data: quiz } = await auth.supa
      .from('qm_live_quizzes')
      .select('class_id, owner_id')
      .eq('id', ses.quiz_id)
      .maybeSingle();
    const qz = quiz as QuizRef | null;
    let allowed = false;
    if (qz) {
      if (qz.owner_id === auth.user!.id) {
        allowed = true;
      } else {
        const { data: member } = await auth.supa
          // Pendidik ada dalam qm_class_educators (educator_id), bukan qm_class_members (peserta).
          .from('qm_class_educators')
          .select('educator_id, accepted_at')
          .eq('class_id', qz.class_id)
          .eq('educator_id', auth.user!.id)
          .not('accepted_at', 'is', null)
          .maybeSingle();
        if (member) allowed = true;
      }
    }
    if (!allowed) {
      const { data: profile } = await auth.supa
        .from('qm_profiles')
        .select('role, suspended')
        .eq('id', auth.user!.id)
        .maybeSingle();
      const me = profile as ProfileRef | null;
      if (me && !me.suspended && ['admin', 'superadmin'].includes(me.role)) allowed = true;
    }
    if (!allowed) return NextResponse.json({ error: 'You are not the host of this session.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (!['start', 'next', 'reveal', 'end', 'reset'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  const { data: questions } = await auth.supa
    .from('qm_live_questions')
    .select('id')
    .eq('quiz_id', ses.quiz_id)
    .order('order_idx');
  const totalQuestions = (questions || []).length;
  if (totalQuestions === 0) {
    return NextResponse.json({ error: 'This quiz has no questions.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (action === 'start') {
    if (ses.status !== 'lobby') {
      return NextResponse.json({ error: 'The session is not in the lobby. Reset it first.' }, { status: 400 });
    }
    patch.status = 'asking';
    patch.current_index = 0;
    patch.question_started_at = new Date().toISOString();
  } else if (action === 'next') {
    if (!['asking', 'revealed'].includes(ses.status)) {
      return NextResponse.json({ error: 'No question is open right now.' }, { status: 400 });
    }
    const nextIdx = ses.current_index + 1;
    if (nextIdx >= totalQuestions) {
      return NextResponse.json({ error: 'No more questions. Use End session.' }, { status: 400 });
    }
    patch.status = 'asking';
    patch.current_index = nextIdx;
    patch.question_started_at = new Date().toISOString();
  } else if (action === 'reveal') {
    if (ses.status !== 'asking') {
      return NextResponse.json({ error: 'There is no open question to reveal.' }, { status: 400 });
    }
    patch.status = 'revealed';
  } else if (action === 'end') {
    if (ses.status === 'ended') {
      return NextResponse.json({ error: 'The session is already over.' }, { status: 400 });
    }
    patch.status = 'ended';
    patch.ended_at = new Date().toISOString();
  } else if (action === 'reset') {
    if (ses.status === 'ended') {
      return NextResponse.json({ error: 'The session is over and cannot be reset.' }, { status: 400 });
    }
    // Padam semua jawapan sesi ini.
    const { error: delErr } = await auth.supa
      .from('qm_live_answers')
      .delete()
      .eq('session_id', params.sessionId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    // Set semula skor pemain kepada 0. Baris pemain JANGAN dipadam.
    const { error: pErr } = await auth.supa
      .from('qm_live_players')
      .update({ score: 0, total_ms: 0 })
      .eq('session_id', params.sessionId);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    patch.status = 'lobby';
    patch.current_index = -1;
    patch.question_started_at = null;
  }

  const { data: updated, error: upErr } = await auth.supa
    .from('qm_live_sessions')
    .update(patch)
    .eq('id', params.sessionId)
    .select('id, quiz_id, code, status, current_index, question_started_at, ended_at')
    .single();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message || 'Could not update the session.' }, { status: 500 });
  }
  return NextResponse.json({ data: updated });
}
