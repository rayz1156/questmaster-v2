// =====================================================================
//  Integrasi Pay ke Akademi (KZ-031).
//  Kunci API pencipta (jana, cincang, sahkan), pengesahan badan
//  pendaftaran, had kadar dalam memori, dan penghantaran e-mel akses.
//
//  Modul ini TIDAK mengimport '@/lib/supabase-route' secara statik
//  kerana fail itu mengimport next/headers; skrip ujian kendiri
//  (scripts/selftest-kz031.ts) memuatkan modul ini melalui tsx tanpa
//  konteks Next.js. getServiceSupabase diimport secara dinamik di
//  dalam fungsi yang benar-benar menyentuh DB sahaja.
// =====================================================================
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { Emails } from '@/lib/emails/templates';
import { JENAMA } from '@/lib/brand';
import { teks } from '@/i18n/teks';

// ---- Pemalar had (tiket KZ-031, bahagian had badan dan kadar) ----
export const AWALAN_KUNCI = 'ak_live_';
export const HAD_BADAN_BAIT = 8 * 1024; // badan maksimum 8 KB
export const MAX_EMEL = 254; // e-mel dipotong ke 254 aksara
export const MAX_NAMA = 120; // nama maksimum 120 aksara
export const MAX_RUJUKAN = 200; // had munasabah bagi rujukan pesanan
export const AMAUN_MIN = 0;
export const AMAUN_MAX = 100000000; // amaun_sen integer 0 hingga 100000000
export const HAD_KADAR = 60; // 60 permintaan seminit bagi setiap kunci
export const TINGKAP_KADAR_MS = 60_000;
export const TINGKAP_EMEL_MS = 10 * 60_000; // had e-mel semula: sekali setiap 10 minit
// M-01: had saiz keras peta dalam memori supaya ia tidak berkembang tanpa batas.
export const SAIZ_PETA_MAX = 5000;

// E-mel: regex munasabah (bukan RFC penuh, memadai untuk pintu masuk API)
const REGEX_EMEL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_MATA_WANG = /^[A-Z]{3}$/;

// ---- Jana kunci dan cincangan ----

/** Jana kunci API baharu: ak_live_ + 32 bait base64url. */
export function janaKunciApi(): string {
  return AWALAN_KUNCI + randomBytes(32).toString('base64url');
}

/** Awalan yang disimpan: 12 aksara pertama kunci penuh. */
export function awalanKunci(kunci: string): string {
  return kunci.slice(0, 12);
}

/** Cincangan sha256 heksadesimal bagi kunci penuh (yang disimpan di DB). */
export function cincangKunci(kunci: string): string {
  return createHash('sha256').update(kunci, 'utf8').digest('hex');
}

/** Banding dua rentetan secara masa malar (elak serangan pemasaan). */
export function bandingMasaMalar(a: string, b: string): boolean {
  const ha = Buffer.from(a, 'utf8');
  const hb = Buffer.from(b, 'utf8');
  if (ha.length !== hb.length) return false;
  return timingSafeEqual(ha, hb);
}

/** Ambil kunci daripada tajuk Authorization: Bearer, atau null. */
export function kunciDaripadaReq(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

// ---- Pengesahan badan pendaftaran ----

export interface BadanDaftar {
  course_id: string;
  email: string;
  nama: string;
  rujukan_pesanan: string | null;
  amaun_sen: number;
  mata_wang: string;
  hantar_semula: boolean;
}

/** Sahkan kunci dalam senarai aksara dibenarkan dan format base64url. */
export function formatKunciSah(kunci: string): boolean {
  return new RegExp(`^${AWALAN_KUNCI}[A-Za-z0-9_-]{43}$`).test(kunci);
}

/** Baca badan JSON dengan had saiz 8 KB. */
export async function bacaBadanTerhad(
  req: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; ralat: string }> {
  const mentah = await req.text();
  if (Buffer.byteLength(mentah, 'utf8') > HAD_BADAN_BAIT) {
    return { ok: false, ralat: 'Badan melebihi had 8 KB' };
  }
  try {
    return { ok: true, data: JSON.parse(mentah) };
  } catch {
    return { ok: false, ralat: 'Badan bukan JSON yang sah' };
  }
}

/**
 * Sahkan badan POST /api/integrasi/pay/daftar.
 * E-mel: disahkan dengan regex dan dipotong ke 254 aksara.
 * nama: maksimum 120 aksara (dipotong). rujukan_pesanan: pilihan, maksimum 200.
 * amaun_sen: integer 0 hingga 100000000. mata_wang: 3 huruf besar.
 */
export function sahkanBadanDaftar(mentah: unknown): { ok: true; badan: BadanDaftar } | { ok: false; ralat: string } {
  if (typeof mentah !== 'object' || mentah === null || Array.isArray(mentah)) {
    return { ok: false, ralat: 'Badan mesti objek JSON' };
  }
  const o = mentah as Record<string, unknown>;

  if (typeof o.course_id !== 'string' || !REGEX_UUID.test(o.course_id)) {
    return { ok: false, ralat: 'course_id tidak sah' };
  }

  if (typeof o.email !== 'string') return { ok: false, ralat: 'email diperlukan' };
  const email = o.email.trim().slice(0, MAX_EMEL);
  if (!email || !REGEX_EMEL.test(email)) {
    return { ok: false, ralat: 'email tidak sah' };
  }

  if (typeof o.nama !== 'string') return { ok: false, ralat: 'nama diperlukan' };
  const nama = o.nama.trim().slice(0, MAX_NAMA);
  if (!nama) return { ok: false, ralat: 'nama tidak boleh kosong' };

  let rujukan: string | null = null;
  if (o.rujukan_pesanan !== undefined && o.rujukan_pesanan !== null) {
    if (typeof o.rujukan_pesanan !== 'string') return { ok: false, ralat: 'rujukan_pesanan tidak sah' };
    rujukan = o.rujukan_pesanan.trim().slice(0, MAX_RUJUKAN) || null;
  }

  if (typeof o.amaun_sen !== 'number' || !Number.isInteger(o.amaun_sen)) {
    return { ok: false, ralat: 'amaun_sen mesti integer' };
  }
  if (o.amaun_sen < AMAUN_MIN || o.amaun_sen > AMAUN_MAX) {
    return { ok: false, ralat: `amaun_sen mesti antara ${AMAUN_MIN} dan ${AMAUN_MAX}` };
  }

  if (typeof o.mata_wang !== 'string') return { ok: false, ralat: 'mata_wang diperlukan' };
  const mataWang = o.mata_wang.trim().toUpperCase();
  if (!REGEX_MATA_WANG.test(mataWang)) {
    return { ok: false, ralat: 'mata_wang mesti 3 huruf besar' };
  }

  // hantar_semula: medan pilihan boolean (temuan 2 CTO). Bila true dan
  // pendaftaran sedia ada dengan source 'pay', e-mel akses dihantar semula.
  let hantarSemula = false;
  if (o.hantar_semula !== undefined && o.hantar_semula !== null) {
    if (typeof o.hantar_semula !== 'boolean') {
      return { ok: false, ralat: 'hantar_semula mesti boolean' };
    }
    hantarSemula = o.hantar_semula;
  }

  return {
    ok: true,
    badan: {
      course_id: o.course_id.toLowerCase(),
      email: email.toLowerCase(),
      nama,
      rujukan_pesanan: rujukan,
      amaun_sen: o.amaun_sen,
      mata_wang: mataWang,
      hantar_semula: hantarSemula,
    },
  };
}

// ---- Had kadar dalam memori proses (memadai per tiket) ----

const tetingkapKadar = new Map<string, number[]>();

/**
 * Semak had kadar bagi satu pengenal (id kunci). Pulangkan true jika
 * permintaan dibenarkan dan rekodkannya, false jika melebihi had.
 * masaKini boleh diinject untuk ujian.
 *
 * M-01: peta ini terkawal. Entri bagi pengenal semasa disaring setiap
 * kali, dan bila saiz peta mencapai had keras seluruh peta dibersihkan
 * daripada entri luput. Bila peta masih penuh selepas pembersihan,
 * permintaan ditolak (pemanggil memulangkan 429).
 */
export function benarkanKadar(
  pengenal: string,
  had: number = HAD_KADAR,
  tetingkapMs: number = TINGKAP_KADAR_MS,
  masaKini: number = Date.now(),
): boolean {
  const lepas = (tetingkapKadar.get(pengenal) ?? []).filter((t) => masaKini - t < tetingkapMs);
  // M-01: bila peta mencapai had saiz, buang entri luput di seluruh peta.
  if (tetingkapKadar.size >= SAIZ_PETA_MAX) {
    tetingkapKadar.forEach((v: number[], k: string) => {
      const f = v.filter((t) => masaKini - t < tetingkapMs);
      if (f.length === 0) tetingkapKadar.delete(k);
      else if (f.length !== v.length) tetingkapKadar.set(k, f);
    });
  }
  // Had saiz keras: bila peta masih penuh selepas pembersihan, tolak (429).
  if (tetingkapKadar.size >= SAIZ_PETA_MAX) return false;
  if (lepas.length >= had) {
    tetingkapKadar.set(pengenal, lepas);
    return false;
  }
  lepas.push(masaKini);
  tetingkapKadar.set(pengenal, lepas);
  return true;
}

// ---- Had e-mel akses dalam memori (temuan 2 CTO): sekali setiap 10
// ---- minit bagi setiap (kunci, e-mel, kursus) ----

const emelTerakhir = new Map<string, number>();

/** Bersihkan peta e-mel daripada entri luput bila ia mencapai had saiz (M-01). */
function bersihPetaEmel(masaKini: number): void {
  if (emelTerakhir.size < SAIZ_PETA_MAX) return;
  emelTerakhir.forEach((t: number, k: string) => {
    if (masaKini - t >= TINGKAP_EMEL_MS) emelTerakhir.delete(k);
  });
}

/**
 * Semak had penghantaran e-mel semula bagi satu pengenal
 * (kunci, e-mel, kursus). Pulangkan true jika dibenarkan dan rekodkannya;
 * false jika masih dalam tetingkap 10 minit atau peta penuh.
 * masaKini boleh diinject untuk ujian.
 */
export function benarkanEmelSemula(pengenal: string, masaKini: number = Date.now()): boolean {
  bersihPetaEmel(masaKini);
  if (emelTerakhir.size >= SAIZ_PETA_MAX) return false;
  const t = emelTerakhir.get(pengenal);
  if (t !== undefined && masaKini - t < TINGKAP_EMEL_MS) return false;
  emelTerakhir.set(pengenal, masaKini);
  return true;
}

/**
 * Rekod cop masa e-mel yang dihantar bagi pendaftaran baharu supaya
 * hantar_semula dalam tetingkap 10 minit akan ditolak.
 */
export function tandaEmelDihantar(pengenal: string, masaKini: number = Date.now()): void {
  bersihPetaEmel(masaKini);
  emelTerakhir.set(pengenal, masaKini);
}

// ---- Pengepala Content-Type (M-03) ----

/**
 * Semak pengepala Content-Type mesti application/json (suffix parameter
 * seperti charset dibenarkan). POST/PATCH memulangkan 415 jika tidak.
 */
export function contentTypeJson(req: Request): boolean {
  const ct = req.headers.get('content-type');
  if (!ct) return false;
  return ct.split(';')[0].trim().toLowerCase() === 'application/json';
}

// ---- Sahkan kunci API terhadap DB (hanya di pelayan) ----

export interface KunciSah {
  id: string;
  user_id: string;
}

/**
 * Sahkan kunci Bearer: cincang sha256, cari baris yang belum dibatalkan
 * melalui klien service_role, kemudian banding semula secara masa malar.
 * Pulangkan null untuk semua kegagalan (pemanggil memulangkan 401 generik).
 */
export async function sahkanKunciApi(req: Request): Promise<KunciSah | null> {
  const kunci = kunciDaripadaReq(req);
  if (!kunci) return null;
  const cincang = cincangKunci(kunci);
  const { getServiceSupabase } = await import('@/lib/supabase-route');
  const db = getServiceSupabase();
  const { data } = await db
    .from('lms_api_keys')
    .select('id, user_id, scope, key_hash')
    .eq('key_hash', cincang)
    .eq('scope', 'pay')
    .is('revoked_at', null)
    .maybeSingle();
  if (!data) return null;
  // Banding semula secara masa malar sebagai lapisan kedua
  if (!bandingMasaMalar(cincang, String(data.key_hash))) return null;
  return { id: String(data.id), user_id: String(data.user_id) };
}

/** Kemas kini last_used_at kunci (terbaik-effort, ralat tidak dibaling). */
export async function tandaKunciDigunakan(idKunci: string): Promise<void> {
  try {
    const { getServiceSupabase } = await import('@/lib/supabase-route');
    const db = getServiceSupabase();
    await db.from('lms_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', idKunci);
  } catch (e) {
    console.error('KZ-031: gagal kemas kini last_used_at', e);
  }
}

// ---- E-mel akses kursus ----

/** URL tapak mengikut jenama pemasangan (untuk redirectTo magic link). */
export function lamanUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  return JENAMA === 'veltrix' ? 'https://academy.veltrix.technology' : 'https://akademi.stafkita.com';
}

/**
 * Hantar e-mel akses kursus melalui SMTP sedia ada (SMTP_* atau
 * BREVO_SMTP_*). Pulangkan true jika berjaya, false jika gagal (ralat
 * dicetak; pendaftaran tidak perlu dibatalkan kerana e-mel gagal).
 */
export async function hantarEmelAksesKursus(opts: {
  kepada: string;
  nama: string;
  tajukKursus: string;
  loginUrl: string;
  akaunBaharu: boolean;
}): Promise<boolean> {
  const host = process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT || 587);
  const user = process.env.SMTP_USER || process.env.BREVO_SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.BREVO_SMTP_PASS;
  const dariEmel = process.env.SMTP_FROM_EMAIL || process.env.BREVO_FROM_EMAIL || 'noreply@airizintelligence.com';
  const dariNama = process.env.SMTP_FROM_NAME || process.env.BREVO_FROM_NAME || teks.jenama.nama;
  if (!host || !user || !pass) {
    console.error('KZ-031: SMTP tidak dikonfigurasi, e-mel akses tidak dihantar');
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({ host, port, secure: false, auth: { user, pass } });
    const emel = Emails.payAksesKursus({
      recipientName: opts.nama,
      recipientEmail: opts.kepada,
      lang: JENAMA === 'veltrix' ? 'en' : 'ms',
      courseTitle: opts.tajukKursus,
      loginUrl: opts.loginUrl,
      akaunBaharu: opts.akaunBaharu,
    });
    await transporter.sendMail({
      from: `"${dariNama}" <${dariEmel}>`,
      to: opts.kepada,
      subject: emel.subject,
      html: emel.html,
    });
    return true;
  } catch (e) {
    console.error('KZ-031: gagal hantar e-mel akses', e);
    return false;
  }
}
