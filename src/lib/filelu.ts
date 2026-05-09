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

  return {
    fileCode,
    fileName: filename,
    sizeBytes: bytes.byteLength,
    mimeType: mimeType || 'application/octet-stream',
    shareUrl: `${BASE}/${fileCode}`,
  };
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
