import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { createAdiloProject, getAdiloSignedUrl, startAdiloUpload } from '@/lib/adilo';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/intro-boards/[boardId]/video/start
 * Body: { filename, mimeType, sizeBytes, durationSeconds? }
 * Verifies user is class owner OR enrolled member of the class that owns this board,
 * then initiates an Adilo multipart upload and returns the signed URL.
 */
export async function POST(req: NextRequest, { params }: { params: { boardId: string } }) {
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

  // Look up board + its class; ensure user is owner or member
  const { data: board } = await admin
    .from('qm_boards')
    .select('id, class_id, title, adilo_project_id')
    .eq('id', params.boardId)
    .single();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  if (!board.class_id) return NextResponse.json({ error: 'Board has no class' }, { status: 400 });

  const { data: klass } = await admin
    .from('qm_classes').select('id, name, owner_id').eq('id', board.class_id).single();
  if (!klass) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (klass.owner_id !== auth.user!.id) {
    const { data: member } = await admin
      .from('qm_class_members').select('user_id')
      .eq('class_id', board.class_id).eq('user_id', auth.user!.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // get/create Adilo project for this board
  let projectId = (board.adilo_project_id || '').trim() || null;
  if (!projectId) {
    try {
      const proj = await createAdiloProject(`Kuizen · ${klass.name} · Intro`);
      projectId = proj.id;
      await admin.from('qm_boards').update({ adilo_project_id: projectId }).eq('id', board.id);
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
