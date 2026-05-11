import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.code === 'string' || body.code === null) patch.code = body.code;
  if (typeof body.label === 'string') patch.label = body.label;
  if (typeof body.description === 'string' || body.description === null) patch.description = body.description;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no changes' }, { status: 400 });
  const { data, error } = await supa
    .from('qm_learning_outcomes').update(patch).eq('id', id)
    .select('id, class_id, code, label, description, created_at, updated_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { error } = await supa.from('qm_learning_outcomes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
