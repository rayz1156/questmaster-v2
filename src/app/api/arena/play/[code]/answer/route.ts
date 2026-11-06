import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { gradeAnswer, revealFor, shouldReveal } from '@/lib/arena/grade';
import { isGoldenChest } from '@/lib/arena/games';
import type { AnswerResponse, ArenaAnswer, ArenaQType, GradeResult } from '@/lib/arena/types';
import {
  accessFor,
  answeredIdsOf,
  loadPlaySession,
  loadPlayerByToken,
  playerOrder,
  playerTokenOf,
  readJsonBody,
  soalanSesi,
} from '@/lib/arena/play-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function strArr(v: unknown): string[] | null {
  return Array.isArray(v) && v.length <= 50 && v.every((x) => typeof x === 'string' && x.length <= 200)
    ? (v as string[])
    : null;
}

/** Sahkan bentuk jawapan ikut jenis soalan. */
function parseAnswer(raw: unknown, qtype: ArenaQType): ArenaAnswer | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  if (a.type !== qtype) return null;
  switch (qtype) {
    case 'multiple': {
      const keys = strArr(a.keys);
      return keys ? { type: 'multiple', keys } : null;
    }
    case 'order': {
      const keys = strArr(a.keys);
      return keys ? { type: 'order', keys } : null;
    }
    case 'subjective':
      return typeof a.text === 'string' && a.text.length <= 500 ? { type: 'subjective', text: a.text } : null;
    case 'essay':
      return typeof a.text === 'string' && a.text.length <= 5000 ? { type: 'essay', text: a.text } : null;
    case 'ox': {
      const v = a.value;
      return v === 'o' ? { type: 'ox', value: 'o' } : v === 'x' ? { type: 'ox', value: 'x' } : null;
    }
    case 'match': {
      if (!Array.isArray(a.pairs) || a.pairs.length > 20) return null;
      const pairs: { left: string; right: string }[] = [];
      for (const p of a.pairs as unknown[]) {
        if (!p || typeof p !== 'object') return null;
        const o = p as Record<string, unknown>;
        if (typeof o.left !== 'string' || typeof o.right !== 'string') return null;
        pairs.push({ left: o.left, right: o.right });
      }
      return { type: 'match', pairs };
    }
    default:
      return null;
  }
}

/** Peserta menghantar jawapan (atau pass). */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const body = await readJsonBody(req);
  const svc = getServiceSupabase();
  const loaded = await loadPlaySession(svc, params.code);
  if (!loaded) return ralatJson('Session not found', 404);
  const { session, set, quizId } = loaded;

  const me = await loadPlayerByToken(svc, session.id, playerTokenOf(req));
  if (!me) return ralatJson('Invalid player token', 401);

  if (session.status !== 'playing') return ralatJson('Session not running', 409);
  if (session.frozen) return ralatJson('Session frozen', 403);
  const now = Date.now();
  if (session.ends_at && now > Date.parse(session.ends_at)) return ralatJson('Time is up', 409);

  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  // KZ-045: soalan ikut sumber sesi (kuiz melalui quiz_id, set lama
  // melalui set_id); id soalan kuiz dan id soalan set tidak berlanggar
  // kerana kedua-duanya UUID unik.
  const [qs, answered] = await Promise.all([
    soalanSesi(svc, session.quiz_id, session.set_id),
    answeredIdsOf(svc, me.id),
  ]);
  const q = qs.find((x) => x.id === questionId);
  if (!q) return ralatJson('Question not found', 404);
  if (answered.has(q.id)) return ralatJson('Already answered', 409);

  const access = accessFor(playerOrder(qs, session, set, me.id), answered, session, set);
  if (!access.available.includes(q.id)) return ralatJson('Question locked', 403);

  // masa: mod round guna masa pelayan sejak round_started_at
  let elapsedMs: number | null = null;
  if (session.mode === 'round') {
    const startedMs = session.round_started_at ? Date.parse(session.round_started_at) : NaN;
    if (Number.isFinite(startedMs)) {
      if (now > startedMs + q.time_limit_sec * 1000 + 2000) return ralatJson('Time is up', 409);
      elapsedMs = Math.max(0, now - startedMs);
    }
  } else {
    const e = Number(body.elapsedMs);
    elapsedMs = Number.isFinite(e) && e >= 0 ? Math.min(Math.round(e), 86_400_000) : null;
  }

  const pass = body.pass === true;
  let result: GradeResult;
  let stored: unknown;
  if (pass) {
    if (!set.settings.allowPass || (session.mode !== 'sequencing' && session.mode !== 'freestyle')) {
      return ralatJson('Pass not allowed', 403);
    }
    result = { isCorrect: false, score: 0, pending: false };
    stored = { type: 'pass' };
  } else {
    const parsed = parseAnswer(body.answer, q.type);
    if (!parsed) return ralatJson('Invalid answer', 400);
    const opts: { elapsedMs?: number; speedBonus?: boolean } = { speedBonus: session.mode === 'round' };
    if (elapsedMs !== null) opts.elapsedMs = elapsedMs;
    result = gradeAnswer(q, parsed, opts);
    stored = parsed;
    // KZ-045 Pulau Harta Karun (KZ-047): soalan emas (isGoldenChest)
    // menggandakan markah jawapan ini. Fungsi sama tepat dengan klien.
    if (session.view === 'pulau' && isGoldenChest(session.id, q.id)) {
      result = { ...result, score: Math.round(Number(result.score) || 0) * 2 };
    }
  }

  // KZ-045: jawapan sesi kuiz ditulis dengan live_question_id; sesi lama
  // kekal dengan question_id. Semakan (salah satu mesti ada) di pangkalan data.
  const { error: insErr } = await svc.from('qm_arena_answers').insert({
    session_id: session.id,
    player_id: me.id,
    question_id: quizId ? null : q.id,
    live_question_id: quizId ? q.id : null,
    answer: stored,
    is_correct: result.isCorrect,
    score: Math.round(Number(result.score) || 0),
    elapsed_ms: elapsedMs === null ? null : Math.round(elapsedMs),
  });
  if (insErr) {
    if (insErr.code === '23505') return ralatJson('Already answered', 409);
    return ralatJson('Could not save answer', 500);
  }

  // kemas kini markah pemain (baca-ubah-tulis)
  const { data: fresh } = await svc.from('qm_arena_players').select('score').eq('id', me.id).maybeSingle();
  const baseRaw = fresh ? (fresh as unknown as { score: unknown }).score : me.score;
  const base = typeof baseRaw === 'number' ? baseRaw : Number(baseRaw) || 0;
  const totalScore = base + Math.round(Number(result.score) || 0);
  await svc
    .from('qm_arena_players')
    .update({ score: totalScore, last_seen_at: new Date().toISOString() })
    .eq('id', me.id);

  const reveal =
    session.mode === 'round' || shouldReveal(set.settings.answerRevealMode, result.isCorrect) ? revealFor(q) : null;

  const resp: AnswerResponse = { result, reveal, totalScore };
  return NextResponse.json(resp);
}
