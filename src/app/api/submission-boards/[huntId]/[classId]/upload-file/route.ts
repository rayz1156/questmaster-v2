import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { fileluUpload, fileluShareUrl } from '@/lib/filelu';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 150 * 1024 * 1024; // 150 MB
const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats',
  'application/vnd.ms-',
  'application/zip',
  'text/',
];

function extOf(name: string): string {
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

export async function POST(req: NextRequest, { params }: { params: { huntId: string; classId: string } }) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data expected' }, { status: 400 });
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file field missing' }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large. Max ${Math.round(MAX_BYTES / 1024 / 1024)} MB` }, { status: 413 });
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    return NextResponse.json({ error: `Unsupported file type: ${mime}` }, { status: 415 });
  }

  const ext = extOf(file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  let uploaded;
  try {
    uploaded = await fileluUpload(bytes, file.name || `upload.${ext || 'bin'}`, mime);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'FileLu upload failed' }, { status: 502 });
  }

  const fileluFileUrl = `/api/submission-boards/${params.huntId}/${params.classId}/file-redirect/${uploaded.fileCode}`;
  return NextResponse.json({
    fileCode: uploaded.fileCode,
    fileUrl: fileluShareUrl(uploaded.fileCode),
    fileluFileUrl,
    fileName: file.name,
    fileMimeType: mime,
    fileSizeBytes: file.size,
    fileExtension: ext,
  });
}
