import { NextRequest, NextResponse } from 'next/server';
import { fileluUpload } from '@/lib/filelu';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(req: NextRequest, { params }: { params: { boardId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();

  // Look up board + class; ensure user is owner or member
  const { data: board } = await admin
    .from('qm_boards').select('id, class_id').eq('id', params.boardId).single();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  if (!board.class_id) return NextResponse.json({ error: 'Board has no class' }, { status: 400 });

  const { data: klass } = await admin
    .from('qm_classes').select('id, owner_id').eq('id', board.class_id).single();
  if (!klass) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (klass.owner_id !== auth.user!.id) {
    const { data: member } = await admin
      .from('qm_class_members').select('user_id').eq('class_id', board.class_id).eq('user_id', auth.user!.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
    uploaded = await fileluUpload(buf, file.name || `intro.${(mime.split('/')[1]||'jpg')}`, mime);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'FileLu upload failed' }, { status: 502 });
  }

  const url = `/api/intro-boards/${params.boardId}/image/${uploaded.fileCode}`;
  return NextResponse.json({ url, path: uploaded.fileCode, fileCode: uploaded.fileCode });
}
