import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { buildAdiloEmbedUrl, getAdiloFile } from '@/lib/adilo';
import { buildSignedBunnyEmbedUrl } from '@/lib/bunny';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/intro-boards/[boardId]/embed/[fileId]
 *  -> { embedUrl, thumbnailUrl?, durationSeconds? }
 * Provider-aware: fileId may be a Bunny GUID, a YouTube id, or a legacy
 * Adilo file id. The user must be a member of the class that owns the board.
 */
export async function GET(_req: NextRequest, { params }: { params: { boardId: string; fileId: string } }) {
  const auth = await requireUser(_req);
  if (auth.response) return auth.response;
  if (!/^[A-Za-z0-9_-]{5,64}$/.test(params.fileId)) {
    return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  }
  const admin = getServiceSupabase();

  const { data: post } = await admin
    .from('qm_intro_posts')
    .select('id, board_id, video_provider, video_provider_id, video_adilo_file_id, video_thumbnail_url, video_duration_seconds, qm_boards!inner(class_id)')
    .eq('board_id', params.boardId)
    .or(`video_provider_id.eq.${params.fileId},video_adilo_file_id.eq.${params.fileId}`)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const classId = (post as any)?.qm_boards?.class_id || (post as any)?.qm_boards?.[0]?.class_id;
  if (!classId) return NextResponse.json({ error: 'Board has no class' }, { status: 400 });

  const { data: klass } = await admin.from('qm_classes').select('id, owner_id').eq('id', classId).single();
  if (!klass) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (klass.owner_id !== auth.user!.id) {
    const { data: member } = await admin.from('qm_class_members').select('user_id')
      .eq('class_id', classId).eq('user_id', auth.user!.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const provider: string = (post as any).video_provider
    || ((post as any).video_adilo_file_id === params.fileId ? 'adilo' : 'bunny');

  if (provider === 'bunny') {
    return NextResponse.json({
      embedUrl: buildSignedBunnyEmbedUrl(params.fileId, 6 * 3600),
      thumbnailUrl: (post as any).video_thumbnail_url,
      durationSeconds: (post as any).video_duration_seconds,
    });
  }
  if (provider === 'youtube') {
    return NextResponse.json({
      embedUrl: `https://www.youtube.com/embed/${params.fileId}`,
      thumbnailUrl: (post as any).video_thumbnail_url,
      durationSeconds: (post as any).video_duration_seconds,
    });
  }
  // Legacy Adilo
  let info: { thumbnailUrl?: string; durationSeconds?: number; embedUrl?: string } = {};
  try { info = await getAdiloFile(params.fileId); } catch { /* ignore */ }
  return NextResponse.json({
    embedUrl: info.embedUrl || buildAdiloEmbedUrl(params.fileId),
    thumbnailUrl: info.thumbnailUrl || (post as any).video_thumbnail_url,
    durationSeconds: info.durationSeconds || (post as any).video_duration_seconds,
  });
}
