import { NextRequest, NextResponse } from 'next/server';
import { requireClassOwner } from '@/lib/supabase-route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { classId: string; columnId: string } }) {
  const owner = await requireClassOwner(params.classId);
  if (owner.response) return owner.response;
  const body = await req.json().catch(() => ({}));
  const updates: any = {};
  if (typeof body.title === 'string') updates.title = body.title;
  if (typeof body.position === 'number') updates.position = body.position;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  const { data, error } = await owner.supa
    .from('qm_learning_columns')
    .update(updates)
    .eq('id', params.columnId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ column: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { classId: string; columnId: string } }) {
  const owner = await requireClassOwner(params.classId);
  if (owner.response) return owner.response;
  const { error } = await owner.supa.from('qm_learning_columns').delete().eq('id', params.columnId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
