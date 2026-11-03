import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return ralatJson('Unauthorized', 401);
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.code === 'string' || body.code === null) patch.code = body.code;
  if (typeof body.label === 'string') patch.label = body.label;
  if (typeof body.description === 'string' || body.description === null) patch.description = body.description;
  if (Object.keys(patch).length === 0) return ralatJson('no changes', 400);
  const { data, error } = await supa
    .from('qm_learning_outcomes').update(patch).eq('id', id)
    .select('id, class_id, code, label, description, created_at, updated_at').single();
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return ralatJson('Unauthorized', 401);
  const { error } = await supa.from('qm_learning_outcomes').delete().eq('id', id);
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ ok: true });
}
