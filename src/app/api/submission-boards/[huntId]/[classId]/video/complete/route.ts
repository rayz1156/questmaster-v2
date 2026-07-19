import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { getBunnyVideo } from '@/lib/bunny';

export const dynamic = 'force-dynamic';

/**
 * Finalizes a Bunny submission-board upload (educator/class-owner only).
 * Body: { videoGuid, durationSeconds? }
 * Response: { videoProvider: 'bunny', videoProviderId, videoThumbnailUrl, videoDurationSeconds }
 * The client passes these straight into POST /items.
 */
export async function POST(req: NextRequest, { params }: { params: { huntId: string; classId: string } }) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  if (auth.klass!.owner_id !== auth.user!.id) {
    return NextResponse.json({ error: 'Video upload requires educator permission.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const videoGuid = String(body?.videoGuid || '').trim();
  if (!videoGuid) {
    return NextResponse.json({ error: 'videoGuid required' }, { status: 400 });
  }

  let thumbnailUrl: string | null = null;
  let realDuration: number | null = null;
  try {
    const info = await getBunnyVideo(videoGuid);
    thumbnailUrl = info.thumbnailUrl ?? null;
    if (typeof info.durationSeconds === 'number' && info.durationSeconds > 0) realDuration = info.durationSeconds;
  } catch { /* still processing */ }

  return NextResponse.json({
    videoProvider: 'bunny',
    videoProviderId: videoGuid,
    videoThumbnailUrl: thumbnailUrl,
    videoDurationSeconds: realDuration ?? (typeof body?.durationSeconds === 'number' ? body.durationSeconds : null),
  });
}
