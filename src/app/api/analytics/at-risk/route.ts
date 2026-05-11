import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const class_id = url.searchParams.get('class_id');
    if (!class_id) return NextResponse.json({ error: 'class_id required' }, { status: 400 });

    const supa = getRouteSupabase(req);
    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supa.rpc('qm_at_risk_summary', { p_class_id: class_id });
    if (error) {
      console.error('at-risk rpc failed', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
