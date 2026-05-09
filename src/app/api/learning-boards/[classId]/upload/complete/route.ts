import { NextRequest, NextResponse } from 'next/server';
import { requireClassOwner } from '@/lib/supabase-route';
import { completeAdiloUpload, getAdiloFile } from '@/lib/adilo';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Completes an Adilo upload + creates the video learning_card row.
 * Body: { columnId, uploadId, eTag, projectId, filename, mimeType, sizeBytes,
 *         durationSeconds?, title?, description? }
 */
export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassOwner(params.classId);
  if (owner.response) return owner.response;
  const body = await req.json().catch(() => ({}));
  const { columnId, uploadId, eTag, projectId, filename, mimeType, sizeBytes, durationSeconds, title, description } = body;
  if (!columnId || !uploadId || !eTag || !projectId || !filename || !mimeType || !sizeBytes) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  let fileId: string;
  let thumbnailUrl: string | undefined;
  let realDuration: number | undefined;
  try {
    const completed = await completeAdiloUpload({
      uploadId,
      parts: [{ ETag: eTag, PartNumber: 1 }],
      projectId,
      filename,
      mimeType,
      sizeBytes,
      durationSeconds,
    });
    fileId = completed.fileId;
    thumbnailUrl = completed.thumbnailUrl;
    realDuration = completed.durationSeconds;
    if (!thumbnailUrl) {
      try {
        const info = await getAdiloFile(fileId);
        thumbnailUrl = info.thumbnailUrl;
        realDuration = realDuration ?? info.durationSeconds;
      } catch { /* ignore - thumbnail may take time to generate */ }
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Adilo complete failed: ${e.message}` }, { status: 502 });
  }

  const { data: col } = await owner.supa
    .from('qm_learning_columns')
    .select('id, board_id')
    .eq('id', columnId)
    .single();
  if (!col) return NextResponse.json({ error: 'Column not found' }, { status: 404 });

  const { data: maxRow } = await owner.supa
    .from('qm_learning_cards')
    .select('position')
    .eq('column_id', columnId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (maxRow?.position ?? -1) + 1;

  const { data, error } = await owner.supa
    .from('qm_learning_cards')
    .insert({
      column_id: columnId,
      board_id: col.board_id,
      position: nextPos,
      card_type: 'video',
      title: typeof title === 'string' && title ? title : filename,
      description: typeof description === 'string' ? description : null,
      adilo_file_id: fileId,
      adilo_project_id: projectId,
      video_thumbnail_url: thumbnailUrl ?? null,
      video_duration_seconds: realDuration ?? durationSeconds ?? null,
      created_by: owner.user!.id,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
