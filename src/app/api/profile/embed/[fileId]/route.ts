import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { buildAdiloEmbedUrl, getAdiloFile } from '@/lib/adilo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/profile/embed/[fileId]
 * -> { embedUrl, thumbnailUrl?, durationSeconds? }
 * Any authenticated user can resolve any Adilo profile video embed - the
 * fileId itself is the secret. (Knowing a profile video's URL is enough.)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  let info: { thumbnailUrl?: string; durationSeconds?: number; embedUrl?: string } = {};
  try {
    info = await getAdiloFile(params.fileId);
  } catch { /* ignore */ }
  return NextResponse.json({
    embedUrl: info.embedUrl || buildAdiloEmbedUrl(params.fileId),
    thumbnailUrl: info.thumbnailUrl || null,
    durationSeconds: info.durationSeconds || null,
  });
}
