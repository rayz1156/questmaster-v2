import { NextRequest, NextResponse } from 'next/server';
import { requireClassOwner } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 50 MB cap (configurable later if needed)
const MAX_BYTES = 50 * 1024 * 1024;
const BUCKET = 'learning-cards';

const ALLOWED_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-',
  'application/vnd.oasis.opendocument',
  'application/zip',
  'application/x-zip-compressed',
  'application/rtf',
  'application/json',
  'application/xml',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/octet-stream',
  'text/',
  'image/',
  'audio/',
];

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return '';
  return name.substring(i + 1).toLowerCase();
}

export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassOwner(req, params.classId);
  if (owner.response) return owner.response;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data expected' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field missing' }, { status: 400 });
  }

  if (file.size <= 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large. Max ${MAX_BYTES / 1024 / 1024}MB` }, { status: 413 });
  }

  const mime = file.type || 'application/octet-stream';
  const isAllowed = ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
  if (!isAllowed) {
    return NextResponse.json({ error: `Unsupported file type: ${mime}` }, { status: 415 });
  }

  // Resolve board id for namespacing storage
  const { data: board } = await owner.supa
    .from('qm_learning_boards')
    .select('id')
    .eq('class_id', params.classId)
    .single();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

  const ext = extOf(file.name);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  const objectKey = `${board.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

  const arrayBuf = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuf);

  const { error: upErr } = await owner.supa.storage.from(BUCKET).upload(objectKey, bytes, {
    contentType: mime,
    cacheControl: '3600',
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = owner.supa.storage.from(BUCKET).getPublicUrl(objectKey);
  const fileUrl = pub?.publicUrl;
  if (!fileUrl) return NextResponse.json({ error: 'failed to resolve public url' }, { status: 500 });

  return NextResponse.json({
    fileUrl,
    filePath: objectKey,
    fileName: file.name,
    fileMimeType: mime,
    fileSizeBytes: file.size,
    fileExtension: ext || null,
  });
}
