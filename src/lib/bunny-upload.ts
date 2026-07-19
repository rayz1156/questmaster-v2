'use client';
/**
 * Browser-side resumable upload to Bunny Stream via presigned TUS.
 * The server mints { endpoint, signature, expire, videoId, libraryId }
 * (see getBunnyTusUpload in src/lib/bunny.ts) so the API key never
 * reaches the browser.
 */
import * as tus from 'tus-js-client';

export type BunnyTusAuth = {
  endpoint: string;
  signature: string;
  expire: number;
  videoId: string;
  libraryId: string;
};

export function uploadToBunny(
  file: File,
  auth: BunnyTusAuth,
  opts?: { onProgress?: (pct: number) => void }
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!auth || !auth.endpoint || !auth.signature) {
      reject(new Error('Missing Bunny upload authorization'));
      return;
    }
    const upload = new tus.Upload(file, {
      endpoint: auth.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        AuthorizationSignature: auth.signature,
        AuthorizationExpire: String(auth.expire),
        VideoId: auth.videoId,
        LibraryId: auth.libraryId,
      },
      metadata: {
        filetype: file.type || 'video/mp4',
        title: file.name,
      },
      onError: (err) => reject(err instanceof Error ? err : new Error(String(err))),
      onProgress: (sent, total) => {
        if (opts?.onProgress && total > 0) opts.onProgress(Math.round((sent / total) * 100));
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}
