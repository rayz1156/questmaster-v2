import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();
  const { error } = await admin.from('qm_profiles').update({
    intro_media_type: null,
    intro_image_file_code: null,
    intro_image_path: null,
    intro_video_adilo_file_id: null,
    intro_video_adilo_project_id: null,
    intro_video_thumbnail_url: null,
    intro_video_duration_seconds: null,
    intro_media_updated_at: new Date().toISOString(),
  }).eq('id', auth.user!.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
