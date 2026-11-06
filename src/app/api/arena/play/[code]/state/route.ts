import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { buildPlayState, loadPlaySession, loadPlayerByToken, playerTokenOf } from '@/lib/arena/play-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Keadaan sesi untuk peserta (token pilihan; jika sah isi me/myAnswers). */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const svc = getServiceSupabase();
  const loaded = await loadPlaySession(svc, params.code);
  if (!loaded) return ralatJson('Session not found', 404);
  const { session, set } = loaded;

  const me = await loadPlayerByToken(svc, session.id, playerTokenOf(req));
  if (me) {
    const nowIso = new Date().toISOString();
    await svc.from('qm_arena_players').update({ last_seen_at: nowIso }).eq('id', me.id);
    me.last_seen_at = nowIso;
  }

  const state = await buildPlayState(svc, session, set, me);
  return NextResponse.json(state);
}
