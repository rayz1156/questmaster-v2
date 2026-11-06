// Senarai & cipta set soalan Arena (pendidik).
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { normalizeSettings } from '@/lib/arena/validate';
import { toArenaSet } from '@/lib/arena/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  const user = auth.user;
  if (auth.response || !user) return auth.response ?? ralatJson('Not authed', 401);
  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from('qm_arena_sets')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return ralatJson(error.message, 500);
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id));
  const counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: qs } = await svc.from('qm_arena_questions').select('set_id').in('set_id', ids);
    for (const q of (qs ?? []) as { set_id: string }[]) counts[q.set_id] = (counts[q.set_id] ?? 0) + 1;
  }
  const sets = rows.map((r) => ({ ...toArenaSet(r), question_count: counts[String(r.id)] ?? 0 }));
  return NextResponse.json({ sets });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  const user = auth.user;
  if (auth.response || !user) return auth.response ?? ralatJson('Not authed', 401);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return ralatJson('Invalid body', 400);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 1 || title.length > 200) return ralatJson('Title must be 1-200 characters', 400);
  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 2000) : null;
  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from('qm_arena_sets')
    .insert({ owner_id: user.id, title, description, settings: normalizeSettings(body.settings) })
    .select('*')
    .single();
  if (error || !data) return ralatJson(error?.message ?? 'Insert failed', 500);
  return NextResponse.json({ set: toArenaSet(data as Record<string, unknown>) });
}
