import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { buildAdiloEmbedUrl, getAdiloFile } from '@/lib/adilo';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/learning-boards/[classId]/embed/[fileId]
 *   -> { embedUrl, thumbnailUrl?, durationSeconds? }
 * Caller verifies class membership; we never reveal Adilo credentials.
 * The embedUrl is rendered inside our own iframe — students never see this URL.
 */
export async function GET(req: NextRequest, { params }: { params: { classId: string; fileId: string } }) {
  const access = await requireClassMember(req, params.classId);
  if (access.response) return access.response;
  // Confirm this fileId actually belongs to this class's board (don't allow
  // a member of class A to fetch embed URLs for class B's videos).
  const { data: card } = await access.supa
    .from('qm_learning_cards')
    .select('id, adilo_file_id, video_thumbnail_url, video_duration_seconds, board_id, qm_learning_boards!inner(class_id)')
    .eq('adilo_file_id', params.fileId)
    .maybeSingle();
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Try to enrich with latest Adilo info (status / fresh thumbnail) but don't fail if Adilo is slow.
  let info: { thumbnailUrl?: string; durationSeconds?: number; embedUrl?: string } = {};
  try {
    info = await getAdiloFile(params.fileId);
  } catch { /* ignore */ }

  return NextResponse.json({
    embedUrl: info.embedUrl || buildAdiloEmbedUrl(params.fileId),
    thumbnailUrl: info.thumbnailUrl || card.video_thumbnail_url,
    durationSeconds: info.durationSeconds || card.video_duration_seconds,
  });
}
