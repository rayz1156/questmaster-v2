// Tambah soalan (satu atau pukal) & susun semula turutan soalan set.
import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { validateQuestion } from '@/lib/arena/validate';
import { requireSetOwner } from '@/lib/arena/server';
import type { ArenaQuestion, ArenaQuestionInput } from '@/lib/arena/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const COLS = 'id, set_id, order_idx, type, prompt, data, hint, points, time_limit_sec, origin';

export async function POST(req: NextRequest, { params }: { params: { setId: string } }) {
  const own = await requireSetOwner(req, params.setId);
  if (own.response || !own.set) return own.response ?? ralatJson('Not found', 404);
  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object') return ralatJson('Invalid body', 400);
  const rawList: unknown[] = Array.isArray((body as { questions?: unknown }).questions)
    ? ((body as { questions: unknown[] }).questions)
    : [body];
  if (rawList.length < 1 || rawList.length > 100) return ralatJson('Send 1-100 questions', 400);
  const valid: ArenaQuestionInput[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const v = validateQuestion(rawList[i]);
    if (!v.ok) return ralatJson(`Question ${i}: ${v.error}`, 400, { index: i, reason: v.error });
    valid.push(v.value);
  }
  // order_idx seterusnya selepas soalan terakhir
  const { data: last } = await own.svc
    .from('qm_arena_questions')
    .select('order_idx')
    .eq('set_id', own.set.id)
    .order('order_idx', { ascending: false })
    .limit(1)
    .maybeSingle();
  let next = last ? Number((last as { order_idx: number }).order_idx) + 1 : 0;
  const rows = valid.map((q) => ({
    set_id: own.set!.id,
    order_idx: q.order_idx ?? next++,
    type: q.type,
    prompt: q.prompt,
    data: q.data,
    hint: q.hint ?? null,
    points: q.points ?? 100,
    time_limit_sec: q.time_limit_sec ?? 30,
    origin: q.origin ?? 'manual',
  }));
  const { data, error } = await own.svc.from('qm_arena_questions').insert(rows).select(COLS);
  if (error) return ralatJson(error.message, 500);
  const questions = ((data ?? []) as ArenaQuestion[]).sort((a, b) => a.order_idx - b.order_idx);
  await own.svc.from('qm_arena_sets').update({ updated_at: new Date().toISOString() }).eq('id', own.set.id);
  return NextResponse.json({ questions });
}

export async function PUT(req: NextRequest, { params }: { params: { setId: string } }) {
  const own = await requireSetOwner(req, params.setId);
  if (own.response || !own.set) return own.response ?? ralatJson('Not found', 404);
  const body = (await req.json().catch(() => null)) as { order?: unknown } | null;
  const order = body && Array.isArray(body.order) ? body.order : null;
  if (!order || order.length > 500 || !order.every((x): x is string => typeof x === 'string')) {
    return ralatJson('order must be an array of question ids', 400);
  }
  const setId = own.set.id;
  const results = await Promise.all(
    order.map((id, idx) => own.svc.from('qm_arena_questions').update({ order_idx: idx }).eq('id', id).eq('set_id', setId)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return ralatJson(failed.error.message, 500);
  return NextResponse.json({ ok: true });
}
