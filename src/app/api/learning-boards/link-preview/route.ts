import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * GET /api/learning-boards/link-preview?url=...
 * Server-side OG metadata fetcher for the link card preview thumbnail.
 * Auth-protected to prevent abuse.
 */
function pick(html: string, attr: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m1 = html.match(re);
  if (m1) return m1[1];
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`, 'i');
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

/**
 * Nyahkod entiti HTML dalam metadata yang diekstrak.
 *
 * Ini punca sebenar kad bertajuk "Sains &amp; Teknologi". og:title dan
 * <title> datang sebagai HTML mentah, jadi "&amp;" tiba secara literal dan
 * disimpan begitu oleh laluan penulisan kad. Pembetulan dibuat di sini, pada
 * titik pengekstrakan. Laluan penulisan kad sengaja menyimpan teks mentah dan
 * tidak diubah.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
};

function decodeEntities(input: string | null): string | null {
  if (!input) return input;
  // Satu laluan sahaja. Dua laluan berasingan akan menyahkod "&amp;lt;"
  // menjadi "<", iaitu menghidupkan semula markup yang sengaja dilepaskan.
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try { return String.fromCodePoint(code); } catch { return match; }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) {
      return NextResponse.json({ error: 'Bad protocol' }, { status: 400 });
    }
    const res = await fetch(url, {
      headers: { 'User-Agent': 'KuizenBot/1.0 (+https://kuizen.fun)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ error: `Fetch failed ${res.status}` }, { status: 502 });
    const html = (await res.text()).slice(0, 200_000); // cap
    const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const data = {
      url,
      title: decodeEntities(pick(html, 'property', 'og:title') || pick(html, 'name', 'twitter:title') || (titleM ? titleM[1].trim() : null)),
      description: decodeEntities(pick(html, 'property', 'og:description') || pick(html, 'name', 'twitter:description') || pick(html, 'name', 'description')),
      image: decodeEntities(pick(html, 'property', 'og:image') || pick(html, 'name', 'twitter:image')),
      siteName: decodeEntities(pick(html, 'property', 'og:site_name') || u.hostname.replace(/^www\./, '')) ?? u.hostname,
      favicon: `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`,
    };
    // Resolve relative og:image to absolute
    if (data.image && !/^https?:\/\//i.test(data.image)) {
      try { data.image = new URL(data.image, u).toString(); } catch { /* ignore */ }
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'preview failed' }, { status: 500 });
  }
}
