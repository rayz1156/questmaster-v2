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
