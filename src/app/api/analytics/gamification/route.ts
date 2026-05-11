import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const class_id = url.searchParams.get('class_id');
    if (!class_id) return NextResponse.json({ error: 'class_id required' }, { status: 400 });
    if (!UUID_RE.test(class_id)) return NextResponse.json({ error: 'class_id must be a UUID (pick a specific class)' }, { status: 400 });

    const supa = getRouteSupabase(req);
    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supa.rpc('qm_gamification_summary', { p_class_id: class_id });
    if (error) {
      console.error('gamification rpc failed', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
