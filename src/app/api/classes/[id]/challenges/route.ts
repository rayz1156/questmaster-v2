import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: classId } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Hunts in this class
  const { data: hunts, error: huntsErr } = await supa
    .from('qm_hunts').select('id, title').eq('class_id', classId);
  if (huntsErr) return NextResponse.json({ error: huntsErr.message }, { status: 500 });
  const huntIds = (hunts ?? []).map((h) => h.id);
  if (huntIds.length === 0) return NextResponse.json({ data: { hunts: [], challenges: [] } });
  const { data: challenges, error: chErr } = await supa
    .from('qm_challenges').select('id, hunt_id, prompt, points, order_idx').in('hunt_id', huntIds).order('order_idx');
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 });
  return NextResponse.json({ data: { hunts, challenges } });
}
