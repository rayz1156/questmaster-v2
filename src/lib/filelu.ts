/**
 * FileLu API client.
 *
 * Auth: x-www-form / query string `key=API_KEY`.
 * Upload flow:
 *   1) GET /api/upload/server?key=KEY -> { sess_id, result: <upload_url> }
 *   2) POST <upload_url> multipart with sess_id, utype=prem, file_0=<bytes>
 *      -> [{ file_code, file_status }]
 * Public landing URL: https://filelu.com/{file_code}
 * Direct (signed) URL: POST /api/file/direct_link with file_code+key -> { result.url, result.size }
 *
 * Note about Hostinger DNS: The VPS DNS resolver (Hostinger) does not resolve
 * `filelu.com` itself. Subdomains like `dXXXX.filelu.live` resolve fine.
 * /etc/hosts has been seeded with a Cloudflare IP for filelu.com to work around this.
 */

const API_KEY = process.env.FILELU_API_KEY || '';
const BASE = 'https://filelu.com';
import { s5PutObject } from '@/lib/s5';

function requireKey() {
  if (!API_KEY) throw new Error('FILELU_API_KEY is not configured');
  return API_KEY;
}

export interface FileluUploadResult {
  fileCode: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  shareUrl: string; // https://filelu.com/{file_code}
}

export interface FileluDirectLink {
  url: string;
  size: number;
}

/** Step 1+2 combined: upload a Buffer to FileLu and return file_code. */
export async function fileluUpload(
  bytes: Buffer,
  filename: string,
  mimeType: string,
): Promise<FileluUploadResult> {
  // --- S5 path (preferred): store to FileLu S5 bucket, bypassing the direct-upload node ---
  try {
    const rand = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
    const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
    const s5key = `qm/${rand}-${safeName}`;
    await s5PutObject({ key: s5key, body: bytes, contentType: mimeType || 'application/octet-stream', cacheControl: 'public, max-age=31536000' });
    const marked = 's5__' + Buffer.from(s5key, 'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return {
      fileCode: marked,
      fileName: filename,
      sizeBytes: bytes.byteLength,
      mimeType: mimeType || 'application/octet-stream',
      shareUrl: `/api/learning-boards/_/file-redirect/${marked}`,
    };
  } catch (s5err) {
    console.error('[fileluUpload] S5 upload failed, falling back to FileLu direct upload:', (s5err as any)?.message || s5err);
  }

  const key = requireKey();

  // Step 1: get upload server
  const serverRes = await fetch(`${BASE}/api/upload/server?key=${encodeURIComponent(key)}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!serverRes.ok) {
    throw new Error(`FileLu server lookup failed: HTTP ${serverRes.status}`);
  }
  const serverJson: any = await serverRes.json();
  if (serverJson?.status !== 200 || !serverJson?.result || !serverJson?.sess_id) {
    throw new Error(`FileLu server lookup bad response: ${JSON.stringify(serverJson).slice(0, 200)}`);
  }
  const uploadUrl: string = serverJson.result;
  const sessId: string = serverJson.sess_id;

  // Step 2: multipart POST to upload server
  const form = new FormData();
  form.set('sess_id', sessId);
  form.set('utype', 'prem');
  // Wrap Buffer as Blob; preserve filename + content-type
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType || 'application/octet-stream' });
  form.set('file_0', blob, filename);

  const upRes = await fetch(uploadUrl, { method: 'POST', body: form });
  if (!upRes.ok) {
    throw new Error(`FileLu upload failed: HTTP ${upRes.status}`);
  }
  const upJson: any = await upRes.json();
  // Response is array of { file_code, file_status }
  const first = Array.isArray(upJson) ? upJson[0] : upJson;
  const fileCode: string | undefined = first?.file_code;
  const status: string | undefined = first?.file_status;
  if (!fileCode || (status && status !== 'OK')) {
    throw new Error(`FileLu upload bad response: ${JSON.stringify(upJson).slice(0, 200)}`);
  }

  await fileluSetShareable(fileCode);
  return {
    fileCode,
    fileName: filename,
    sizeBytes: bytes.byteLength,
    mimeType: mimeType || 'application/octet-stream',
    shareUrl: `${BASE}/${fileCode}`,
  };
}

/** Make a file shareable (only_me=0) so direct_link resolves. Best-effort. */
export async function fileluSetShareable(fileCode: string): Promise<boolean> {
  try {
    const key = requireKey();
    const u = `${BASE}/api/file/only_me?file_code=${encodeURIComponent(fileCode)}&only_me=0&key=${encodeURIComponent(key)}`;
    const res = await fetch(u, { cache: 'no-store' });
    if (!res.ok) return false;
    const j: any = await res.json().catch(() => null);
    return !!j && j.status === 200;
  } catch {
    return false;
  }
}

/** Returns a temporary direct/CDN download URL for a file. */
export async function fileluDirectLink(fileCode: string): Promise<FileluDirectLink | null> {
  const key = requireKey();
  const body = new URLSearchParams();
  body.set('file_code', fileCode);
  body.set('key', key);
  const res = await fetch(`${BASE}/api/file/direct_link`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const j: any = await res.json().catch(() => null);
  if (!j || j.status !== 200) return null;
  const url: string | undefined = j?.result?.url;
  const size: number | undefined = j?.result?.size;
  if (!url) return null;
  return { url, size: typeof size === 'number' ? size : 0 };
}

/** Permanent share/landing page URL for the given code. */
export function fileluShareUrl(fileCode: string): string {
  return `${BASE}/${fileCode}`;
}
