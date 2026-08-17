import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { assertCapability } from '@/lib/capabilities';
import { fileluUpload, fileluShareUrl } from '@/lib/filelu';
import { fetchRemoteToDisk, checkRateLimit, readTmp, UploadGuardError } from '@/lib/upload-guard';
import { s5ObjectKey, s5PutStream, s5FileCode } from '@/lib/s5';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Tiada had tetap. MAX_UPLOAD_BYTES ialah injap operasi dengan lalai tidak
// terhad. Had fizikal sebenar ialah ruang cakera, yang disemak semasa
// penstriman, bukan nombor yang dipilih secara sewenang-wenangnya.
const MAX_BYTES: number | null = (() => {
  const raw = process.env.MAX_UPLOAD_BYTES;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

const MIN_FREE_DISK_BYTES = Number(process.env.MIN_FREE_DISK_BYTES || 5 * 1024 ** 3);

function fileNameFromUrl(u: string): string {
  try {
    const last = decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || '');
    return last || 'download';
  } catch {
    return 'download';
  }
}

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

  // --- Laluan source_url: pelayan yang mengambil fail, bukan model ---
  //
  // Base64 dijana sebagai output model, jadi setiap bait menjadi kos token.
  // Di sini bait tidak pernah menyentuh model langsung. Lihat lib/upload-guard.ts
  // untuk pertahanan SSRF, yang bukan pilihan: Supabase dihoskan sendiri pada
  // VPS ini, jadi URL yang tidak disemak boleh mencapai supabase-db.
  if ((req.headers.get('content-type') || '').includes('application/json')) {
    const body = await req.json().catch(() => ({}) as any);
    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
    if (!sourceUrl) {
      return NextResponse.json({ error: 'sourceUrl required for JSON requests' }, { status: 400 });
    }

    const rate = checkRateLimit(owner.user!.id);
    if (!rate.ok) {
      return NextResponse.json(
        { error: `Too many uploads. Try again in ${rate.retryAfterSec}s` },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
      );
    }

    let remote;
    try {
      remote = await fetchRemoteToDisk(sourceUrl, {
        allowedMimePrefixes: ALLOWED_MIME_PREFIXES,
        maxBytes: MAX_BYTES,
        minFreeDiskBytes: MIN_FREE_DISK_BYTES,
        maxRedirects: 3,
      });
    } catch (e: any) {
      const status = e instanceof UploadGuardError ? e.status : 502;
      console.warn(
        `[upload-file/source_url] ditolak user=${owner.user!.id} url=${sourceUrl} sebab=${e?.message || e}`,
      );
      return NextResponse.json({ error: e?.message || 'Fetch failed' }, { status });
    }

    try {
      const fileName =
        (typeof body.fileName === 'string' && body.fileName.trim()) || fileNameFromUrl(remote.finalUrl);
      const key = s5ObjectKey(fileName);
      await s5PutStream(key, readTmp(remote.tmpPath), remote.bytes, remote.mimeType);
      const fileCode = s5FileCode(key);

      console.log(
        `[upload-file/source_url] user=${owner.user!.id} class=${params.classId} ` +
          `url=${remote.finalUrl} ips=${remote.resolvedIps.join(',')} ` +
          `bytes=${remote.bytes} mime=${remote.mimeType}`,
      );

      return NextResponse.json({
        fileCode,
        fileUrl: fileluShareUrl(fileCode),
        fileluFileUrl: `/api/learning-boards/${params.classId}/file-redirect/${fileCode}`,
        fileName,
        fileMimeType: remote.mimeType,
        fileSizeBytes: remote.bytes,
        fileExtension: extOf(fileName) || null,
        sourceUrl: remote.finalUrl,
      });
    } finally {
      await remote.cleanup();
    }
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data expected' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field missing' }, { status: 400 });
  }

  if (file.size <= 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  if (MAX_BYTES && file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${Math.round(MAX_BYTES / 1024 / 1024)} MB, set by MAX_UPLOAD_BYTES` },
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
