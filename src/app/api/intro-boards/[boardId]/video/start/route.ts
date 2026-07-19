import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { createBunnyCollection, createBunnyVideo, getBunnyTusUpload } from '@/lib/bunny';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/intro-boards/[boardId]/video/start
 * Body: { filename, mimeType, sizeBytes, durationSeconds? }
 * Direct video upload is EDUCATOR-ONLY (class owner). Participants share a
 * YouTube link instead (handled by video/complete with provider='youtube').
 * Returns presigned Bunny TUS auth so the browser uploads straight to Bunny.
 */
export async function POST(req: NextRequest, { params }: { params: { boardId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const { filename, mimeType, sizeBytes } = body || {};
  if (!filename || !mimeType || !sizeBytes) {
    return NextResponse.json({ error: 'filename, mimeType, sizeBytes required' }, { status: 400 });
  }
  if (!String(mimeType).startsWith('video/')) {
    return NextResponse.json({ error: 'Only video files allowed' }, { status: 415 });
  }

  const { data: board } = await admin
    .from('qm_boards')
    .select('id, class_id, title, bunny_collection_id')
    .eq('id', params.boardId)
    .single();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  if (!board.class_id) return NextResponse.json({ error: 'Board has no class' }, { status: 400 });

  const { data: klass } = await admin
    .from('qm_classes').select('id, name, owner_id').eq('id', board.class_id).single();
  if (!klass) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (klass.owner_id !== auth.user!.id) {
    return NextResponse.json(
      { error: 'Video upload requires educator permission. Please share a YouTube link instead.' },
      { status: 403 },
    );
  }

  // get/create a Bunny collection for this board (mirrors the old adilo_project_id)
  let collectionId = (board.bunny_collection_id || '').trim() || null;
  if (!collectionId) {
    try {
      const col = await createBunnyCollection(`Kuizen · ${klass.name} · Intro`);
      collectionId = col.id;
      await admin.from('qm_boards').update({ bunny_collection_id: collectionId }).eq('id', board.id);
    } catch (e: any) {
      return NextResponse.json({ error: `Bunny collection create failed: ${e.message}` }, { status: 502 });
    }
  }

  try {
    const { guid } = await createBunnyVideo({ title: String(filename), collectionId });
    const tus = getBunnyTusUpload(guid);
    return NextResponse.json({ provider: 'bunny', videoGuid: guid, tus });
  } catch (e: any) {
    return NextResponse.json({ error: `Bunny upload start failed: ${e.message}` }, { status: 502 });
  }
}
