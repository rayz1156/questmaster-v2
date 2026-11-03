import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const class_id = url.searchParams.get('class_id');

    const supa = getRouteSupabase(req);
    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user) {
      return ralatJson('Not authenticated', 401);
    }

    // Call the SQL helper function (defined in the migration) which enforces
    // class ownership/co-educator membership via RLS.
    const { data, error } = await supa.rpc('qm_engagement_summary', {
      p_class_id: class_id,
    });
    if (error) {
      console.error('engagement rpc failed', error);
      return ralatJson(error.message, 500);
    }
    return NextResponse.json({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return ralatJson(msg, 500);
  }
}
