/**
 * GET /api/live/play/[code]/leaderboard — 20 teratas untuk peserta.
 * Tiada ID dalaman; hanya rank, nickname dan markah.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

interface PlayerRow { nickname: string; score: number; }

export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').toUpperCase();

  const supa = getServiceSupabase();

  const { data: session } = (await supa
    .from('qm_live_sessions')
    .select('id')
    .eq('code', code)
    .maybeSingle()) as { data: { id: string } | null };
  if (!session) {
    return NextResponse.json({ error: 'Sesi tidak dijumpai.' }, { status: 404 });
  }

  const { data: players } = (await supa
    .from('qm_live_players')
    .select('nickname, score')
    .eq('session_id', session.id)
    .order('score', { ascending: false })
    .order('total_ms', { ascending: true })
    .order('joined_at', { ascending: true })
    .limit(20)) as { data: PlayerRow[] | null };

  const leaderboard = (players || []).map((p, i) => ({
    rank: i + 1,
    nickname: p.nickname,
    score: p.score,
  }));

  return NextResponse.json({ leaderboard });
}
