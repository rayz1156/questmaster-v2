import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { huntId: string; classId: string; itemId: string } }) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa } = auth;

  const body = await req.json().catch(() => ({}));
  const updates: any = {};
  if (typeof body.title === 'string') updates.title = body.title;
  if (typeof body.description === 'string') updates.description = body.description;
  if (typeof body.linkTitle === 'string') updates.link_title = body.linkTitle;
  if (typeof body.linkDescription === 'string') updates.link_description = body.linkDescription;
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  // RLS: owner can update own; educator can update any. We just attempt the update.
  const { data, error } = await supa
    .from('qm_submission_board_items')
    .update(updates)
    .eq('id', params.itemId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { huntId: string; classId: string; itemId: string } }) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa } = auth;

  // RLS enforces who can delete (owner or class educator)
  const { error } = await supa.from('qm_submission_board_items').delete().eq('id', params.itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true });
}
