import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { completeAdiloUpload, fetchAdiloWatchThumbnail, getAdiloFile } from '@/lib/adilo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { huntId: string; classId: string } }) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;

  const body = await req.json().catch(() => ({}));
  const { uploadId, key, projectId, parts, filename, mimeType, sizeBytes, durationSeconds } = body || {};
  if (!uploadId || !key || !projectId || !Array.isArray(parts) || !parts.length || !filename || !mimeType || !sizeBytes) {
    return NextResponse.json({ error: 'uploadId, key, projectId, parts[], filename, mimeType, sizeBytes required' }, { status: 400 });
  }

  let completed;
  try {
    completed = await completeAdiloUpload({ uploadId, key, projectId, parts, filename, mimeType, sizeBytes, durationSeconds });
  } catch (e: any) {
    return NextResponse.json({ error: `Adilo upload complete failed: ${e.message}` }, { status: 502 });
  }

  const fileId: string = completed.fileId;
  let thumbnailUrl: string | null = null;
  let realDuration: number | null = null;

  try {
    thumbnailUrl = (await fetchAdiloWatchThumbnail(fileId)) || null;
  } catch { /* Adilo still processing */ }
  try {
    const info = await getAdiloFile(fileId);
    if (typeof info?.durationSeconds === 'number') realDuration = info.durationSeconds;
    if (info?.thumbnailUrl && !thumbnailUrl) thumbnailUrl = info.thumbnailUrl;
  } catch { /* still processing */ }

  return NextResponse.json({
    adiloFileId: fileId,
    adiloProjectId: projectId,
    videoThumbnailUrl: thumbnailUrl,
    videoDurationSeconds: realDuration ?? (typeof durationSeconds === 'number' ? durationSeconds : null),
  });
}
