/**
 * Bunny Stream video hosting integration.
 *
 * Server-side only. Required env (in .env.local):
 *   BUNNY_STREAM_LIBRARY_ID    - numeric id of the Stream video library
 *   BUNNY_STREAM_API_KEY       - library-scoped AccessKey (Stream > API)
 *   BUNNY_STREAM_CDN_HOSTNAME  - e.g. vz-xxxxxx-xxx.b-cdn.net (no protocol)
 *   BUNNY_STREAM_TOKEN_KEY     - library Token Authentication Key (Stream > Security)
 *
 * Function shapes intentionally mirror src/lib/adilo.ts so the four
 * video/start + video/complete route pairs can swap providers with
 * minimal changes:
 *   createAdiloProject   -> createBunnyCollection
 *   startAdiloUpload     -> createBunnyVideo (mints the GUID)
 *   getAdiloSignedUrl    -> getBunnyTusUpload (presigned TUS auth for the browser)
 *   completeAdiloUpload  -> not needed: Bunny finalizes the TUS upload itself;
 *                          complete routes just call getBunnyVideo for metadata
 *   getAdiloFile         -> getBunnyVideo
 *   buildAdiloEmbedUrl   -> buildBunnyEmbedUrl / buildSignedBunnyEmbedUrl
 */

import { createHash } from 'crypto';

const BUNNY_BASE = 'https://video.bunnycdn.com';

function requiredEnv(name: string): string {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`Bunny credentials missing: set ${name} in .env.local`);
  return v;
}

function libraryId(): string {
  return requiredEnv('BUNNY_STREAM_LIBRARY_ID');
}
function apiKey(): string {
  return requiredEnv('BUNNY_STREAM_API_KEY');
}
function cdnHostname(): string {
  return requiredEnv('BUNNY_STREAM_CDN_HOSTNAME').replace(/^https?:\/\//, '');
}
function tokenKey(): string {
  return requiredEnv('BUNNY_STREAM_TOKEN_KEY');
}

function bunnyHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = { AccessKey: apiKey() };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

/* ------------------------------------------------------------------ */
/* Collections (Bunny's equivalent of Adilo "projects")                */
/* ------------------------------------------------------------------ */

export type BunnyCollection = { id: string; name: string };

export async function createBunnyCollection(name: string): Promise<BunnyCollection> {
  const res = await fetch(`${BUNNY_BASE}/library/${libraryId()}/collections`, {
    method: 'POST',
    headers: bunnyHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Bunny createCollection failed: ${res.status} ${t.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const id = json?.guid || json?.Guid;
  if (!id) {
    console.error('[bunny] createCollection returned no guid. Raw:', JSON.stringify(json));
    throw new Error('Bunny createCollection: no guid in response: ' + JSON.stringify(json).slice(0, 300));
  }
  return { id, name: json?.name ?? name };
}

/* ------------------------------------------------------------------ */
/* Videos                                                              */
/* ------------------------------------------------------------------ */

/** Bunny video status codes:
 *  0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished,
 *  5 Error, 6 UploadFailed. Playable when status === 4. */
export type BunnyVideo = {
  guid: string;
  status: number;
  ready: boolean;
  failed: boolean;
  durationSeconds?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  embedUrl: string;
  hlsUrl: string;
};

export async function createBunnyVideo(input: {
  title: string;
  collectionId?: string | null;
}): Promise<{ guid: string }> {
  const body: Record<string, unknown> = { title: input.title };
  if (input.collectionId) body.collectionId = input.collectionId;
  const res = await fetch(`${BUNNY_BASE}/library/${libraryId()}/videos`, {
    method: 'POST',
    headers: bunnyHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Bunny createVideo failed: ${res.status} ${t.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const guid = json?.guid || json?.Guid;
  if (!guid) {
    console.error('[bunny] createVideo returned no guid. Raw:', JSON.stringify(json));
    throw new Error('Bunny createVideo: no guid in response: ' + JSON.stringify(json).slice(0, 300));
  }
  return { guid };
}

/** Presigned TUS auth so the browser can upload straight to Bunny without ever
 *  seeing the API key. The client uses tus-js-client against `endpoint` with
 *  headers { AuthorizationSignature, AuthorizationExpire, VideoId, LibraryId }. */
export type BunnyTusUpload = {
  endpoint: string;
  signature: string; // sha256hex(libraryId + apiKey + expire + videoGuid)
  expire: number;    // unix seconds
  videoId: string;
  libraryId: string;
};

export function getBunnyTusUpload(videoGuid: string, expiresInMinutes = 120): BunnyTusUpload {
  const lib = libraryId();
  const expire = Math.floor(Date.now() / 1000) + Math.max(1, expiresInMinutes) * 60;
  const signature = createHash('sha256')
    .update(`${lib}${apiKey()}${expire}${videoGuid}`)
    .digest('hex');
  return {
    endpoint: `${BUNNY_BASE}/tusupload`,
    signature,
    expire,
    videoId: videoGuid,
    libraryId: lib,
  };
}

export async function getBunnyVideo(videoGuid: string): Promise<BunnyVideo> {
  const res = await fetch(
    `${BUNNY_BASE}/library/${libraryId()}/videos/${encodeURIComponent(videoGuid)}`,
    { method: 'GET', headers: bunnyHeaders(false), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Bunny getVideo failed: ${res.status}`);
  const data: any = await res.json();
  const status: number = typeof data?.status === 'number' ? data.status : -1;
  const host = cdnHostname();
  const thumbFile = data?.thumbnailFileName || 'thumbnail.jpg';
  return {
    guid: videoGuid,
    status,
    ready: status === 4,
    failed: status === 5 || status === 6,
    durationSeconds: typeof data?.length === 'number' ? data.length : undefined,
    thumbnailUrl: `https://${host}/${videoGuid}/${thumbFile}`,
    previewUrl: data?.previewAnimationUrl || undefined,
    embedUrl: buildBunnyEmbedUrl(videoGuid),
    hlsUrl: `https://${host}/${videoGuid}/playlist.m3u8`,
  };
}

export async function deleteBunnyVideo(videoGuid: string): Promise<void> {
  const res = await fetch(
    `${BUNNY_BASE}/library/${libraryId()}/videos/${encodeURIComponent(videoGuid)}`,
    { method: 'DELETE', headers: bunnyHeaders(false) }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Bunny deleteVideo failed: ${res.status}`);
  }
}

/* ------------------------------------------------------------------ */
/* Playback URLs                                                       */
/* ------------------------------------------------------------------ */

/** Plain embed URL. Students only ever see this inside our own iframe /
 *  lightbox components, mirroring how Adilo embeds are rendered today. */
export function buildBunnyEmbedUrl(videoGuid: string): string {
  return `https://iframe.mediadelivery.net/embed/${libraryId()}/${videoGuid}`;
}

/** Signed embed URL for when "Embed View Token Authentication" is enabled on
 *  the library (Stream > Security): token = sha256hex(tokenKey + videoId + expires). */
export function buildSignedBunnyEmbedUrl(videoGuid: string, expiresInSeconds = 3600): string {
  const expires = Math.floor(Date.now() / 1000) + Math.max(60, expiresInSeconds);
  const token = createHash('sha256')
    .update(`${tokenKey()}${videoGuid}${expires}`)
    .digest('hex');
  return `${buildBunnyEmbedUrl(videoGuid)}?token=${token}&expires=${expires}`;
}
