/**
 * GET /api/live/play/[code]/state?playerId=&fp= — tinjauan keadaan peserta.
 *
 * KESELAMATAN: correct_key tidak keluar dalam balasan ini. Sejak Bahagian 2.4
 * laluan ini TIDAK memulangkan objek soalan lagi — klien menyimpan soalan
 * daripada laluan /questions. Ia memulangkan questionId, questionIndex,
 * version dan timeLimitSec sahaja. Kunci jawapan hanya diambil dalam
 * pertanyaan berasingan di dalam blok reveal apabila status ialah 'revealed'.
 * Objek balasan dibina secara eksplisit — tiada spread baris pangkalan data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

interface SessionRow {
  id: string;
  quiz_id: string;
  status: string;
  current_index: number;
  question_started_at: string | null;
}
interface PlayerRow { id: string; score: number; }
interface QuestionRow {
  id: string; order_idx: number; time_limit_sec: number;
}
interface AnswerRow { choice_key: string; is_correct: boolean; points_awarded: number; }

/** Cap jari pendek (16 aksara) bagi keadaan sesi. */
function fingerprint(
  status: string,
  currentIndex: number,
  startedAt: string | null,
  playerCount: number,
): string {
  const raw = `${status}|${currentIndex}|${startedAt || ''}|${playerCount}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').toUpperCase();
  const playerId = req.nextUrl.searchParams.get('playerId') || '';
  const fpParam = req.nextUrl.searchParams.get('fp') || '';
  if (!playerId) {
    return NextResponse.json({ error: 'playerId is required.' }, { status: 400 });
  }

  const supa = getServiceSupabase();

  const { data: session } = (await supa
    .from('qm_live_sessions')
    .select('id, quiz_id, status, current_index, question_started_at')
    .eq('code', code)
    .maybeSingle()) as { data: SessionRow | null };
  if (!session) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  const { data: player } = (await supa
    .from('qm_live_players')
    .select('id, score')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .maybeSingle()) as { data: PlayerRow | null };
  if (!player) {
    return NextResponse.json({ error: 'Player not found in this session.' }, { status: 403 });
  }

  const [{ count: playerCount }, { data: questions }] = await Promise.all([
    supa
      .from('qm_live_players')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id),
    // Sejak Bahagian 2.4: hanya id, order_idx dan time_limit_sec — tiada
    // prompt/options, kerana teks soalan datang daripada cache klien
    // (laluan /questions). Senarai lajur eksplisit TANPA correct_key.
    supa
      .from('qm_live_questions')
      .select('id, order_idx, time_limit_sec')
      .eq('quiz_id', session.quiz_id)
      .order('order_idx'),
  ]);

  const fp = fingerprint(
    session.status,
    session.current_index,
    session.question_started_at,
    playerCount || 0,
  );
  if (fpParam && fpParam === fp) {
    return NextResponse.json({ noChange: true, fp });
  }

  const allQuestions = (questions || []) as QuestionRow[];
  const totalQuestions = allQuestions.length;
  const currentQuestion =
    session.current_index >= 0 && session.current_index < totalQuestions
      ? allQuestions[session.current_index]
      : null;

  // Version ialah hash pendek bagi senarai id soalan dan order_idx — sama
  // dengan pengiraan dalam laluan /questions. Klien memanggil semula laluan
  // /questions apabila nilai ini berbeza daripada yang disimpan.
  const version = createHash('sha256')
    .update(allQuestions.map((q) => `${q.id}|${q.order_idx}`).join(';'))
    .digest('hex')
    .slice(0, 16);

  const payload: Record<string, unknown> = {
    fp,
    status: session.status,
    questionIndex: session.current_index,
    totalQuestions,
    serverNow: new Date().toISOString(),
    questionStartedAt: session.question_started_at,
    timeLimitSec: currentQuestion?.time_limit_sec ?? null,
    questionId: currentQuestion?.id ?? null,
    version,
    myAnswer: null,
    reveal: null,
  };

  // myAnswer: jawapan pemain bagi soalan SEMASA sahaja.
  if (currentQuestion) {
    const { data: ans } = (await supa
      .from('qm_live_answers')
      .select('choice_key')
      .eq('session_id', session.id)
      .eq('player_id', playerId)
      .eq('question_id', currentQuestion.id)
      .maybeSingle()) as { data: { choice_key: string } | null };
    if (ans) {
      payload.myAnswer = { choiceKey: ans.choice_key, locked: true };
    }
  }

  // Reveal: kunci jawapan hanya dihantar selepas sesi menjadi 'revealed'.
  if (session.status === 'revealed' && currentQuestion) {
    const { data: keyRow } = (await supa
      .from('qm_live_questions')
      .select('correct_key')
      .eq('id', currentQuestion.id)
      .maybeSingle()) as { data: { correct_key: string } | null };

    const { data: myAns } = (await supa
      .from('qm_live_answers')
      .select('choice_key, is_correct, points_awarded')
      .eq('session_id', session.id)
      .eq('player_id', playerId)
      .eq('question_id', currentQuestion.id)
      .maybeSingle()) as { data: AnswerRow | null };

    const { count: betterCount } = await supa
      .from('qm_live_players')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
      .gt('score', player.score);

    payload.reveal = {
      correctKey: keyRow?.correct_key ?? null,
      myChoice: myAns?.choice_key ?? null,
      isCorrect: myAns?.is_correct ?? false,
      pointsAwarded: myAns?.points_awarded ?? 0,
      rank: (betterCount || 0) + 1,
      score: player.score,
    };
  }

  return NextResponse.json(payload);
}
