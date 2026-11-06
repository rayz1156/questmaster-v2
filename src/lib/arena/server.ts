// Pembantu laluan pendidik Arena: semakan pemilik set / hos sesi (service role).
import type { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { normalizeSettings } from '@/lib/arena/validate';
import type { ArenaSession, ArenaSet } from '@/lib/arena/types';

type Svc = ReturnType<typeof getServiceSupabase>;

export async function isAdmin(svc: Svc, userId: string): Promise<boolean> {
  const { data } = await svc.from('qm_profiles').select('role').eq('id', userId).maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  return role === 'admin' || role === 'superadmin';
}

export function toArenaSet(row: Record<string, unknown>): ArenaSet {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    settings: normalizeSettings(row.settings),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function requireSetOwner(
  req: NextRequest | Request,
  setId: string,
): Promise<{ user: User | null; svc: Svc; set: ArenaSet | null; response: NextResponse | null }> {
  const auth = await requireUser(req);
  const svc = getServiceSupabase();
  const user = auth.user;
  if (auth.response || !user) return { user: null, svc, set: null, response: auth.response ?? ralatJson('Not authed', 401) };
  const { data, error } = await svc.from('qm_arena_sets').select('*').eq('id', setId).maybeSingle();
  if (error || !data) return { user, svc, set: null, response: ralatJson('Not found', 404) };
  const set = toArenaSet(data as Record<string, unknown>);
  if (set.owner_id !== user.id && !(await isAdmin(svc, user.id))) {
    return { user, svc, set: null, response: ralatJson('Forbidden', 403) };
  }
  return { user, svc, set, response: null };
}

export async function requireSessionHost(
  req: NextRequest | Request,
  sessionId: string,
): Promise<{ user: User | null; svc: Svc; session: ArenaSession | null; set: ArenaSet | null; response: NextResponse | null }> {
  const auth = await requireUser(req);
  const svc = getServiceSupabase();
  const user = auth.user;
  if (auth.response || !user) return { user: null, svc, session: null, set: null, response: auth.response ?? ralatJson('Not authed', 401) };
  const { data, error } = await svc.from('qm_arena_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (error || !data) return { user, svc, session: null, set: null, response: ralatJson('Not found', 404) };
  const session = data as ArenaSession;
  const { data: setRow } = await svc.from('qm_arena_sets').select('*').eq('id', session.set_id).maybeSingle();
  const set = setRow ? toArenaSet(setRow as Record<string, unknown>) : null;
  const ok = session.host_id === user.id || (set !== null && set.owner_id === user.id) || (await isAdmin(svc, user.id));
  if (!ok) return { user, svc, session: null, set: null, response: ralatJson('Forbidden', 403) };
  return { user, svc, session, set, response: null };
}
