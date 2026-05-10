import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { completeAdiloUpload, getAdiloFile } from '@/lib/adilo';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/profile/intro/video/complete
 * Body: { uploadId, key, eTag, projectId, filename, mimeType, sizeBytes, durationSeconds? }
 * Finalizes the Adilo multipart upload and persists profile intro video fields.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const { uploadId, key, eTag, projectId, filename, mimeType, sizeBytes, durationSeconds } = body || {};
  if (!uploadId || !key || !eTag || !projectId || !filename || !mimeType || !sizeBytes) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  let fileId = '';
  let thumbnailUrl: string | undefined;
  let realDuration: number | undefined;
  try {
    const completed = await completeAdiloUpload({
      uploadId, key, parts: [{ PartNumber: 1, ETag: eTag }],
      projectId, filename, mimeType, sizeBytes, durationSeconds,
    });
    fileId = completed.fileId;
    thumbnailUrl = completed.thumbnailUrl;
    realDuration = completed.durationSeconds;
    if (!thumbnailUrl) {
      try {
        const info = await getAdiloFile(fileId);
        thumbnailUrl = info.thumbnailUrl;
        realDuration = realDuration ?? info.durationSeconds;
      } catch { /* ignore */ }
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Adilo complete failed: ${e.message}` }, { status: 502 });
  }

  const { error } = await admin.from('qm_profiles').update({
    intro_media_type: 'video',
    intro_image_file_code: null,
    intro_image_path: null,
    intro_video_adilo_file_id: fileId,
    intro_video_adilo_project_id: projectId,
    intro_video_thumbnail_url: thumbnailUrl ?? null,
    intro_video_duration_seconds: realDuration ?? durationSeconds ?? null,
    intro_media_updated_at: new Date().toISOString(),
  }).eq('id', auth.user!.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, fileId, thumbnailUrl, durationSeconds: realDuration ?? durationSeconds ?? null });
}
