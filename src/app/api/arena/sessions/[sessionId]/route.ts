// Papan pemuka hos: sesi, soalan ringkas, pemain, jawapan, pasukan, coop.
import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { requireSessionHost } from '@/lib/arena/server';
import { presenceOf } from '@/lib/arena/public';
import { teamScores, coopProgress } from '@/lib/arena/modes';
import { soalanSesi } from '@/lib/arena/play-server';
import { DEFAULT_SET_SETTINGS, type ArenaPlayerPublic, type ArenaQType } from '@/lib/arena/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface QRow { id: string; order_idx: number; type: ArenaQType; prompt: string; points: number }
interface PRow { id: string; nickname: string; avatar: number; team: number | null; pos_x: number; pos_y: number; score: number; last_seen_at: string; joined_at: string }
interface ARow { id: string; player_id: string; question_id: string | null; live_question_id: string | null; is_correct: boolean | null; score: number; elapsed_ms: number | null; created_at: string; answer: unknown }

export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const host = await requireSessionHost(req, params.sessionId);
  if (host.response || !host.session) return host.response ?? ralatJson('Not found', 404);
  const session = host.session;
  const svc = host.svc;
  // KZ-045: soalan ikut sumber sesi (kuiz melalui quiz_id, set lama melalui
  // set_id). Hanya medan ringkas dipetahkan; data (kunci) tidak keluar.
  const [qs, pRes, aRes] = await Promise.all([
    soalanSesi(svc, session.quiz_id, session.set_id),
    svc.from('qm_arena_players').select('id, nickname, avatar, team, pos_x, pos_y, score, last_seen_at, joined_at').eq('session_id', session.id).order('joined_at', { ascending: true }),
    svc.from('qm_arena_answers').select('id, player_id, question_id, live_question_id, is_correct, score, elapsed_ms, created_at, answer').eq('session_id', session.id).order('created_at', { ascending: true }).limit(10000),
  ]);
  if (pRes.error || aRes.error) return ralatJson((pRes.error ?? aRes.error)?.message ?? 'Query failed', 500);
  const questions: QRow[] = qs.map((q) => ({
    id: q.id,
    order_idx: q.order_idx,
    type: q.type,
    prompt: q.prompt,
    points: Number(q.points) || 0,
  }));
  const pRows = (pRes.data ?? []) as PRow[];
  const aRows = (aRes.data ?? []) as ARow[];

  const typeOf: Record<string, ArenaQType> = {};
  for (const q of questions) typeOf[q.id] = q.type;
  const answeredBy: Record<string, number> = {};
  for (const a of aRows) answeredBy[a.player_id] = (answeredBy[a.player_id] ?? 0) + 1;

  const now = Date.now();
  const players: (ArenaPlayerPublic & { joined_at: string })[] = pRows.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    team: p.team,
    x: Number(p.pos_x) || 0,
    y: Number(p.pos_y) || 0,
    score: Number(p.score) || 0,
    answered: answeredBy[p.id] ?? 0,
    presence: presenceOf(p.last_seen_at, now),
    joined_at: p.joined_at,
  }));
  // jawapan teks hanya untuk esei (untuk digred)
  const answers = aRows.map((a) => {
    const idSoalan = a.live_question_id ?? a.question_id;
    return {
      id: a.id,
      player_id: a.player_id,
      question_id: idSoalan,
      is_correct: a.is_correct,
      score: Number(a.score) || 0,
      elapsed_ms: a.elapsed_ms,
      created_at: a.created_at,
      answer: idSoalan && typeOf[idSoalan] === 'essay' ? a.answer : null,
    };
  });

  const settings = host.set?.settings ?? DEFAULT_SET_SETTINGS;
  // KZ-045: sesi kuiz tiada set; tajuk kuiz dipakai supaya papan pemuka
  // tetap memaparkan nama permainan.
  let tajuk = host.set?.title ?? '';
  if (session.quiz_id && !tajuk) {
    const { data: kz } = await svc.from('qm_live_quizzes').select('title').eq('id', session.quiz_id).maybeSingle();
    tajuk = (kz as { title?: string } | null)?.title ?? '';
  }
  const teams = session.mode === 'team' ? teamScores(players.map((p) => ({ team: p.team, score: p.score })), session.team_count) : [];
  const totalScore = players.reduce((s, p) => s + p.score, 0);
  const totalPoints = questions.reduce((s, q) => s + (Number(q.points) || 0), 0);
  const coop = session.mode === 'coop' ? coopProgress(totalScore, totalPoints, players.length, settings.coopTargetPct) : null;

  return NextResponse.json({
    session,
    set: { id: session.set_id ?? session.quiz_id, title: tajuk, settings },
    questions,
    players,
    answers,
    teams,
    coop,
  });
}
