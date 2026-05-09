import { NextRequest, NextResponse } from 'next/server';
import { requireClassOwner } from '@/lib/supabase-route';
import { createAdiloProject, getAdiloSignedUrl, startAdiloUpload } from '@/lib/adilo';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Initiates an Adilo upload. Returns the signed PUT URL the browser should
 * upload to directly (bypassing our VPS bandwidth).
 *
 * Body: { columnId, filename, mimeType, sizeBytes, durationSeconds? }
 * Response: { uploadId, signedUrl, partNumber: 1, projectId }
 */
export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassOwner(req, params.classId);
  if (owner.response) return owner.response;
  const body = await req.json().catch(() => ({}));
  const { columnId, filename, mimeType, sizeBytes, durationSeconds } = body;
  if (!columnId || !filename || !mimeType || !sizeBytes) {
    return NextResponse.json({ error: 'columnId, filename, mimeType, sizeBytes required' }, { status: 400 });
  }
  if (!String(mimeType).startsWith('video/')) {
    return NextResponse.json({ error: 'Only video files allowed' }, { status: 415 });
  }

  // Ensure board exists and get/create Adilo project
  const { data: board } = await owner.supa
    .from('qm_learning_boards')
    .select('id, adilo_project_id')
    .eq('class_id', params.classId)
    .single();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

  let projectId = board.adilo_project_id;
  if (!projectId) {
    try {
      const proj = await createAdiloProject(`Cendekia · ${owner.klass!.name}`);
      projectId = proj.id;
      await owner.supa
        .from('qm_learning_boards')
        .update({ adilo_project_id: projectId })
        .eq('id', board.id);
    } catch (e: any) {
      return NextResponse.json({ error: `Adilo project create failed: ${e.message}` }, { status: 502 });
    }
  }

  try {
    const start = await startAdiloUpload({
      projectId: projectId!,
      filename,
      mimeType,
      sizeBytes,
      durationSeconds,
    });
    const signedUrl = await getAdiloSignedUrl(start.uploadId, 1);
    return NextResponse.json({
      uploadId: start.uploadId,
      key: start.key,
      signedUrl,
      partNumber: 1,
      projectId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Adilo upload start failed: ${e.message}` }, { status: 502 });
  }
}
