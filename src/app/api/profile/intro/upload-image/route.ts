import { NextRequest, NextResponse } from 'next/server';
import { fileluUpload } from '@/lib/filelu';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data expected' }, { status: 400 });
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file field missing' }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `File too large. Max ${Math.round(MAX_BYTES/1024/1024)} MB` }, { status: 413 });
  const mime = file.type || 'application/octet-stream';
  if (!mime.startsWith('image/')) return NextResponse.json({ error: `Unsupported file type: ${mime}` }, { status: 415 });

  const buf = Buffer.from(await file.arrayBuffer());
  let uploaded;
  try {
    uploaded = await fileluUpload(buf, file.name || `profile.${(mime.split('/')[1]||'jpg')}`, mime);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'FileLu upload failed' }, { status: 502 });
  }

  // Persist on profile (and clear any existing video fields).
  const { error: upErr } = await admin.from('qm_profiles').update({
    intro_media_type: 'image',
    intro_image_file_code: uploaded.fileCode,
    intro_image_path: uploaded.fileCode,
    intro_media_updated_at: new Date().toISOString(),
  }).eq('id', auth.user!.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const url = `/api/profile/image/${uploaded.fileCode}`;
  return NextResponse.json({ url, fileCode: uploaded.fileCode });
}
