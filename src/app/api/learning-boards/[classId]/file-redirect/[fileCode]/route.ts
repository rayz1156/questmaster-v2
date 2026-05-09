import { NextRequest, NextResponse } from 'next/server';
import { fileluDirectLink } from '@/lib/filelu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/learning-boards/[classId]/file-redirect/[fileCode]
 *
 * Resolves a FileLu direct download URL and 302-redirects the browser to it.
 * This is called by <img src> for image cards persisted to FileLu.
 *
 * No auth required: the file_code itself is the secret. Knowing the URL of
 * a learning-board card already exposes its file_code; redirecting to FileLu
 * is no more permissive than that.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { classId: string; fileCode: string } },
) {
  const { fileCode } = params;
  if (!fileCode) return NextResponse.json({ error: 'fileCode required' }, { status: 400 });

  let direct;
  try {
    direct = await fileluDirectLink(fileCode);
  } catch {
    direct = null;
  }
  if (!direct?.url) {
    return NextResponse.json({ error: 'Could not resolve file' }, { status: 502 });
  }

  // 302 redirect with short cache so subsequent loads can be reused for a few minutes.
  return NextResponse.redirect(direct.url, {
    status: 302,
    headers: { 'cache-control': 'private, max-age=120' },
  });
}
