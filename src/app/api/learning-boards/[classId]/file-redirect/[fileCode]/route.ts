import { NextRequest, NextResponse } from 'next/server';
import { fileluDirectLink } from '@/lib/filelu';
import { s5PresignGet } from '@/lib/s5';
import { pengepalaSajian, normMime } from '@/lib/sajianSelamat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * KZ-017 R2-1 (pembetulan kzsec pusingan 2, penemuan 1): senarai sekat
 * MIMES_BOLEH_SKRIP yang lama adalah case-sensitive, sedangkan jenis MIME
 * tidak sensitif huruf mengikut RFC 2045/7231, jadi "image/SVG+XML" boleh
 * lintas senarai sekat dan disajikan inline (stored XSS pada origin).
 * Digantikan dengan SENARAI BENARKAN dalam src/lib/sajianSelamat.ts: inline
 * HANYA untuk senarai selamat (png/jpeg/gif/webp/pdf, video/*, audio/*); semua
 * jenis lain, termasuk yang tidak dikenali atau kosong, dipaksa attachment
 * dengan CSP sandbox. Semua keputusan dan pengepala Content-Type menggunakan
 * nilai ternormal (normMime), bukan nilai mentah huluan.
 */
function susunPengepala(h: Headers, ctMentah: string, mahuInline: boolean, fname: string): void {
  const p = pengepalaSajian(ctMentah, mahuInline);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Content-Type', p.contentType);
  h.set('Content-Disposition', `${p.disposition}; filename="${fname.replace(/"/g, '')}"`);
  if (p.csp) h.set('Content-Security-Policy', p.csp);
}

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
  { params }: { params: { classId: string; fileCode: string } },
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
      // R2-1: penormalan awal supaya semua keputusan menggunakan ctNorm.
      const upct = normMime(up.headers.get('content-type') || '');
      const ctMentah = (upct && upct !== 'application/octet-stream' ? upct : (extM[kext] || upct || 'application/octet-stream'));
      const fname = decodeURIComponent(key.split('/').pop() || 'file');
      // Pilihan inline route ini: imej/video/audio serta teks ringkas. Sajian
      // akhir tetap ditapis oleh pengepalaSajian (senarai selamat R2-1).
      const inlineT = ['application/pdf','text/plain','text/csv','application/json'];
      const isInline = ctMentah.startsWith('image/') || ctMentah.startsWith('video/') || ctMentah.startsWith('audio/') || inlineT.some((t)=>ctMentah.startsWith(t));
      const h = new Headers();
      const len = up.headers.get('content-length'); if (len) h.set('Content-Length', len);
      susunPengepala(h, ctMentah, isInline, fname);
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
  const upstreamType = normMime(upstream.headers.get('content-type') || '');
  const contentType =
    extMime[ext] ||
    (upstreamType && upstreamType !== 'application/octet-stream' ? upstreamType : 'application/octet-stream');

  // Files we render inline in the browser; everything else downloads.
  const inlineTypes = ['application/pdf', 'text/plain', 'text/csv', 'application/json'];
  const inline = contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/') || inlineTypes.some((t) => contentType.startsWith(t));
  const filename = pathname.split('/').pop() || 'file';

  const headers = new Headers();
  const upstreamLength = upstream.headers.get('content-length');
  if (upstreamLength) headers.set('Content-Length', upstreamLength);
  susunPengepala(headers, contentType, inline, filename);
  headers.set('Cache-Control', 'private, max-age=120');

  return new NextResponse(upstream.body, { status: 200, headers });
}
