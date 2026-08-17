// src/lib/s5.ts - FileLu S5 (S3-compatible) object storage helper for Kuizen LMS
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const ENDPOINT = process.env.FILELU_S5_ENDPOINT || 'https://ap.s5lu.com';
const REGION = process.env.FILELU_S5_REGION || 'ap-southeast';
const BUCKET = process.env.FILELU_S5_BUCKET || 'kuizen-lms';
let _client: S3Client | null = null;
export function s5client(): S3Client {
  if (_client) return _client;
  const ak = process.env.FILELU_S5_ACCESS_KEY;
  const sk = process.env.FILELU_S5_SECRET_KEY;
  if (!ak || !sk) throw new Error('FileLu S5 credentials missing: set FILELU_S5_ACCESS_KEY and FILELU_S5_SECRET_KEY');
  _client = new S3Client({ endpoint: ENDPOINT, region: REGION, forcePathStyle: true, credentials: { accessKeyId: ak, secretAccessKey: sk } });
  return _client;
}
export const S5_BUCKET = BUCKET;
export const S5_ENDPOINT = ENDPOINT;
export async function s5PutObject(opts: { key: string; body: Buffer | Uint8Array | string; contentType?: string; cacheControl?: string }) {
  await s5client().send(new PutObjectCommand({ Bucket: BUCKET, Key: opts.key, Body: opts.body as any, ContentType: opts.contentType, CacheControl: opts.cacheControl }));
  return { bucket: BUCKET, key: opts.key };
}
export async function s5PresignPut(key: string, contentType?: string, expiresInSec = 900): Promise<string> {
  return getSignedUrl(s5client(), new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn: expiresInSec });
}
export async function s5PresignGet(key: string, expiresInSec = 3600): Promise<string> {
  return getSignedUrl(s5client(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: expiresInSec });
}
export async function s5DeleteObject(key: string): Promise<void> {
  await s5client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
export async function s5HeadObject(key: string) {
  try { const h = await s5client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return { exists: true, size: h.ContentLength, contentType: h.ContentType, lastModified: h.LastModified }; } catch (e: any) { if (e.name === 'NotFound' || e['$metadata']?.httpStatusCode === 404) return { exists: false }; throw e; }
}
export function s5PublicUrl(key: string): string { return `${ENDPOINT.replace(/\/+$/,'')}/${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`; }

/**
 * Muat naik daripada strim, bukan Buffer.
 *
 * Fail besar tidak boleh dibaca ke dalam memori dahulu. S3 memerlukan
 * ContentLength apabila badan ialah strim, jadi pemanggil mesti tahu saiz
 * sebenar. Untuk laluan source_url kita memperolehnya dengan menulis ke fail
 * sementara dan mengukur cakera, bukan dengan mempercayai Content-Length.
 */
export async function s5PutStream(
  key: string,
  body: any,
  contentLength: number,
  contentType?: string
) {
  await s5client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentLength: contentLength,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000',
    })
  );
  return { bucket: BUCKET, key };
}

/** Corak laluan objek yang sama seperti fileluUpload. Sentiasa dijana pelayan. */
export function s5ObjectKey(fileName: string): string {
  const rand = (globalThis.crypto?.randomUUID?.() as string) || Math.random().toString(36).slice(2) + Date.now().toString(36);
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  return `qm/${rand}-${safeName}`;
}

/** file_code yang difahami oleh route file-redirect. */
export function s5FileCode(key: string): string {
  return 's5__' + Buffer.from(key, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
