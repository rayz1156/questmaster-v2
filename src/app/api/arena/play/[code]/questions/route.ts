import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { toPublicQuestion } from '@/lib/arena/public';
import type { ArenaQuestion } from '@/lib/arena/types';
import {
  accessFor,
  answeredIdsOf,
  loadPlaySession,
  loadPlayerByToken,
  orderedQuestions,
  playerOrder,
  playerTokenOf,
} from '@/lib/arena/play-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Soalan awam (tanpa kunci jawapan) + senarai available/locked untuk peserta. */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const svc = getServiceSupabase();
  const loaded = await loadPlaySession(svc, params.code);
  if (!loaded) return ralatJson('Session not found', 404);
  const { session, set } = loaded;

  const me = await loadPlayerByToken(svc, session.id, playerTokenOf(req));
  if (!me) return ralatJson('Invalid player token', 401);

  const [qs, answered] = await Promise.all([orderedQuestions(svc, set.id), answeredIdsOf(svc, me.id)]);
  const ordered = playerOrder(qs, session, set, me.id);
  const access = accessFor(ordered, answered, session, set);

  // mod round: hanya soalan semasa (semasa bermain)
  let list: ArenaQuestion[] = ordered;
  if (session.mode === 'round') {
    const cur: ArenaQuestion | undefined =
      session.status === 'playing' && session.current_index >= 0 ? qs[session.current_index] : undefined;
    list = cur ? [cur] : [];
  }
  const ids = new Set(list.map((q) => q.id));
  const questions = list.map((q) => toPublicQuestion(q, me.id + q.id));

  // belum/tidak bermain: semua dikunci
  if (session.status !== 'playing') {
    return NextResponse.json({
      questions,
      available: [] as string[],
      locked: [...access.available, ...access.locked].filter((id) => ids.has(id)),
    });
  }
  return NextResponse.json({
    questions,
    available: access.available.filter((id) => ids.has(id)),
    locked: access.locked.filter((id) => ids.has(id)),
  });
}
