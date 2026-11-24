/**
 * Pengesahan nama penuh oleh peserta dan token pautan nama (KZ-E).
 * Fungsi tulen (kecuali crypto); selamat untuk laluan, pekerja dan ujian.
 */
import { createHash, randomBytes } from 'node:crypto';

export { sahkanNamaPenuh } from './namaPenuhSah';
export type { HasilNama } from './namaPenuhSah';

/** Token rawak 43 aksara base64url (256 bit). Hanya hashnya disimpan. */
export function janaToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Bentuk token yang sah dalam URL (menolak awal tanpa pertanyaan DB). */
export function tokenBerbentukSah(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Hash IP dengan garam rahsia pelayan (audit tanpa menyimpan IP mentah). */
export function hashIp(ip: string): string {
  const garam = process.env.NAME_LINK_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'kuizen';
  return createHash('sha256').update(`${garam}:${ip}`, 'utf8').digest('hex').slice(0, 32);
}

export function urlKemaskiniNama(token: string): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kuizen.fun').replace(/\/$/, '');
  return `${site}/nama/${token}`;
}
