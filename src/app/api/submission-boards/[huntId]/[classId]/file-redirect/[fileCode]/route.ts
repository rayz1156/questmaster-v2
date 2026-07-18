import { NextRequest, NextResponse } from 'next/server';
import { fileluDirectLink } from '@/lib/filelu';
import { s5PresignGet } from '@/lib/s5';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/learning-boards/[classId]/file-redirect/[fileCode]
 *
 * Resolves a FileLu direct URL and proxies the bytes back to the browser
 * with sensible Content-Type / Content-Disposition headers so previewable
 * files (PDF, images, video) render inline instead of triggering a download.
 *
 * No auth required: the file_code is the secret. Knowing the URL of a
 * learning-board card already exposes its file_code.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { huntId: string; classId: string; fileCode: string } },
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
  try {
    direct = await fileluDirectLink(fileCode);
  } catch {
    direct = null;
  }
  if (!direct?.url) {
    return NextResponse.json({ error: 'Could not resolve file' }, { status: 502 });
  }

  const upstream = await fetch(direct.url, { cache: 'no-store' });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
  }

  // Derive a sensible Content-Type from the URL extension if upstream gives us
  // application/octet-stream (FileLu's default for many files).
  const url = new URL(direct.url);
  const pathname = decodeURIComponent(url.pathname);
  const ext = (pathname.split('.').pop() || '').toLowerCase();
  const extMime: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    txt: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    json: 'application/json',
  };
  const upstreamType = upstream.headers.get('content-type') || '';
  const contentType =
    extMime[ext] ||
    (upstreamType && !upstreamType.startsWith('application/octet-stream') ? upstreamType : 'application/octet-stream');

  // Files we render inline in the browser; everything else downloads.
  const inlineTypes = ['application/pdf', 'text/plain', 'text/csv', 'application/json'];
  const inline = contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/') || inlineTypes.some((t) => contentType.startsWith(t));
  const filename = pathname.split('/').pop() || 'file';

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  const upstreamLength = upstream.headers.get('content-length');
  if (upstreamLength) headers.set('Content-Length', upstreamLength);
  headers.set(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`,
  );
  headers.set('Cache-Control', 'private, max-age=120');

  return new NextResponse(upstream.body, { status: 200, headers });
}
