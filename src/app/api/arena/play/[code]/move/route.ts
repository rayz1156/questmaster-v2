import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { loadPlayerByToken, loadSessionByCode, playerTokenOf, readJsonBody } from '@/lib/arena/play-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function clampPos(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(20000, Math.max(0, n));
}

/** Kemas kini posisi avatar (diabaikan jika beku atau tidak bermain). */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const body = await readJsonBody(req);
  const svc = getServiceSupabase();
  const session = await loadSessionByCode(svc, params.code);
  if (!session) return ralatJson('Session not found', 404);

  const me = await loadPlayerByToken(svc, session.id, playerTokenOf(req));
  if (!me) return ralatJson('Invalid player token', 401);

  if (session.status !== 'playing' || session.frozen) return NextResponse.json({ ok: false });

  const x = clampPos(body.x);
  const y = clampPos(body.y);
  if (x === null || y === null) return ralatJson('Invalid position', 400);

  const { error } = await svc
    .from('qm_arena_players')
    .update({ pos_x: x, pos_y: y, last_seen_at: new Date().toISOString() })
    .eq('id', me.id);
  return NextResponse.json({ ok: !error });
}
