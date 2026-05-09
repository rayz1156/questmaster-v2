import { NextRequest, NextResponse } from 'next/server';
import { requireClassOwner } from '@/lib/supabase-route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassOwner(req, params.classId);
  if (owner.response) return owner.response;
  const { title } = await req.json().catch(() => ({}));
  if (!title || typeof title !== 'string') return NextResponse.json({ error: 'title required' }, { status: 400 });
  const { data: board } = await owner.supa.from('qm_learning_boards').select('id').eq('class_id', params.classId).single();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  const { data: maxRow } = await owner.supa
    .from('qm_learning_columns')
    .select('position')
    .eq('board_id', board.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (maxRow?.position ?? -1) + 1;
  const { data, error } = await owner.supa
    .from('qm_learning_columns')
    .insert({ board_id: board.id, title, position: nextPos })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ column: data });
}
