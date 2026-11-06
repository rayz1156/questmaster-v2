// Senarai & cipta sesi Arena bagi satu set (pemilik sahaja).
import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { requireSetOwner } from '@/lib/arena/server';
import { makeSessionCode } from '@/lib/arena/public';
import { ARENA_MAPS } from '@/lib/arena/maps';
import { ARENA_MODES, type ArenaMode, type ArenaSession, type ArenaView } from '@/lib/arena/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest, { params }: { params: { setId: string } }) {
  const own = await requireSetOwner(req, params.setId);
  if (own.response || !own.set) return own.response ?? ralatJson('Not found', 404);
  const { data, error } = await own.svc
    .from('qm_arena_sessions')
    .select('*')
    .eq('set_id', own.set.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ sessions: (data ?? []) as ArenaSession[] });
}

export async function POST(req: NextRequest, { params }: { params: { setId: string } }) {
  const own = await requireSetOwner(req, params.setId);
  if (own.response || !own.set || !own.user) return own.response ?? ralatJson('Not found', 404);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return ralatJson('Invalid body', 400);
  const mode = String(body.mode ?? '') as ArenaMode;
  if (!(ARENA_MODES as readonly string[]).includes(mode)) return ralatJson('Invalid mode', 400);
  const view: ArenaView = body.view === 'map' ? 'map' : 'list';
  const mapIdRaw = typeof body.mapId === 'string' ? body.mapId : '';
  const mapId = ARENA_MAPS.some((m) => m.id === mapIdRaw) ? mapIdRaw : (ARENA_MAPS[0]?.id ?? 'kampus');
  const tcRaw = Number(body.teamCount ?? 2);
  const teamCount = Number.isFinite(tcRaw) ? Math.min(4, Math.max(2, Math.round(tcRaw))) : 2;
  const { count } = await own.svc
    .from('qm_arena_questions')
    .select('id', { count: 'exact', head: true })
    .eq('set_id', own.set.id);
  if (!count) return ralatJson('Set has no questions', 400);
  // cuba kod unik sehingga 5 kali
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await own.svc
      .from('qm_arena_sessions')
      .insert({
        set_id: own.set.id,
        host_id: own.user.id,
        code: makeSessionCode(),
        mode,
        view,
        map_id: mapId,
        team_count: teamCount,
      })
      .select('*')
      .single();
    if (!error && data) return NextResponse.json({ session: data as ArenaSession });
    if (error && error.code !== '23505') return ralatJson(error.message, 500);
  }
  return ralatJson('Could not generate a unique session code', 500);
}
