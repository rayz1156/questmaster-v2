import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { makePlayerToken } from '@/lib/arena/public';
import { loadPlaySession, loadPlayerByToken, playerTokenOf, readJsonBody } from '@/lib/arena/play-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Peserta masuk sesi (tanpa akaun). Token sah = sambung semula pemain sama. */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const body = await readJsonBody(req);
  const svc = getServiceSupabase();
  const loaded = await loadPlaySession(svc, params.code);
  if (!loaded) return ralatJson('Session not found', 404);
  const { session } = loaded;

  // sambung semula
  const tok = typeof body.playerToken === 'string' && body.playerToken ? body.playerToken : playerTokenOf(req);
  if (tok) {
    const p = await loadPlayerByToken(svc, session.id, tok);
    if (p) {
      await svc.from('qm_arena_players').update({ last_seen_at: new Date().toISOString() }).eq('id', p.id);
      return NextResponse.json({ playerId: p.id, playerToken: p.player_token, nickname: p.nickname });
    }
  }

  if (session.status === 'ended') return ralatJson('Session ended', 409);

  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().replace(/\s+/g, ' ') : '';
  if (nickname.length < 1 || nickname.length > 24) return ralatJson('Nickname must be 1-24 characters', 400);

  const avRaw = Number(body.avatar);
  const avatar = Number.isInteger(avRaw) && avRaw >= 0 && avRaw <= 7 ? avRaw : 0;

  // mod team: guna pasukan diminta jika sah, jika tidak pasukan paling kecil
  let team: number | null = null;
  if (session.mode === 'team') {
    const tc = Math.max(2, Math.min(4, Number(session.team_count) || 2));
    const tRaw = body.team === null || body.team === undefined || body.team === '' ? NaN : Number(body.team);
    if (Number.isInteger(tRaw) && tRaw >= 0 && tRaw < tc) {
      team = tRaw;
    } else {
      const { data: others } = await svc.from('qm_arena_players').select('team').eq('session_id', session.id);
      const counts: number[] = Array.from({ length: tc }, () => 0);
      for (const o of (others ?? []) as unknown as { team: number | null }[]) {
        if (o.team !== null && o.team >= 0 && o.team < tc) counts[o.team] = (counts[o.team] ?? 0) + 1;
      }
      let best = 0;
      for (let i = 1; i < tc; i++) if ((counts[i] ?? 0) < (counts[best] ?? 0)) best = i;
      team = best;
    }
  }

  const playerToken = makePlayerToken();
  const { data: ins, error } = await svc
    .from('qm_arena_players')
    .insert({ session_id: session.id, nickname, player_token: playerToken, avatar, team })
    .select('id')
    .single();
  if (error || !ins) {
    if (error?.code === '23505') return ralatJson('Nickname taken', 409);
    return ralatJson('Could not join session', 500);
  }
  return NextResponse.json({ playerId: (ins as unknown as { id: string }).id, playerToken, nickname });
}
