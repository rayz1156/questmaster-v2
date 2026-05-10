import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { createAdiloProject, getAdiloSignedUrl, startAdiloUpload } from '@/lib/adilo';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/profile/intro/video/start
 * Body: { filename, mimeType, sizeBytes, durationSeconds? }
 * Starts an Adilo multipart upload scoped to the user's profile intro video.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const { filename, mimeType, sizeBytes, durationSeconds } = body || {};
  if (!filename || !mimeType || !sizeBytes) {
    return NextResponse.json({ error: 'filename, mimeType, sizeBytes required' }, { status: 400 });
  }
  if (!String(mimeType).startsWith('video/')) {
    return NextResponse.json({ error: 'Only video files allowed' }, { status: 415 });
  }

  // Get/create a per-user Adilo project for their profile intro video.
  const { data: prof } = await admin
    .from('qm_profiles')
    .select('id, display_name, intro_video_adilo_project_id')
    .eq('id', auth.user!.id)
    .single();
  let projectId: string | null = (prof?.intro_video_adilo_project_id || '').trim() || null;
  if (!projectId) {
    try {
      const proj = await createAdiloProject(`Cendekia · ${prof?.display_name || auth.user!.email || auth.user!.id} · Profile Intro`);
      projectId = proj.id;
      await admin.from('qm_profiles').update({ intro_video_adilo_project_id: projectId }).eq('id', auth.user!.id);
    } catch (e: any) {
      return NextResponse.json({ error: `Adilo project create failed: ${e.message}` }, { status: 502 });
    }
  }

  try {
    const start = await startAdiloUpload({ projectId: projectId!, filename, mimeType, sizeBytes, durationSeconds });
    const signedUrl = await getAdiloSignedUrl(start.uploadId, start.key, 1);
    return NextResponse.json({ uploadId: start.uploadId, key: start.key, signedUrl, partNumber: 1, projectId });
  } catch (e: any) {
    return NextResponse.json({ error: `Adilo upload start failed: ${e.message}` }, { status: 502 });
  }
}
