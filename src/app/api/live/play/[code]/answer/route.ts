/**
 * POST /api/live/play/[code]/answer — pemain menghantar jawapan.
 *
 * Keselamatan:
 * - playerToken disahkan padan dengan baris pemain.
 * - Ditolak 409 jika status bukan 'asking', questionId bukan soalan pada
 *   current_index, atau pemain sudah menjawab soalan itu.
 * - ms_taken dikira di pelayan daripada question_started_at sesi — masa dari
 *   badan permintaan TIDAK diterima.
 * - correct_key diambil dalam pertanyaan berasingan untuk pemarkahan pelayan
 *   sahaja dan TIDAK dikembalikan. Balasan hanya { ok, locked }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { scoreAnswer } from '@/lib/live-quiz';

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
interface PlayerRow { id: string; player_token: string; score: number; total_ms: number; }
interface QuestionRow {
  id: string; quiz_id: string; order_idx: number; prompt: string;
  options: { key: string; text: string }[];
  points: number; time_limit_sec: number; use_countdown: boolean;
}
interface KeyRow { correct_key: string; }

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').toUpperCase();

  let body: { playerId?: unknown; playerToken?: unknown; questionId?: unknown; choiceKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  const playerToken = typeof body.playerToken === 'string' ? body.playerToken : '';
  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  const choiceKey = typeof body.choiceKey === 'string' ? body.choiceKey.trim().toUpperCase() : '';
  if (!playerId || !playerToken || !questionId || !choiceKey) {
    return NextResponse.json(
      { error: 'playerId, playerToken, questionId and choiceKey are required.' },
      { status: 400 },
    );
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

  // Sahkan pemain + token.
  const { data: player } = (await supa
    .from('qm_live_players')
    .select('id, player_token, score, total_ms')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .maybeSingle()) as { data: PlayerRow | null };
  if (!player || player.player_token !== playerToken) {
    return NextResponse.json({ error: 'Invalid player token.' }, { status: 403 });
  }

  // Sahkan status dan soalan semasa (senarai lajur eksplisit, tanpa correct_key).
  if (session.status !== 'asking') {
    return NextResponse.json(
      { error: 'Your answer was rejected because the question is closed.' },
      { status: 409 },
    );
  }
  const { data: currentQuestion } = (await supa
    .from('qm_live_questions')
    .select('id, quiz_id, order_idx, prompt, options, points, time_limit_sec, use_countdown')
    .eq('quiz_id', session.quiz_id)
    .order('order_idx')
    .range(session.current_index, session.current_index)
    .maybeSingle()) as { data: QuestionRow | null };
  if (!currentQuestion || currentQuestion.id !== questionId) {
    return NextResponse.json(
      { error: 'That is not the current question, so the answer was rejected.' },
      { status: 409 },
    );
  }

  // Satu jawapan satu soalan (application check; kekangan unik DB menguatkuasakan juga).
  const { data: existing } = await supa
    .from('qm_live_answers')
    .select('id')
    .eq('session_id', session.id)
    .eq('player_id', playerId)
    .eq('question_id', questionId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'You have already answered this question.' },
      { status: 409 },
    );
  }

  // Pemarkahan di pelayan sahaja: correct_key dalam pertanyaan berasingan.
  const { data: keyRow } = (await supa
    .from('qm_live_questions')
    .select('correct_key')
    .eq('id', questionId)
    .maybeSingle()) as { data: KeyRow | null };
  if (!keyRow) {
    return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
  }

  const startedMs = session.question_started_at
    ? new Date(session.question_started_at).getTime()
    : Date.now();
  const msTaken = Math.max(0, Date.now() - startedMs);
  const isCorrect = choiceKey === keyRow.correct_key;

  const { pointsAwarded } = scoreAnswer({
    isCorrect,
    msTaken,
    points: currentQuestion.points,
    timeLimitSec: currentQuestion.time_limit_sec,
    useCountdown: currentQuestion.use_countdown !== false,
  });

  const { error: insertErr } = await supa.from('qm_live_answers').insert({
    session_id: session.id,
    player_id: playerId,
    question_id: questionId,
    choice_key: choiceKey,
    is_correct: isCorrect,
    ms_taken: msTaken,
    points_awarded: pointsAwarded,
  });
  if (insertErr) {
    // 23505: kekangan unik (session_id, player_id, question_id) — jawapan berulang.
    if (insertErr.code === '23505') {
      return NextResponse.json({ error: 'You have already answered this question.' }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supa
    .from('qm_live_players')
    .update({
      score: player.score + pointsAwarded,
      total_ms: player.total_ms + msTaken,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', playerId);

  // Tiada maklumat betul/salah dalam balasan.
  return NextResponse.json({ ok: true, locked: true });
}
