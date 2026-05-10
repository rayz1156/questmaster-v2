import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { buildAdiloEmbedUrl, getAdiloFile } from '@/lib/adilo';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/intro-boards/[boardId]/embed/[fileId]
 *  -> { embedUrl, thumbnailUrl?, durationSeconds? }
 * The user must be a member of the class that owns this board.
 */
export async function GET(_req: NextRequest, { params }: { params: { boardId: string; fileId: string } }) {
  const auth = await requireUser(_req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();

  const { data: post } = await admin
    .from('qm_intro_posts')
    .select('id, board_id, video_adilo_file_id, video_thumbnail_url, video_duration_seconds, qm_boards!inner(class_id)')
    .eq('board_id', params.boardId)
    .eq('video_adilo_file_id', params.fileId)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const classId = (post as any)?.qm_boards?.class_id || (post as any)?.qm_boards?.[0]?.class_id;
  if (!classId) return NextResponse.json({ error: 'Board has no class' }, { status: 400 });

  // Verify user is class owner OR member
  const { data: klass } = await admin.from('qm_classes').select('id, owner_id').eq('id', classId).single();
  if (!klass) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (klass.owner_id !== auth.user!.id) {
    const { data: member } = await admin.from('qm_class_members').select('user_id')
      .eq('class_id', classId).eq('user_id', auth.user!.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let info: { thumbnailUrl?: string; durationSeconds?: number; embedUrl?: string } = {};
  try {
    info = await getAdiloFile(params.fileId);
  } catch { /* ignore */ }
  return NextResponse.json({
    embedUrl: info.embedUrl || buildAdiloEmbedUrl(params.fileId),
    thumbnailUrl: info.thumbnailUrl || (post as any).video_thumbnail_url,
    durationSeconds: info.durationSeconds || (post as any).video_duration_seconds,
  });
}
