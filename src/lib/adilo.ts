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
  const body = {
    key,
    upload_id: uploadId,
    uploadId,
    part_number: partNumber,
    partNumber,
  };
  const res = await fetch(`${ADILO_BASE}/v1/files/upload/get-signed-url`, {
    method: 'POST',
    headers: adiloHeaders(),
    body: JSON.stringify(body),
  });
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
  parts: Array<{ ETag: string; PartNumber: number }>;
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
}): Promise<{ fileId: string; thumbnailUrl?: string; durationSeconds?: number }> {
  const body = {
    uploadId: input.uploadId,
    parts: input.parts,
    projectId: input.projectId,
    name: input.filename,
    mimeType: input.mimeType,
    size: input.sizeBytes,
    duration: input.durationSeconds ?? 0,
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
  return {
    id: data.id ?? fileId,
    thumbnailUrl: data.thumbnail ?? data.thumbnailUrl,
    durationSeconds: data.duration ?? data.durationSeconds,
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
