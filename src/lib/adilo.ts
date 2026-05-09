/**
 * Adilo (BigCommand) video hosting integration.
 *
 * Server-side only. Requires:
 *   ADILO_PUBLIC_KEY
 *   ADILO_SECRET_KEY
 *
 * Upload flow (4 steps, validated end-to-end in earlier integration test):
 *   1. POST /v1/files/upload/start   -> { uploadId, key }
 *   2. GET  /v1/files/upload/get-signed-url/{uploadId}/{partNumber}  -> S3 PUT URL
 *   3. PUT  signed URL with file bytes  -> ETag header
 *   4. POST /v1/files/upload/complete -> { fileId }
 *
 * For Cendekia we keep all calls server-side so credentials never reach the
 * browser; the browser only PUTs to the signed Wasabi S3 URL we hand it.
 */

const ADILO_BASE = 'https://adilo-api.bigcommand.com';

function adiloHeaders(): Record<string, string> {
  const pub = process.env.ADILO_PUBLIC_KEY;
  const sec = process.env.ADILO_SECRET_KEY;
  if (!pub || !sec) {
    throw new Error('Adilo credentials missing: set ADILO_PUBLIC_KEY and ADILO_SECRET_KEY in .env.local');
  }
  return {
    'X-Public-Key': pub,
    'X-Secret-Key': sec,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

type AdiloProject = { id: string; name: string };

export async function listAdiloProjects(): Promise<AdiloProject[]> {
  const res = await fetch(`${ADILO_BASE}/v1/projects`, {
    method: 'GET',
    headers: adiloHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Adilo listProjects failed: ${res.status}`);
  const json = await res.json();
  // Defensive: response shape varies; commonly { data: [...] } or array
  const arr: any[] = Array.isArray(json) ? json : (json.payload ?? json.data ?? json.projects ?? []);
  return arr.map((p) => ({ id: p.id ?? p.project_id ?? p._id, name: p.name ?? p.title ?? '' }));
}

export async function createAdiloProject(name: string): Promise<AdiloProject> {
  const res = await fetch(`${ADILO_BASE}/v1/projects`, {
    method: 'POST',
    headers: adiloHeaders(),
    body: JSON.stringify({ title: name, name }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Adilo createProject failed: ${res.status} ${t}`);
  }
  const json = await res.json();
  const p = json.payload ?? json.data ?? json;
  const projectId = p.project_id ?? p.projectId ?? p.id ?? p._id ?? p.pid ?? p.slug ?? p.uuid ?? p.uid;
  if (!projectId) {
    // eslint-disable-next-line no-console
    console.error('[adilo] createProject returned no id. Raw:', JSON.stringify(json));
    throw new Error('Adilo createProject: no project id in response: ' + JSON.stringify(json).slice(0, 400));
  }
  return { id: String(projectId), name: p.name ?? p.title ?? name };
}

export type AdiloUploadStart = {
  uploadId: string;
  key: string;
  fileId?: string;
};

export async function startAdiloUpload(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
}): Promise<AdiloUploadStart> {
  const dur = Math.max(0, Math.floor(input.durationSeconds ?? 0));
  const hh = String(Math.floor(dur / 3600)).padStart(2, '0');
  const mm = String(Math.floor((dur % 3600) / 60)).padStart(2, '0');
  const ss = String(dur % 60).padStart(2, '0');
  const durationString = `${hh}:${mm}:${ss}`;
  const body = {
    project_id: input.projectId,
    projectId: input.projectId,
    name: input.filename,
    title: input.filename,
    filename: input.filename,
    mime_type: input.mimeType,
    mimeType: input.mimeType,
    filesize: input.sizeBytes,
    size: input.sizeBytes,
    duration_seconds: dur,
    duration_string: durationString,
    duration: dur,
    drm_protection: 0,
  };
  const res = await fetch(`${ADILO_BASE}/v1/files/upload/start`, {
    method: 'POST',
    headers: adiloHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Adilo upload/start failed: ${res.status} ${t}`);
  }
  const json = await res.json();
  const data = json.payload ?? json.data ?? json;
  const uploadId = data.uploadId ?? data.upload_id ?? data.uploadID;
  const key = data.key ?? data.upload_key ?? data.objectKey ?? data.object_key ?? data.path;
  const fileId = data.fileId ?? data.file_id ?? data.id;
  if (!uploadId || !key) {
    // eslint-disable-next-line no-console
    console.error('[adilo] upload/start returned incomplete data. Raw:', JSON.stringify(json));
    throw new Error('Adilo upload/start missing uploadId or key: ' + JSON.stringify(json).slice(0, 400));
  }
  return { uploadId, key, fileId };
}

export async function getAdiloSignedUrl(uploadId: string, key: string, partNumber = 1): Promise<string> {
  const qs = new URLSearchParams({ key, upload_id: uploadId, part_number: String(partNumber) });
  const res = await fetch(
    `${ADILO_BASE}/v1/files/upload/get-signed-url/${encodeURIComponent(uploadId)}/${partNumber}?${qs.toString()}`,
    { method: 'GET', headers: adiloHeaders() }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Adilo get-signed-url failed: ${res.status} ${t}`);
  }
  const json = await res.json();
  const data = json.payload ?? json.data ?? json;
  const url = data.url ?? data.signedUrl ?? data.signed_url ?? data.presignedUrl ?? data.presigned_url;
  if (!url) {
    // eslint-disable-next-line no-console
    console.error('[adilo] get-signed-url returned no url. Raw:', JSON.stringify(json));
    throw new Error('Adilo signed URL missing in response: ' + JSON.stringify(json).slice(0, 400));
  }
  return url;
}

export async function completeAdiloUpload(input: {
  uploadId: string;
  key: string;
  parts: Array<{ ETag: string; PartNumber: number }>;
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
}): Promise<{ fileId: string; thumbnailUrl?: string; durationSeconds?: number }> {
  const dur = Math.max(0, Math.floor(input.durationSeconds ?? 0));
  const hh = String(Math.floor(dur / 3600)).padStart(2, '0');
  const mm = String(Math.floor((dur % 3600) / 60)).padStart(2, '0');
  const ss = String(dur % 60).padStart(2, '0');
  const durationString = `${hh}:${mm}:${ss}`;
  const body = {
    key: input.key,
    upload_id: input.uploadId,
    uploadId: input.uploadId,
    parts: input.parts,
    project_id: input.projectId,
    projectId: input.projectId,
    name: input.filename,
    title: input.filename,
    filename: input.filename,
    mime_type: input.mimeType,
    mimeType: input.mimeType,
    filesize: input.sizeBytes,
    size: input.sizeBytes,
    duration_seconds: dur,
    duration_string: durationString,
    duration: dur,
    drm_protection: 0,
  };
  const res = await fetch(`${ADILO_BASE}/v1/files/upload/complete`, {
    method: 'POST',
    headers: adiloHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Adilo upload/complete failed: ${res.status} ${t}`);
  }
  const json = await res.json();
  const data = json.payload ?? json.data ?? json;
  return {
    fileId: data.id ?? data.fileId ?? data.file_id,
    thumbnailUrl: data.thumbnail ?? data.thumbnailUrl,
    durationSeconds: data.duration ?? data.durationSeconds,
  };
}

/**
 * Adilo's REST API does not expose video thumbnail URLs. The only place they
 * are advertised is the public watch page HTML (stream.adilo.com CDN).
 * This best-effort helper scrapes the first thumbnail URL it finds.
 */
export async function fetchAdiloWatchThumbnail(fileId: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://adilo.bigcommand.com/watch/${encodeURIComponent(fileId)}`, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuestmasterBot/1.0)' },
      cache: 'no-store',
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const m = html.match(/https?:\/\/stream\.adilo\.com\/[^"'\s)]+\.(?:jpg|jpeg|png|webp)/i);
    return m ? m[0] : undefined;
  } catch {
    return undefined;
  }
}

export async function getAdiloFile(fileId: string): Promise<{
  id: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  status?: string;
  embedUrl?: string;
}> {
  const res = await fetch(`${ADILO_BASE}/v1/files/${fileId}`, {
    method: 'GET',
    headers: adiloHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Adilo getFile failed: ${res.status}`);
  const json = await res.json();
  const data = json.payload ?? json.data ?? json;
  // Adilo can deliver thumbnail under many names — also try posters/snapshots arrays.
  const thumbCandidate = data.thumbnail ?? data.thumbnailUrl ?? data.thumbnail_url ?? data.thumb ?? data.thumb_url ?? data.poster ?? data.poster_url ?? data.image ?? data.image_url ?? (Array.isArray(data.thumbnails) && data.thumbnails[0]?.url) ?? (Array.isArray(data.posters) && data.posters[0]?.url) ?? (Array.isArray(data.snapshots) && data.snapshots[0]?.url) ?? null;
  if (!thumbCandidate) {
    console.warn('[adilo] getFile: no thumbnail field. Response keys:', Object.keys(data || {}).join(','), '| raw:', JSON.stringify(json).slice(0, 600));
  }
  let finalThumb = (thumbCandidate as string | undefined) || undefined;
  if (!finalThumb) {
    finalThumb = await fetchAdiloWatchThumbnail(fileId);
  }
  // Adilo also exposes duration_formatted ("00:00:08") instead of duration in seconds.
  let durSec: number | undefined = data.duration ?? data.durationSeconds ?? data.duration_seconds;
  if (typeof durSec !== 'number' && typeof data.duration_formatted === 'string') {
    const parts = data.duration_formatted.split(':').map((x: string) => parseInt(x, 10));
    if (parts.every((n: number) => !isNaN(n))) {
      if (parts.length === 3) durSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) durSec = parts[0] * 60 + parts[1];
    }
  }
  return {
    id: data.id ?? fileId,
    thumbnailUrl: finalThumb,
    durationSeconds: durSec,
    status: data.status,
    embedUrl: data.embedUrl ?? data.embed_url ?? data.share?.embedUrl,
  };
}

/**
 * Build the Adilo embed URL we render inside our own iframe.
 * Adilo's player URL pattern for embeds: https://adilo.bigcommand.com/watch/{fileId}
 * Students never see this URL in their address bar — only inside an iframe
 * inside our LightboxPlayer component.
 */
export function buildAdiloEmbedUrl(fileId: string): string {
  return `https://adilo.bigcommand.com/watch/${fileId}`;
}
