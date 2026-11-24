/**
 * Pengesahan nama penuh oleh peserta dan token pautan nama (KZ-E).
 * Fungsi tulen (kecuali crypto); selamat untuk laluan, pekerja dan ujian.
 */
import { createHash, randomBytes } from 'node:crypto';

/** Gelaran panggilan atau hormat yang tidak dicetak sebagai nama kad pengenalan. */
const GELARAN_DITOLAK =
  /^(bro|brader|sis|kak|akak|kakak|abg|abang|bang|adik|dik|cik|encik|en|puan|pn|tuan|mr|mrs|ms|miss|madam|mdm|cikgu|ustaz|ustazah|uncle|auntie|aunty|mak|pak|haji|hajah|hj|hjh)\.?(\s|$)/i;

/** Huruf (termasuk beraksen), ruang dan ' - . @ / sahaja. */
// RegExp dengan bendera 'u' dibina melalui konstruktor (sasaran tsconfig ES5).
const AKSARA_SAH = new RegExp("^[\\p{L}\\p{M}' .@/-]+$", 'u');
const ADA_HURUF = new RegExp('\\p{L}', 'u');

export type HasilNama = { ok: true; nama: string } | { ok: false; mesej: string };

/** Sahkan nama penuh yang diisi peserta. Mesej dalam Bahasa Melayu. */
export function sahkanNamaPenuh(input: unknown): HasilNama {
  const nama = String(input ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (nama.length < 5 || nama.length > 120) {
    return { ok: false, mesej: 'Nama mesti antara 5 hingga 120 aksara.' };
  }
  if (/[0-9_]/.test(nama)) {
    return { ok: false, mesej: 'Nama tidak boleh mengandungi nombor atau garis bawah. Tulis nama penuh seperti dalam kad pengenalan.' };
  }
  if (!AKSARA_SAH.test(nama)) {
    return { ok: false, mesej: "Nama hanya boleh mengandungi huruf, ruang dan aksara ' - . @ /. Emoji dan simbol lain tidak dibenarkan." };
  }
  const perkataan = nama.split(' ').filter((w) => ADA_HURUF.test(w));
  if (perkataan.length < 2) {
    return { ok: false, mesej: 'Sila tulis nama penuh sekurang-kurangnya dua perkataan, seperti dalam kad pengenalan.' };
  }
  if (GELARAN_DITOLAK.test(nama)) {
    return { ok: false, mesej: 'Jangan mulakan nama dengan gelaran atau panggilan seperti "Bro", "Kak", "Mr." atau "Puan". Tulis nama penuh seperti dalam kad pengenalan.' };
  }
  return { ok: true, nama };
}

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
