import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { buildAdiloEmbedUrl, getAdiloFile } from '@/lib/adilo';
import { buildSignedBunnyEmbedUrl } from '@/lib/bunny';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/learning-boards/[classId]/embed/[fileId]
 *   -> { embedUrl, thumbnailUrl?, durationSeconds? }
 * Provider-aware (bunny / youtube / legacy adilo). Caller must be a class
 * member; the embedUrl is rendered inside our own iframe only.
 */
export async function GET(req: NextRequest, { params }: { params: { classId: string; fileId: string } }) {
  const access = await requireClassMember(req, params.classId);
  if (access.response) return access.response;
  if (!/^[A-Za-z0-9_-]{5,64}$/.test(params.fileId)) {
    return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  }
  const { data: card } = await access.supa
    .from('qm_learning_cards')
    .select('id, video_provider, video_provider_id, adilo_file_id, video_thumbnail_url, video_duration_seconds, board_id, qm_learning_boards!inner(class_id)')
    .or(`video_provider_id.eq.${params.fileId},adilo_file_id.eq.${params.fileId}`)
    .maybeSingle();
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const provider: string = (card as any).video_provider
    || ((card as any).adilo_file_id === params.fileId ? 'adilo' : 'bunny');

  if (provider === 'bunny') {
    return NextResponse.json({
      embedUrl: buildSignedBunnyEmbedUrl(params.fileId, 6 * 3600),
      thumbnailUrl: card.video_thumbnail_url,
      durationSeconds: card.video_duration_seconds,
    });
  }
  if (provider === 'youtube') {
    return NextResponse.json({
      embedUrl: `https://www.youtube.com/embed/${params.fileId}`,
      thumbnailUrl: card.video_thumbnail_url,
      durationSeconds: card.video_duration_seconds,
    });
  }
  let info: { thumbnailUrl?: string; durationSeconds?: number; embedUrl?: string } = {};
  try { info = await getAdiloFile(params.fileId); } catch { /* ignore */ }
  return NextResponse.json({
    embedUrl: info.embedUrl || buildAdiloEmbedUrl(params.fileId),
    thumbnailUrl: info.thumbnailUrl || card.video_thumbnail_url,
    durationSeconds: info.durationSeconds || card.video_duration_seconds,
  });
}
