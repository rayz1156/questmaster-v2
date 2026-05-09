import { NextRequest, NextResponse } from 'next/server';
import { requireClassOwner } from '@/lib/supabase-route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { classId: string; cardId: string } }) {
  const owner = await requireClassOwner(req, params.classId);
  if (owner.response) return owner.response;
  const body = await req.json().catch(() => ({}));
  const updates: any = {};
  for (const k of ['title', 'description', 'link_url', 'link_title', 'link_description', 'link_image_url', 'link_site_name', 'link_favicon_url', 'image_url']) {
    if (k in body) updates[k] = body[k];
  }
  if (typeof body.position === 'number') updates.position = body.position;
  if (typeof body.column_id === 'string') updates.column_id = body.column_id;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  const { data, error } = await owner.supa
    .from('qm_learning_cards')
    .update(updates)
    .eq('id', params.cardId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { classId: string; cardId: string } }) {
  const owner = await requireClassOwner(req, params.classId);
  if (owner.response) return owner.response;
  // Note: Adilo file is intentionally NOT deleted here — the educator may
  // re-link or recover. Cleanup is a Phase 2 admin operation.
  const { error } = await owner.supa.from('qm_learning_cards').delete().eq('id', params.cardId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
