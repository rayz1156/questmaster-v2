import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { getBunnyVideo } from '@/lib/bunny';
import { parseYouTubeId, youtubeThumbnail } from '@/lib/video-embed';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/intro-boards/[boardId]/video/complete
 * Two modes:
 *  - provider='bunny'  : { videoGuid, filename?, durationSeconds?, displayName, description? }
 *                        (educator/class-owner only; finalizes a TUS upload)
 *  - provider='youtube': { youtubeUrl, displayName, description? }
 *                        (any class member; stores the YouTube video id)
 * Upserts the qm_intro_posts row (one per board+author) with media_type='video'.
 */
export async function POST(req: NextRequest, { params }: { params: { boardId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const provider = body?.provider === 'youtube' ? 'youtube' : 'bunny';
  const { displayName, description } = body || {};
  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    return NextResponse.json({ error: 'displayName required' }, { status: 400 });
  }

  // Verify board + class membership
  const { data: board } = await admin
    .from('qm_boards').select('id, class_id').eq('id', params.boardId).single();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  const { data: klass } = await admin
    .from('qm_classes').select('id, owner_id').eq('id', board.class_id).single();
  if (!klass) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  const isOwner = klass.owner_id === auth.user!.id;
  if (!isOwner) {
    const { data: member } = await admin
      .from('qm_class_members').select('user_id')
      .eq('class_id', board.class_id).eq('user_id', auth.user!.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let providerId: string;
  let thumbnailUrl: string | null = null;
  let realDuration: number | null = null;

  if (provider === 'youtube') {
    const ytId = parseYouTubeId(String(body?.youtubeUrl || ''));
    if (!ytId) return NextResponse.json({ error: 'Please provide a valid YouTube link' }, { status: 400 });
    providerId = ytId;
    thumbnailUrl = youtubeThumbnail(ytId);
  } else {
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Video upload requires educator permission. Please share a YouTube link instead.' },
        { status: 403 },
      );
    }
    const videoGuid = String(body?.videoGuid || '').trim();
    if (!videoGuid) return NextResponse.json({ error: 'videoGuid required' }, { status: 400 });
    providerId = videoGuid;
    try {
      const info = await getBunnyVideo(videoGuid);
      thumbnailUrl = info.thumbnailUrl ?? null;
      realDuration = typeof info.durationSeconds === 'number' && info.durationSeconds > 0 ? info.durationSeconds : null;
    } catch { /* Bunny may still be processing; keep nulls */ }
  }

  const clientDuration = typeof body?.durationSeconds === 'number' ? body.durationSeconds : null;
  const row: any = {
    board_id: params.boardId,
    author_id: auth.user!.id,
    display_name: displayName.trim(),
    description: typeof description === 'string' && description.trim() ? description.trim() : null,
    media_type: 'video',
    image_url: null,
    image_path: null,
    video_provider: provider,
    video_provider_id: providerId,
    video_adilo_file_id: null,
    video_adilo_project_id: null,
    video_thumbnail_url: thumbnailUrl,
    video_duration_seconds: realDuration ?? clientDuration,
  };

  const { data, error } = await admin
    .from('qm_intro_posts')
    .upsert(row, { onConflict: 'board_id,author_id' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}
