// lib/upload-guard.ts
//
// Mengambil fail jauh untuk source_url, dengan andaian URL itu bermusuhan
// sehingga terbukti sebaliknya.
//
// KENAPA INI PERLU BERHATI-HATI
// Membenarkan pelayan mengambil URL sewenang-wenangnya ialah SSRF klasik.
// Pada VPS ini risikonya nyata kerana Supabase dihoskan sendiri dalam Docker:
// satu source_url yang tidak disemak boleh mencapai supabase-db,
// supabase-auth, supabase-rest, supabase-storage, atau endpoint metadata awan
// pada 169.254.169.254.
//
// Pertahanan utama ialah cangkuk `lookup` pada permintaan HTTPS. Pengesahan
// dibuat pada ALAMAT IP yang diselesaikan, bukan pada rentetan URL, dan
// alamat yang sama itulah yang disambungkan. Itu menutup DNS rebinding, iaitu
// helah menyemak satu IP kemudian menyambung ke IP yang lain.

import { lookup as dnsLookup } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdtemp, rm, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class UploadGuardError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Sekatan alamat
// ---------------------------------------------------------------------------

function blockedV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true;                            // 0.0.0.0/8
  if (a === 10) return true;                           // 10/8 peribadi
  if (a === 127) return true;                          // gelung balik
  if (a === 169 && b === 254) return true;             // link-local, metadata awan
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16/12 peribadi
  if (a === 192 && b === 168) return true;             // 192.168/16 peribadi
  if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT 100.64/10
  if (a === 192 && b === 0) return true;               // 192.0.0/24, 192.0.2/24
  if (a === 198 && (b === 18 || b === 19)) return true; // penanda aras
  if (a === 198 && b === 51) return true;              // TEST-NET-2
  if (a === 203 && b === 0) return true;               // TEST-NET-3
  if (a >= 224) return true;                           // multicast, terpelihara, siaran
  return false;
}

function blockedV6(ip: string): boolean {
  const s = ip.toLowerCase().split('%')[0];
  if (s === '::' || s === '::1') return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return blockedV4(mapped[1]);             // IPv4 terpeta
  const head = s.split(':')[0] || '0';
  const first = parseInt(head, 16) || 0;
  if ((first & 0xfe00) === 0xfc00) return true;        // fc00::/7 tempatan unik
  if ((first & 0xffc0) === 0xfe80) return true;        // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true;        // ff00::/8 multicast
  return false;
}

export function isBlockedAddress(ip: string, family: number): boolean {
  return family === 6 ? blockedV6(ip) : blockedV4(ip);
}

/**
 * Alamat yang benar-benar disambungkan, dikumpul untuk log audit.
 *
 * net.connect memanggil lookup dengan { all: true } dan menjangka tatasusunan
 * { address, family }. Memaksa all: false di sini memulangkan bentuk yang salah
 * dan setiap sambungan sah mati dengan "Invalid IP address: undefined", jadi
 * kedua-dua bentuk mesti dihormati.
 */
function makeGuardedLookup(seen: string[]) {
  return (hostname: string, options: any, cb: any) => {
    const callback = typeof options === 'function' ? options : cb;
    const opts: any = typeof options === 'object' && options ? options : {};
    dnsLookup(hostname, { ...opts, all: true } as any, (err: any, addresses: any) => {
      if (err) return callback(err);
      const list: Array<{ address: string; family: number }> = Array.isArray(addresses) ? addresses : [];
      if (list.length === 0) {
        return callback(Object.assign(new Error(`Tiada alamat untuk ${hostname}`), { code: 'EBLOCKEDADDR' }));
      }
      // Jika MANA-MANA alamat disekat, tolak keseluruhan hos. Menapis dan
      // menyambung kepada baki yang selamat membuka pintu kepada rebinding
      // melalui rekod DNS bercampur.
      const bad = list.find((a) => isBlockedAddress(a.address, a.family));
      if (bad) {
        return callback(
          Object.assign(new Error(`Alamat disekat untuk ${hostname}: ${bad.address}`), { code: 'EBLOCKEDADDR' })
        );
      }
      for (const a of list) seen.push(a.address);
      if (opts.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}

// ---------------------------------------------------------------------------
// Jenis kandungan ditentukan daripada bait sebenar, bukan sambungan fail
// atau header Content-Type yang dikawal oleh hos jauh.
// ---------------------------------------------------------------------------

const SIGNATURES: Array<{ mime: string; sig: number[] }> = [
  { mime: 'application/pdf', sig: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'application/zip', sig: [0x50, 0x4b, 0x03, 0x04] },  // termasuk docx, xlsx, pptx
  { mime: 'application/zip', sig: [0x50, 0x4b, 0x05, 0x06] },
  { mime: 'application/zip', sig: [0x50, 0x4b, 0x07, 0x08] },
  { mime: 'image/png', sig: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', sig: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', sig: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', sig: [0x52, 0x49, 0x46, 0x46] },
  { mime: 'application/x-rar-compressed', sig: [0x52, 0x61, 0x72, 0x21] },
  { mime: 'application/x-7z-compressed', sig: [0x37, 0x7a, 0xbc, 0xaf] },
  { mime: 'application/gzip', sig: [0x1f, 0x8b] },
  { mime: 'application/msword', sig: [0xd0, 0xcf, 0x11, 0xe0] }, // OLE2: doc, xls, ppt lama
];

export function sniffMime(head: Buffer): string | null {
  for (const { mime, sig } of SIGNATURES) {
    if (head.length >= sig.length && sig.every((b, i) => head[i] === b)) return mime;
  }
  if (head.length >= 12 && head.subarray(4, 8).toString('latin1') === 'ftyp') return 'video/mp4';

  // Teks: tiada bait nol dan tiada aksara kawalan selain ruang putih.
  // Bait >= 0x80 dibenarkan supaya UTF-8 lulus.
  const n = Math.min(head.length, 1024);
  if (n > 0) {
    let printable = true;
    for (let i = 0; i < n; i++) {
      const c = head[i];
      if (c === 0 || c < 0x09 || (c > 0x0d && c < 0x20)) { printable = false; break; }
    }
    if (printable) return 'text/plain';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Had kadar setiap pengguna. Dalam memori sudah memadai kerana aplikasi
// berjalan sebagai satu proses PM2 fork tunggal.
// ---------------------------------------------------------------------------

const rateBuckets = new Map<string, number[]>();

export function checkRateLimit(userId: string, limit = 20, windowMs = 10 * 60_000) {
  const now = Date.now();
  const arr = (rateBuckets.get(userId) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    rateBuckets.set(userId, arr);
    return { ok: false as const, retryAfterSec: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  rateBuckets.set(userId, arr);
  if (rateBuckets.size > 5000) {
    rateBuckets.forEach((v, k) => {
      if (v.every((t: number) => now - t >= windowMs)) rateBuckets.delete(k);
    });
  }
  return { ok: true as const, retryAfterSec: 0 };
}

// ---------------------------------------------------------------------------
// Ruang cakera. Ini satu-satunya had fizikal sebenar pada laluan source_url.
// ---------------------------------------------------------------------------

const DEFAULT_MIN_FREE = 5 * 1024 ** 3; // 5 GiB

export async function freeDiskBytes(path: string): Promise<number> {
  const s: any = await statfs(path);
  return Number(s.bavail) * Number(s.bsize);
}

/** Strim fail sementara ke S3 tanpa membacanya ke dalam memori. */
export function readTmp(tmpPath: string) {
  return createReadStream(tmpPath);
}

// ---------------------------------------------------------------------------
// Pengambilan
// ---------------------------------------------------------------------------

function parseHttpsUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new UploadGuardError('source_url bukan URL yang sah'); }
  if (u.protocol !== 'https:') {
    throw new UploadGuardError(`Hanya https dibenarkan untuk source_url, bukan ${u.protocol.replace(':', '')}`);
  }
  return u;
}

function openRequest(url: URL, seen: string[]): Promise<{ req: any; res: any }> {
  return new Promise((resolve, reject) => {
    let headersTimer: NodeJS.Timeout;
    const req = httpsRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: (url.pathname || '/') + (url.search || ''),
        method: 'GET',
        // Tiada cookie, tiada Authorization, tiada token dalaman. Kredensial
        // tidak pernah dihantar kepada hos luar.
        headers: { 'User-Agent': 'KuizenBot/1.0 (+https://kuizen.fun)', Accept: '*/*' },
        lookup: makeGuardedLookup(seen) as any,
      },
      (res) => {
        clearTimeout(headersTimer);
        req.setTimeout(0);  // tamat masa sambungan tidak lagi terpakai
        resolve({ req, res });
      }
    );
    headersTimer = setTimeout(
      () => req.destroy(new UploadGuardError('Tamat masa menunggu respons selepas 120 saat', 504)),
      120_000
    );
    req.setTimeout(30_000, () => req.destroy(new UploadGuardError('Tamat masa sambungan selepas 30 saat', 504)));
    req.on('error', (e: any) => {
      clearTimeout(headersTimer);
      if (e?.code === 'EBLOCKEDADDR') return reject(new UploadGuardError(e.message, 403));
      reject(e instanceof UploadGuardError ? e : new UploadGuardError(`Pengambilan gagal: ${e?.message || e}`, 502));
    });
    req.end();
  });
}

export interface RemoteFile {
  tmpPath: string;
  bytes: number;
  mimeType: string;
  finalUrl: string;
  resolvedIps: string[];
  cleanup: () => Promise<void>;
}

/**
 * Nota tentang tamat masa: spesifikasi menyebut 30 saat sambungan dan 120 saat
 * keseluruhan. 120 saat keseluruhan akan mematikan muat turun 500 MB yang sah,
 * jadi ia dikenakan pada masa menunggu respons, dan badan diberi tamat masa
 * tidak aktif 120 saat. Sambungan yang mati tetap dibunuh, sambungan yang
 * hidup tetapi lambat dibenarkan selesai.
 */
export async function fetchRemoteToDisk(
  rawUrl: string,
  opts: { allowedMimePrefixes: string[]; maxBytes?: number | null; minFreeDiskBytes?: number; maxRedirects?: number }
): Promise<RemoteFile> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const minFree = opts.minFreeDiskBytes ?? DEFAULT_MIN_FREE;
  const resolvedIps: string[] = [];

  let url = parseHttpsUrl(rawUrl);
  let req: any;
  let res: any;

  for (let hop = 0; ; hop++) {
    const r = await openRequest(url, resolvedIps);
    const status = r.res.statusCode ?? 0;
    const location = r.res.headers?.location;
    if (status >= 300 && status < 400 && location) {
      r.res.resume();
      r.req.destroy();
      if (hop >= maxRedirects) throw new UploadGuardError(`Terlalu banyak pengalihan, maksimum ${maxRedirects}`);
      // Setiap hop disahkan semula: protokol di sini, alamat dalam lookup.
      url = parseHttpsUrl(new URL(location, url).toString());
      continue;
    }
    if (status !== 200) {
      r.res.resume();
      r.req.destroy();
      throw new UploadGuardError(`Pengambilan gagal dengan status ${status}`, 502);
    }
    req = r.req;
    res = r.res;
    break;
  }

  const dir = await mkdtemp(join(tmpdir(), 'qm-src-'));
  const tmpPath = join(dir, 'payload.bin');
  const cleanup = async () => { await rm(dir, { recursive: true, force: true }).catch(() => {}); };

  try {
    if ((await freeDiskBytes(tmpdir())) < minFree) {
      throw new UploadGuardError('Ruang cakera pelayan terlalu rendah untuk menerima muat naik ini', 507);
    }

    const head: Buffer[] = [];
    let headLen = 0;
    let bytes = 0;
    let sinceCheck = 0;
    const out = createWriteStream(tmpPath);

    await new Promise<void>((resolve, reject) => {
      let idle: NodeJS.Timeout;
      const fail = (e: any) => { clearTimeout(idle); try { out.destroy(); req.destroy(); } catch {} reject(e); };
      const resetIdle = () => {
        clearTimeout(idle);
        idle = setTimeout(() => fail(new UploadGuardError('Tiada data diterima selama 120 saat', 504)), 120_000);
      };

      resetIdle();
      res.on('data', (chunk: Buffer) => {
        resetIdle();
        bytes += chunk.length;
        sinceCheck += chunk.length;
        if (headLen < 4096) {
          const take = Math.min(chunk.length, 4096 - headLen);
          head.push(chunk.subarray(0, take));
          headLen += take;
        }
        // Content-Length tidak dipercayai. Bait sebenar yang dikira.
        if (opts.maxBytes && bytes > opts.maxBytes) {
          return fail(new UploadGuardError(`Fail melebihi had ${opts.maxBytes} bait`, 413));
        }
        if (sinceCheck >= 32 * 1024 * 1024) {
          sinceCheck = 0;
          res.pause();
          freeDiskBytes(tmpdir())
            .then((free) => {
              if (free < minFree) {
                return fail(new UploadGuardError('Muat naik dibatalkan kerana ruang cakera pelayan jatuh di bawah ambang selamat', 507));
              }
              res.resume();
            })
            .catch(() => res.resume());
        }
        if (!out.write(chunk)) {
          res.pause();
          out.once('drain', () => res.resume());
        }
      });
      res.on('error', fail);
      out.on('error', fail);
      res.on('end', () => { clearTimeout(idle); out.end(() => resolve()); });
    });

    if (bytes === 0) throw new UploadGuardError('Fail jauh kosong');

    const mimeType = sniffMime(Buffer.concat(head)) || 'application/octet-stream';
    if (!opts.allowedMimePrefixes.some((p) => mimeType.startsWith(p))) {
      throw new UploadGuardError(`Jenis fail tidak disokong: ${mimeType}`, 415);
    }

    return { tmpPath, bytes, mimeType, finalUrl: url.toString(), resolvedIps, cleanup };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
