import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { completeAdiloUpload, getAdiloFile } from '@/lib/adilo';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/intro-boards/[boardId]/video/complete
 * Body: { uploadId, key, eTag, projectId, filename, mimeType, sizeBytes, durationSeconds?,
 *         displayName, description? }
 * Finalizes the Adilo multipart upload and upserts the qm_intro_posts row
 * (one per board+author) with media_type='video'.
 */
export async function POST(req: NextRequest, { params }: { params: { boardId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const {
    uploadId, key, eTag, projectId, filename, mimeType, sizeBytes, durationSeconds,
    displayName, description,
  } = body || {};
  if (!uploadId || !key || !eTag || !projectId || !filename || !mimeType || !sizeBytes) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    return NextResponse.json({ error: 'displayName required' }, { status: 400 });
  }

  // Verify board + class membership again
  const { data: board } = await admin
    .from('qm_boards').select('id, class_id').eq('id', params.boardId).single();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  const { data: klass } = await admin
    .from('qm_classes').select('id, owner_id').eq('id', board.class_id).single();
  if (!klass) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (klass.owner_id !== auth.user!.id) {
    const { data: member } = await admin
      .from('qm_class_members').select('user_id')
      .eq('class_id', board.class_id).eq('user_id', auth.user!.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let fileId: string;
  let thumbnailUrl: string | undefined;
  let realDuration: number | undefined;
  try {
    const completed = await completeAdiloUpload({
      uploadId, key,
      parts: [{ ETag: eTag, PartNumber: 1 }],
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
      } catch {/* ignore */}
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Adilo complete failed: ${e.message}` }, { status: 502 });
  }

  // If user already had a previous intro post with image, clear those fields too
  const row: any = {
    board_id: params.boardId,
    author_id: auth.user!.id,
    display_name: displayName.trim(),
    description: typeof description === 'string' && description.trim() ? description.trim() : null,
    media_type: 'video',
    image_url: null,
    image_path: null,
    video_adilo_file_id: fileId,
    video_adilo_project_id: projectId,
    video_thumbnail_url: thumbnailUrl ?? null,
    video_duration_seconds: realDuration ?? durationSeconds ?? null,
  };

  const { data, error } = await admin
    .from('qm_intro_posts')
    .upsert(row, { onConflict: 'board_id,author_id' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}
