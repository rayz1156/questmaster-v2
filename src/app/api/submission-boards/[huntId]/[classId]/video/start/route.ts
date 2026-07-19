import { NextRequest, NextResponse } from 'next/server';
import { assertCapability } from '@/lib/capabilities';
import { requireClassMember } from '@/lib/supabase-route';
import { createBunnyCollection, createBunnyVideo, getBunnyTusUpload } from '@/lib/bunny';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Initiates a Bunny Stream upload for a submission-board video.
 * Direct upload is EDUCATOR-ONLY (class owner); students submit a Link
 * item with a YouTube URL instead.
 * Body: { filename, mimeType, sizeBytes, durationSeconds? }
 * Response: { provider: 'bunny', videoGuid, tus }
 */
export async function POST(req: NextRequest, { params }: { params: { huntId: string; classId: string } }) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  if (owner.klass!.owner_id !== owner.user!.id) {
    return NextResponse.json(
      { error: 'Video upload requires educator permission. Please submit a YouTube link instead.' },
      { status: 403 },
    );
  }

  const cap = await assertCapability(owner.supa, owner.user!.id, 'videos');
  if (!cap.ok) return NextResponse.json({ error: cap.message }, { status: cap.status });
  const body = await req.json().catch(() => ({}));
  const { filename, mimeType, sizeBytes } = body;
  if (!filename || !mimeType || !sizeBytes) {
    return NextResponse.json({ error: 'filename, mimeType, sizeBytes required' }, { status: 400 });
  }
  if (!String(mimeType).startsWith('video/')) {
    return NextResponse.json({ error: 'Only video files allowed' }, { status: 415 });
  }

  const { data: board } = await owner.supa
    .from('qm_submission_boards').select('id, bunny_collection_id').eq('activity_id', params.huntId).eq('class_id', params.classId).single();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

  let collectionId = (board.bunny_collection_id || '').trim() || null;
  if (!collectionId) {
    try {
      const col = await createBunnyCollection(`Kuizen · ${owner.klass!.name}`);
      collectionId = col.id;
      await owner.supa
        .from('qm_submission_boards').update({ bunny_collection_id: collectionId }).eq('id', board.id);
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
