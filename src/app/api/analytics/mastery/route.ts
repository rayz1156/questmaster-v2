import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const class_id = url.searchParams.get('class_id');
    if (!class_id) return ralatJson('class_id required', 400);
    if (!UUID_RE.test(class_id)) return ralatJson('class_id must be a UUID (pick a specific class)', 400);
    const supa = getRouteSupabase(req);
    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user?.id) return ralatJson('Unauthorized', 401);
    const { data, error } = await supa.rpc('qm_mastery_summary', { p_class_id: class_id });
    if (error) {
      console.error('mastery rpc failed', error);
      return ralatJson(error.message, 500);
    }
    return NextResponse.json({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return ralatJson(msg, 500);
  }
}
