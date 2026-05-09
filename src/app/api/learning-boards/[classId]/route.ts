import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember, requireClassOwner } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { classId: string } }) {
  const access = await requireClassMember(params.classId);
  if (access.response) return access.response;
  const supa = access.supa;
  const classId = params.classId;

  let { data: board } = await supa
    .from('qm_learning_boards')
    .select('*')
    .eq('class_id', classId)
    .maybeSingle();

  if (!board) {
    const owner = await requireClassOwner(classId);
    if (owner.response) return NextResponse.json({ board: null, columns: [] });
    const { data: created, error: cErr } = await owner.supa
      .from('qm_learning_boards')
      .insert({ class_id: classId, title: 'Learning Board' })
      .select('*')
      .single();
    if (cErr || !created) return NextResponse.json({ error: cErr?.message || 'Could not create board' }, { status: 500 });
    board = created;
    await owner.supa.from('qm_learning_columns').insert({ board_id: board.id, title: 'Pengenalan', position: 0 });
  }

  const { data: columns } = await supa
    .from('qm_learning_columns')
    .select('*')
    .eq('board_id', board.id)
    .order('position', { ascending: true });

  const { data: cards } = await supa
    .from('qm_learning_cards')
    .select('*')
    .eq('board_id', board.id)
    .order('position', { ascending: true });

  const grouped = (columns || []).map((c: any) => ({
    ...c,
    cards: (cards || []).filter((x: any) => x.column_id === c.id),
  }));
  return NextResponse.json({ board, columns: grouped });
}

export async function PATCH(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassOwner(params.classId);
  if (owner.response) return owner.response;
  const body = await req.json().catch(() => ({}));
  const updates: any = {};
  if (typeof body.title === 'string') updates.title = body.title;
  if (typeof body.description === 'string') updates.description = body.description;
  if (typeof body.is_published === 'boolean') updates.is_published = body.is_published;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  const { data, error } = await owner.supa
    .from('qm_learning_boards')
    .update(updates)
    .eq('class_id', params.classId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ board: data });
}
