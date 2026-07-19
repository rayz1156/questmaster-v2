/**
 * Client-safe video helpers shared by all boards.
 * Providers: 'bunny' (Bunny Stream), 'youtube', 'adilo' (legacy).
 * Only NEXT_PUBLIC_* env is referenced, so this file is safe to import
 * from 'use client' components as well as from server routes.
 */

export type VideoProvider = 'bunny' | 'youtube' | 'adilo';

/** Extract the 11-char YouTube video id from any common URL shape. */
export function parseYouTubeId(input: string): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch { /* not a URL */ }
  // Accept a pasted <iframe ... src="...ID..."> embed snippet: pull the src and re-parse.
  const srcMatch = raw.match(/src\s*=\s*["']([^"']+)["']/i);
  if (srcMatch) {
    const inner = srcMatch[1];
    try {
      const u = new URL(inner, 'https://youtube.com');
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
      const v = u.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    } catch { /* ignore */ }
  }
  // Last resort: a bare 11-char id embedded anywhere in a youtube-ish string.
  const loose = raw.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|watch\?v=))([A-Za-z0-9_-]{11})/);
  if (loose) return loose[1];
  return null;
}

export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Build the iframe src for a stored (provider, id) pair. */
export function buildVideoEmbedUrl(provider: VideoProvider, id: string): string {
  if (provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${id}`;
  if (provider === 'bunny') {
    const lib = process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID || '';
    return `https://iframe.mediadelivery.net/embed/${lib}/${id}`;
  }
  return `https://adilo.bigcommand.com/embed/${id}`;
}
