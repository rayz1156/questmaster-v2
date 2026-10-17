import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getRouteSupabase } from '@/lib/supabase-route';
import { s5PresignPut, s5PublicUrl } from '@/lib/s5';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
const RESOURCE_TYPES = new Set(['application/pdf','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/markdown','application/json','application/octet-stream']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_RESOURCE_BYTES = 200 * 1024 * 1024;

function sanitize(name: string): string { return name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g,'').slice(0, 80) || 'file'; }

export async function POST(req: NextRequest) {
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userData.user.id;
  const body = await req.json().catch(() => ({})) as { kind?: string; filename?: string; contentType?: string; sizeBytes?: number; courseId?: string };
  const kind = (body.kind || '').trim();
  const filename = (body.filename || '').trim();
  const contentType = (body.contentType || 'application/octet-stream').trim();
  const sizeBytes = Number(body.sizeBytes) || 0;
  if (!kind || !filename) return NextResponse.json({ error: 'kind and filename required' }, { status: 400 });

  // Lookup creator owned by this user
  const { data: creator, error: cerr } = await supa.from('lms_creators').select('id, slug').eq('owner_id', userId).maybeSingle();
  if (cerr) return NextResponse.json({ error: cerr.message }, { status: 500 });
  if (!creator) return NextResponse.json({ error: 'No creator profile for this user. Complete onboarding first.' }, { status: 403 });

  // Determine prefix + allow-list based on kind
  let prefix = '';
  let allowed: Set<string>;
  let maxBytes = MAX_IMAGE_BYTES;
  if (kind === 'avatar') { prefix = `creators/${creator.id}/avatar`; allowed = IMAGE_TYPES; }
  else if (kind === 'cover') { prefix = `creators/${creator.id}/covers`; allowed = IMAGE_TYPES; }
  else if (kind === 'resource') { prefix = `creators/${creator.id}/resources`; allowed = RESOURCE_TYPES; maxBytes = MAX_RESOURCE_BYTES; }
  else return NextResponse.json({ error: `Unknown kind: ${kind}` }, { status: 400 });

  if (!allowed.has(contentType)) return NextResponse.json({ error: `Content type not allowed: ${contentType}` }, { status: 415 });
  if (sizeBytes > maxBytes) return NextResponse.json({ error: `File too large (max ${Math.floor(maxBytes / 1024 / 1024)} MB)` }, { status: 413 });

  const safeName = sanitize(filename);
  const key = `${prefix}/${randomUUID()}-${safeName}`;
  try {
    const uploadUrl = await s5PresignPut(key, contentType, 900);
    const publicUrl = s5PublicUrl(key);
    return NextResponse.json({ uploadUrl, key, publicUrl, contentType, expiresInSec: 900 });
  } catch (e: any) {
    console.error('[upload/presign] error', e);
    return NextResponse.json({ error: e?.message || 'Failed to presign upload' }, { status: 500 });
  }
}
