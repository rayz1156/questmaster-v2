import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember, getServiceSupabase } from '@/lib/supabase-route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/learning-boards/:classId/columns/:columnId/move
// Body: { action: 'left' | 'right' | 'first' | 'last' } OR { action: 'to', position: number }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { classId: string; columnId: string } }
) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action || '').toLowerCase();

  const { data: col, error: colErr } = await admin
    .from('qm_learning_columns')
    .select('id, board_id, position')
    .eq('id', params.columnId)
    .single();
  if (colErr || !col) return NextResponse.json({ error: 'Column not found' }, { status: 404 });

  const { data: board } = await admin
    .from('qm_learning_boards')
    .select('id, class_id')
    .eq('id', col.board_id)
    .single();
  if (!board || board.class_id !== params.classId) {
    return NextResponse.json({ error: 'Board mismatch' }, { status: 403 });
  }

  const { data: list, error: listErr } = await admin
    .from('qm_learning_columns')
    .select('id, position')
    .eq('board_id', col.board_id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  const cols = (list || []) as Array<{ id: string }>;
  const idx = cols.findIndex((c) => c.id === col.id);
  if (idx < 0) return NextResponse.json({ error: 'Column not in board' }, { status: 500 });

  let newIdx = idx;
  if (action === 'left') newIdx = Math.max(0, idx - 1);
  else if (action === 'right') newIdx = Math.min(cols.length - 1, idx + 1);
  else if (action === 'first') newIdx = 0;
  else if (action === 'last') newIdx = cols.length - 1;
  else if (action === 'to') {
    const p = Number.isFinite(body?.position) ? Math.max(0, Math.floor(body.position)) : idx;
    newIdx = Math.min(cols.length - 1, p);
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  if (newIdx === idx) return NextResponse.json({ ok: true, unchanged: true });

  const next = cols.slice();
  const [moved] = next.splice(idx, 1);
  next.splice(newIdx, 0, moved);

  for (let i = 0; i < next.length; i++) {
    const { error } = await admin
      .from('qm_learning_columns')
      .update({ position: i })
      .eq('id', next[i].id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
