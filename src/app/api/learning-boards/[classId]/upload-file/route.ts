import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { assertCapability } from '@/lib/capabilities';
import { fileluUpload, fileluShareUrl } from '@/lib/filelu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 1 GiB cap per file (FileLu Premium allows large files; we keep a sane app-level cap).
const MAX_BYTES = 1024 * 1024 * 1024;

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
  'video/',
];

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return '';
  return name.substring(i + 1).toLowerCase();
}

export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;

  const cap = await assertCapability(owner.supa, owner.user!.id, 'files');
  if (!cap.ok) return NextResponse.json({ error: cap.message }, { status: cap.status });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data expected' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field missing' }, { status: 400 });
  }

  if (file.size <= 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${Math.round(MAX_BYTES / 1024 / 1024)} MB` },
      { status: 413 },
    );
  }

  const mime = file.type || 'application/octet-stream';
  const isAllowed = ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
  if (!isAllowed) {
    return NextResponse.json({ error: `Unsupported file type: ${mime}` }, { status: 415 });
  }

  const ext = extOf(file.name);
  const arrayBuf = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuf);

  let uploaded;
  try {
    uploaded = await fileluUpload(bytes, file.name || `upload.${ext || 'bin'}`, mime);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'FileLu upload failed' }, { status: 502 });
  }

  // Stable URL that streams the file through our server (sets correct content-type so <img>/<video> can render).
  const fileluFileUrl = `/api/learning-boards/${params.classId}/file-redirect/${uploaded.fileCode}`;
  return NextResponse.json({
    fileCode: uploaded.fileCode,
    fileUrl: fileluShareUrl(uploaded.fileCode),
    fileluFileUrl,
    fileName: uploaded.fileName,
    fileMimeType: uploaded.mimeType,
    fileSizeBytes: uploaded.sizeBytes,
    fileExtension: ext || null,
  });
}
