// Kawalan hos: mula, tamat, beku, soalan seterusnya/sebelum, Start Together, had masa.
import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { requireSessionHost } from '@/lib/arena/server';
import type { ArenaSession } from '@/lib/arena/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const ACTIONS = ['start', 'end', 'freeze', 'unfreeze', 'next', 'prev', 'restart', 'set_time_limit'] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const host = await requireSessionHost(req, params.sessionId);
  if (host.response || !host.session) return host.response ?? ralatJson('Not found', 404);
  const s = host.session;
  const svc = host.svc;
  const body = (await req.json().catch(() => null)) as { action?: unknown; minutes?: unknown } | null;
  const action = String(body?.action ?? '') as Action;
  if (!(ACTIONS as readonly string[]).includes(action)) return ralatJson('Invalid action', 400);
  const minutesRaw = body?.minutes === undefined || body?.minutes === null ? null : Number(body.minutes);
  const minutes = minutesRaw !== null && Number.isFinite(minutesRaw) ? Math.min(600, Math.max(0, minutesRaw)) : null;

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const patch: Partial<ArenaSession> = {};

  // KZ-045: kira soalan ikut sumber sesi (kuiz melalui quiz_id, set lama
  // melalui set_id). Arena memainkan keenam-enam jenis.
  const questionCount = async (): Promise<number> => {
    const src = s.quiz_id
      ? svc.from('qm_live_questions').select('id', { count: 'exact', head: true }).eq('quiz_id', s.quiz_id)
      : svc.from('qm_arena_questions').select('id', { count: 'exact', head: true }).eq('set_id', s.set_id);
    const { count } = await src;
    return count ?? 0;
  };

  switch (action) {
    case 'start':
      patch.status = 'playing';
      patch.started_at = now;
      patch.ended_at = null;
      if (s.mode === 'round') {
        patch.current_index = 0;
        patch.round_started_at = now;
      }
      if (minutes !== null) patch.ends_at = minutes > 0 ? new Date(nowMs + minutes * 60_000).toISOString() : null;
      break;
    case 'end':
      patch.status = 'ended';
      patch.ended_at = now;
      break;
    case 'freeze':
      patch.frozen = true;
      break;
    case 'unfreeze':
      patch.frozen = false;
      break;
    case 'next':
    case 'prev': {
      if (s.mode !== 'round') return ralatJson('Only available in round mode', 400);
      if (s.status !== 'playing') return ralatJson('Session not running', 409);
      if (action === 'next') {
        const idx = s.current_index + 1;
        if (idx >= (await questionCount())) {
          patch.status = 'ended';
          patch.ended_at = now;
        } else {
          patch.current_index = idx;
          patch.round_started_at = now;
        }
      } else {
        patch.current_index = Math.max(0, s.current_index - 1);
        patch.round_started_at = now;
      }
      break;
    }
    case 'restart': {
      // Start Together: semua avatar ke titik mula, jawapan dikekalkan
      patch.reset_seq = (s.reset_seq ?? 0) + 1;
      patch.status = 'playing';
      patch.ended_at = null;
      if (!s.started_at) patch.started_at = now;
      if (s.mode === 'round' && s.current_index < 0) {
        patch.current_index = 0;
        patch.round_started_at = now;
      }
      const { error: pErr } = await svc.from('qm_arena_players').update({ pos_x: 0, pos_y: 0 }).eq('session_id', s.id);
      if (pErr) return ralatJson(pErr.message, 500);
      break;
    }
    case 'set_time_limit':
      if (minutes === null) return ralatJson('minutes is required', 400);
      patch.ends_at = minutes > 0 ? new Date(nowMs + minutes * 60_000).toISOString() : null;
      break;
  }

  const { data, error } = await svc.from('qm_arena_sessions').update(patch).eq('id', s.id).select('*').single();
  if (error || !data) return ralatJson(error?.message ?? 'Update failed', 500);
  return NextResponse.json({ session: data as ArenaSession });
}
