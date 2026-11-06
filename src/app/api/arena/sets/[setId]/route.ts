// Baca / kemas kini / padam satu set Arena (pemilik sahaja).
import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { normalizeSettings } from '@/lib/arena/validate';
import { requireSetOwner, toArenaSet } from '@/lib/arena/server';
import type { ArenaQuestion } from '@/lib/arena/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest, { params }: { params: { setId: string } }) {
  const own = await requireSetOwner(req, params.setId);
  if (own.response || !own.set) return own.response ?? ralatJson('Not found', 404);
  const { data, error } = await own.svc
    .from('qm_arena_questions')
    .select('id, set_id, order_idx, type, prompt, data, hint, points, time_limit_sec, origin')
    .eq('set_id', own.set.id)
    .order('order_idx', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ set: own.set, questions: (data ?? []) as ArenaQuestion[] });
}

export async function PATCH(req: NextRequest, { params }: { params: { setId: string } }) {
  const own = await requireSetOwner(req, params.setId);
  if (own.response || !own.set) return own.response ?? ralatJson('Not found', 404);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return ralatJson('Invalid body', 400);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 1 || title.length > 200) return ralatJson('Title must be 1-200 characters', 400);
    patch.title = title;
  }
  if (body.description !== undefined) {
    patch.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 2000) : null;
  }
  if (body.settings !== undefined) {
    const incoming = typeof body.settings === 'object' && body.settings !== null ? (body.settings as Record<string, unknown>) : {};
    // gabung dengan tetapan sedia ada
    patch.settings = normalizeSettings({ ...own.set.settings, ...incoming });
  }
  const { data, error } = await own.svc.from('qm_arena_sets').update(patch).eq('id', own.set.id).select('*').single();
  if (error || !data) return ralatJson(error?.message ?? 'Update failed', 500);
  return NextResponse.json({ set: toArenaSet(data as Record<string, unknown>) });
}

export async function DELETE(req: NextRequest, { params }: { params: { setId: string } }) {
  const own = await requireSetOwner(req, params.setId);
  if (own.response || !own.set) return own.response ?? ralatJson('Not found', 404);
  const { error } = await own.svc.from('qm_arena_sets').delete().eq('id', own.set.id);
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ ok: true });
}
