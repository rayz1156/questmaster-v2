import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  sourceClassId?: string;
  mode?: 'replace' | 'append';
};

/** Returns true if user is owner OR an accepted co-educator on the class. */
async function userCanEditClass(admin: any, classId: string, userId: string): Promise<boolean> {
  const { data: klass } = await admin.from('qm_classes').select('owner_id').eq('id', classId).maybeSingle();
  if (!klass) return false;
  if (klass.owner_id === userId) return true;
  const { data: edu } = await admin
    .from('qm_class_educators')
    .select('educator_id, accepted_at')
    .eq('class_id', classId)
    .eq('educator_id', userId)
    .maybeSingle();
  return !!(edu && edu.accepted_at);
}

export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;

  const body: Body = await req.json().catch(() => ({} as Body));
  const sourceClassId = body.sourceClassId;
  const mode = body.mode === 'replace' ? 'replace' : 'append';
  if (!sourceClassId) return NextResponse.json({ error: 'sourceClassId required' }, { status: 400 });
  if (sourceClassId === params.classId) return NextResponse.json({ error: 'Source and destination must differ' }, { status: 400 });

  const admin = getServiceSupabase();

  // Permission check on BOTH classes
  const [canDst, canSrc] = await Promise.all([
    userCanEditClass(admin, params.classId, userId),
    userCanEditClass(admin, sourceClassId, userId),
  ]);
  if (!canDst) return NextResponse.json({ error: 'Not authorized for destination class' }, { status: 403 });
  if (!canSrc) return NextResponse.json({ error: 'Not authorized for source class' }, { status: 403 });

  // Source board
  const { data: srcBoard } = await admin
    .from('qm_learning_boards')
    .select('id')
    .eq('class_id', sourceClassId)
    .maybeSingle();
  if (!srcBoard) return NextResponse.json({ error: 'Source has no learning board' }, { status: 404 });

  // Destination board (create if missing)
  let { data: dstBoard } = await admin
    .from('qm_learning_boards')
    .select('id')
    .eq('class_id', params.classId)
    .maybeSingle();
  if (!dstBoard) {
    const ins = await admin.from('qm_learning_boards').insert({ class_id: params.classId, is_published: true }).select('id').single();
    dstBoard = ins.data;
  }
  if (!dstBoard) return NextResponse.json({ error: 'Failed to ensure destination board' }, { status: 500 });

  // Replace mode: delete all destination columns (cascades to cards if FK is ON DELETE CASCADE)
  let basePosition = 0;
  if (mode === 'replace') {
    // Manually delete cards first in case FK isn't cascade
    const { data: dstCols } = await admin.from('qm_learning_columns').select('id').eq('board_id', dstBoard.id);
    const colIds = (dstCols || []).map((c: any) => c.id);
    if (colIds.length) {
      await admin.from('qm_learning_cards').delete().in('column_id', colIds);
      await admin.from('qm_learning_columns').delete().in('id', colIds);
    }
  } else {
    // Append: start positions after the current max
    const { data: maxRow } = await admin
      .from('qm_learning_columns')
      .select('position')
      .eq('board_id', dstBoard.id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    basePosition = (maxRow?.position ?? -1) + 1;
  }

  // Read source columns + cards and copy by reference
  const { data: srcCols } = await admin
    .from('qm_learning_columns')
    .select('id, title, position')
    .eq('board_id', srcBoard.id)
    .order('position', { ascending: true });

  const summary = { columns: 0, cards: 0 };
  const _srcColsArr = srcCols || []; for (let idx = 0; idx < _srcColsArr.length; idx++) { const col = _srcColsArr[idx];
    const newPos = mode === 'append' ? basePosition + idx : col.position;
    const { data: newCol } = await admin
      .from('qm_learning_columns')
      .insert({ board_id: dstBoard.id, title: col.title, position: newPos })
      .select('id')
      .single();
    if (!newCol) continue;
    summary.columns++;
    const { data: srcCards } = await admin
      .from('qm_learning_cards')
      .select('*')
      .eq('column_id', col.id)
      .order('position', { ascending: true });
    for (const card of srcCards || []) {
      const { id, column_id, board_id, created_at, updated_at, created_by, ...rest } = card as any;
      const { error: cardErr } = await admin.from('qm_learning_cards').insert({ ...rest, column_id: newCol.id, board_id: dstBoard.id, created_by: userId });
      if (cardErr) { console.error('[import] card insert error', cardErr); continue; }
      summary.cards++;
    }
  }

  return NextResponse.json({ ok: true, mode, ...summary });
}
