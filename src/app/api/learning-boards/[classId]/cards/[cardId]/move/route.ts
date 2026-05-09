import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember, getServiceSupabase } from '@/lib/supabase-route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/learning-boards/:classId/cards/:cardId/move
// Body: { action: 'up' | 'down' | 'top' | 'bottom' } OR { action: 'to', columnId: string, position: number }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { classId: string; cardId: string } }
) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action || '').toLowerCase();

  // Load the card
  const { data: card, error: cardErr } = await admin
    .from('qm_learning_cards')
    .select('id, board_id, column_id, position')
    .eq('id', params.cardId)
    .single();
  if (cardErr || !card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  // Verify the board belongs to this class
  const { data: board } = await admin
    .from('qm_learning_boards')
    .select('id, class_id')
    .eq('id', card.board_id)
    .single();
  if (!board || board.class_id !== params.classId) {
    return NextResponse.json({ error: 'Board mismatch' }, { status: 403 });
  }

  // Helper: load all cards in a column ordered
  async function loadColumnCards(columnId: string) {
    const { data, error } = await admin
      .from('qm_learning_cards')
      .select('id, position')
      .eq('column_id', columnId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []) as Array<{ id: string; position: number }>;
  }

  // Helper: persist new ordered list as positions 0..n-1
  async function persistOrder(rows: Array<{ id: string }>, columnId: string) {
    // Update each row whose new position differs
    for (let i = 0; i < rows.length; i++) {
      const { error } = await admin
        .from('qm_learning_cards')
        .update({ position: i, column_id: columnId })
        .eq('id', rows[i].id);
      if (error) throw new Error(error.message);
    }
  }

  try {
    if (action === 'up' || action === 'down' || action === 'top' || action === 'bottom') {
      const list = await loadColumnCards(card.column_id);
      const idx = list.findIndex((c) => c.id === card.id);
      if (idx < 0) return NextResponse.json({ error: 'Card not in column' }, { status: 500 });
      let newIdx = idx;
      if (action === 'up') newIdx = Math.max(0, idx - 1);
      else if (action === 'down') newIdx = Math.min(list.length - 1, idx + 1);
      else if (action === 'top') newIdx = 0;
      else if (action === 'bottom') newIdx = list.length - 1;
      if (newIdx === idx) return NextResponse.json({ ok: true, unchanged: true });
      const next = list.slice();
      const [moved] = next.splice(idx, 1);
      next.splice(newIdx, 0, moved);
      await persistOrder(next, card.column_id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'to') {
      const targetColumnId = String(body?.columnId || '');
      const targetPos = Number.isFinite(body?.position) ? Math.max(0, Math.floor(body.position)) : 0;
      if (!targetColumnId) return NextResponse.json({ error: 'columnId required' }, { status: 400 });

      // Verify target column belongs to same board
      const { data: targetCol } = await admin
        .from('qm_learning_columns')
        .select('id, board_id')
        .eq('id', targetColumnId)
        .single();
      if (!targetCol || targetCol.board_id !== card.board_id) {
        return NextResponse.json({ error: 'Target column not in same board' }, { status: 400 });
      }

      if (targetColumnId === card.column_id) {
        const list = await loadColumnCards(card.column_id);
        const idx = list.findIndex((c) => c.id === card.id);
        const filtered = list.filter((c) => c.id !== card.id);
        const clamped = Math.min(targetPos, filtered.length);
        filtered.splice(clamped, 0, { id: card.id, position: 0 });
        await persistOrder(filtered, card.column_id);
        return NextResponse.json({ ok: true });
      } else {
        // Cross column: remove from source, insert into target
        const src = (await loadColumnCards(card.column_id)).filter((c) => c.id !== card.id);
        const dst = await loadColumnCards(targetColumnId);
        const clamped = Math.min(targetPos, dst.length);
        const dstNext = dst.slice();
        dstNext.splice(clamped, 0, { id: card.id, position: 0 });
        await persistOrder(src, card.column_id);
        await persistOrder(dstNext, targetColumnId);
        return NextResponse.json({ ok: true });
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
