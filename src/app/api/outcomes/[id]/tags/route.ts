import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supa
    .from('qm_challenge_outcomes')
    .select('challenge_id, outcome_id, weight, created_at')
    .eq('outcome_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const challenge_id = body?.challenge_id as string | undefined;
  const weight = typeof body?.weight === 'number' ? body.weight : 1.0;
  if (!challenge_id) return NextResponse.json({ error: 'challenge_id required' }, { status: 400 });
  const { error } = await supa
    .from('qm_challenge_outcomes')
    .upsert({ challenge_id, outcome_id: id, weight }, { onConflict: 'challenge_id,outcome_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const challenge_id = url.searchParams.get('challenge_id');
  if (!challenge_id) return NextResponse.json({ error: 'challenge_id required' }, { status: 400 });
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { error } = await supa
    .from('qm_challenge_outcomes')
    .delete()
    .eq('outcome_id', id)
    .eq('challenge_id', challenge_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
