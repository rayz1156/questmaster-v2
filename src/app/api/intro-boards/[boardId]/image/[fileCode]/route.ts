import { NextRequest, NextResponse } from 'next/server';
import { fileluDirectLink } from '@/lib/filelu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/intro-boards/[boardId]/image/[fileCode]
 * Streams an intro-board image stored on FileLu back to the browser with sensible
 * Content-Type / Content-Disposition headers so <img src> works in place.
 * No auth required: the file_code is the secret. Knowing the URL of an
 * intro post already exposes its file_code.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { boardId: string; fileCode: string } },
) {
  const { fileCode } = params;
  if (!fileCode) return NextResponse.json({ error: 'fileCode required' }, { status: 400 });

  let direct;
  try { direct = await fileluDirectLink(fileCode); } catch { direct = null; }
  if (!direct?.url) return NextResponse.json({ error: 'Could not resolve file' }, { status: 502 });

  const upstream = await fetch(direct.url, { cache: 'no-store' });
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 });

  const url = new URL(direct.url);
  const pathname = decodeURIComponent(url.pathname);
  const ext = (pathname.split('.').pop() || '').toLowerCase();
  const extMime: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml',
  };
  const upstreamType = upstream.headers.get('content-type') || '';
  const contentType = extMime[ext] || (upstreamType.startsWith('image/') ? upstreamType : 'image/jpeg');
  const filename = pathname.split('/').pop() || 'image';

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  const len = upstream.headers.get('content-length');
  if (len) headers.set('Content-Length', len);
  headers.set('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
  headers.set('Cache-Control', 'private, max-age=300');

  return new NextResponse(upstream.body, { status: 200, headers });
}
