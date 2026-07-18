import { NextRequest, NextResponse } from 'next/server';
import { fileluDirectLink } from '@/lib/filelu';
import { s5PresignGet } from '@/lib/s5';

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

  // S5-stored files: fileCode is "s5__" + base64url(key). Serve via presigned GET.
  if (fileCode.startsWith('s5__')) {
    try {
      const key = Buffer.from(fileCode.slice(4).replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8');
      const signed = await s5PresignGet(key, 3600);
      const up = await fetch(signed, { cache: 'no-store' });
      if (!up.ok || !up.body) return NextResponse.json({ error: `Upstream ${up.status}` }, { status: 502 });
      const extM: Record<string,string> = { pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml', mp4:'video/mp4', webm:'video/webm', mp3:'audio/mpeg', txt:'text/plain; charset=utf-8', csv:'text/csv; charset=utf-8', json:'application/json' };
      const kext = (key.split('.').pop() || '').toLowerCase();
      const upct = up.headers.get('content-type') || '';
      const ct = (upct && !upct.startsWith('application/octet-stream') ? upct : (extM[kext] || upct || 'application/octet-stream'));
      const fname = decodeURIComponent(key.split('/').pop() || 'file');
      const inlineT = ['application/pdf','text/plain','text/csv','application/json'];
      const isInline = ct.startsWith('image/') || ct.startsWith('video/') || ct.startsWith('audio/') || inlineT.some((t)=>ct.startsWith(t));
      const h = new Headers();
      h.set('Content-Type', ct);
      const len = up.headers.get('content-length'); if (len) h.set('Content-Length', len);
      h.set('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="${fname.replace(/"/g,'')}"`);
      h.set('Cache-Control', 'private, max-age=120');
      return new NextResponse(up.body, { status: 200, headers: h });
    } catch (e) {
      return NextResponse.json({ error: 'Could not resolve file' }, { status: 502 });
    }
  }

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
