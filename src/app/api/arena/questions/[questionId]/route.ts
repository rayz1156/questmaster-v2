// Kemas kini / padam satu soalan Arena (pemilik set sahaja).
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { validateQuestion } from '@/lib/arena/validate';
import { requireSetOwner } from '@/lib/arena/server';
import type { ArenaQuestion } from '@/lib/arena/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const COLS = 'id, set_id, order_idx, type, prompt, data, hint, points, time_limit_sec, origin';

async function loadSetId(questionId: string): Promise<string | null> {
  const { data } = await getServiceSupabase().from('qm_arena_questions').select('set_id').eq('id', questionId).maybeSingle();
  return data ? String((data as { set_id: string }).set_id) : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { questionId: string } }) {
  const setId = await loadSetId(params.questionId);
  if (!setId) return ralatJson('Not found', 404);
  const own = await requireSetOwner(req, setId);
  if (own.response || !own.set) return own.response ?? ralatJson('Not found', 404);
  const body = (await req.json().catch(() => null)) as unknown;
  const v = validateQuestion(body);
  if (!v.ok) return ralatJson(v.error, 400);
  const q = v.value;
  const patch: Record<string, unknown> = {
    type: q.type,
    prompt: q.prompt,
    data: q.data,
    hint: q.hint ?? null,
    points: q.points ?? 100,
    time_limit_sec: q.time_limit_sec ?? 30,
    origin: q.origin ?? 'manual',
  };
  if (q.order_idx !== undefined) patch.order_idx = q.order_idx;
  const { data, error } = await own.svc
    .from('qm_arena_questions')
    .update(patch)
    .eq('id', params.questionId)
    .select(COLS)
    .single();
  if (error || !data) return ralatJson(error?.message ?? 'Update failed', 500);
  return NextResponse.json({ question: data as ArenaQuestion });
}

export async function DELETE(req: NextRequest, { params }: { params: { questionId: string } }) {
  const setId = await loadSetId(params.questionId);
  if (!setId) return ralatJson('Not found', 404);
  const own = await requireSetOwner(req, setId);
  if (own.response || !own.set) return own.response ?? ralatJson('Not found', 404);
  const { error } = await own.svc.from('qm_arena_questions').delete().eq('id', params.questionId);
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ ok: true });
}
