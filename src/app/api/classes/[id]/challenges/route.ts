import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: classId } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return ralatJson('Unauthorized', 401);
  // Hunts in this class
  const { data: hunts, error: huntsErr } = await supa
    .from('qm_hunts').select('id, title').eq('class_id', classId);
  if (huntsErr) return ralatJson(huntsErr.message, 500);
  const huntIds = (hunts ?? []).map((h) => h.id);
  if (huntIds.length === 0) return NextResponse.json({ data: { hunts: [], challenges: [] } });
  const { data: challenges, error: chErr } = await supa
    .from('qm_challenges').select('id, hunt_id, prompt, points, order_idx').in('hunt_id', huntIds).order('order_idx');
  if (chErr) return ralatJson(chErr.message, 500);
  return NextResponse.json({ data: { hunts, challenges } });
}
