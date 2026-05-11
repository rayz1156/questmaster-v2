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
      headers: { 'User-Agent': 'KuizenBot/1.0 (+https://kuizen.veltrix.technology)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ error: `Fetch failed ${res.status}` }, { status: 502 });
    const html = (await res.text()).slice(0, 200_000); // cap
    const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const data = {
      url,
      title: pick(html, 'property', 'og:title') || pick(html, 'name', 'twitter:title') || (titleM ? titleM[1].trim() : null),
      description: pick(html, 'property', 'og:description') || pick(html, 'name', 'twitter:description') || pick(html, 'name', 'description'),
      image: pick(html, 'property', 'og:image') || pick(html, 'name', 'twitter:image'),
      siteName: pick(html, 'property', 'og:site_name') || u.hostname.replace(/^www\./, ''),
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
