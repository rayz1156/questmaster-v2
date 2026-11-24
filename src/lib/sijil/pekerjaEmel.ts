/**
 * Pekerja baris gilir e-mel sijil (KZ-C).
 *
 * PENYEDIA E-MEL (disahkan dalam kod, 24 Nov 2026): Emailit melalui SMTP
 * (smtp.emailit.com:587, STARTTLS), dibaca daripada SMTP_* dengan sandaran
 * BREVO_SMTP_*. Had Emailit: 2 mesej sesaat bagi setiap akaun; melebihinya
 * memulangkan "452 4.4.5 Messages per second limit exceeded (2/2)".
 * Pekerja ini menghantar satu demi satu dengan kadar EMAIL_MAX_PER_SECOND
 * (lalai 1, maksimum 1.5) supaya kekal di bawah had itu walaupun masa
 * terima di penyedia berhimpit.
 *
 * Cubaan semula:
 *   - sementara: SMTP 4xx (421, 450, 451, 452, ...), HTTP 429/5xx, dan
 *     ralat rangkaian (ETIMEDOUT, ECONNECTION, ESOCKET, ECONNRESET, EDNS).
 *     Backoff eksponen dengan jitter antara cubaan: kira-kira 2s, 4s, 8s, 16s.
 *   - kekal: SMTP 5xx (contoh alamat tidak wujud) dan ralat lain: 'failed'
 *     serta-merta tanpa cubaan semula.
 *   - paling banyak MAX_CUBAAN (5) cubaan.
 * Idempotensi: baris diambil dengan qm_claim_certificate_emails (SKIP
 * LOCKED); Message-ID ditetapkan daripada idempotency_key supaya cubaan
 * semula selepas pekerja mati tidak dikira mesej baharu oleh penerima.
 *
 * Satu pekerja bagi setiap proses Node (PM2 menjalankan satu proses).
 * Dimulakan oleh instrumentation.ts semasa pelayan bermula, dan oleh
 * laluan email/status (mulaPekerja idempoten).
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabase-route';
import { MAKS_LAMPIRAN, pathSelamat } from '@/lib/sijil/emelSijil';
import { emelSijil } from '@/lib/i18n/emel';
import { formatTarikhBm } from '@/lib/sijil/janaPdf';

export const MAX_CUBAAN = 5;

/** Kadar maksimum sesaat daripada EMAIL_MAX_PER_SECOND, diapit 0.1 hingga 1.5. */
export function kadarSesaat(): number {
  const n = Number(process.env.EMAIL_MAX_PER_SECOND ?? '1');
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(1.5, Math.max(0.1, n));
}

/** Ralat pangkalan data atau GoTrue yang sementara: sentiasa dicuba semula. */
function ralatSementara(mesej: string): Error {
  return Object.assign(new Error(mesej), { code: 'ECONNRESET' });
}

export type JenisRalat = 'sementara' | 'kekal';

/** Kelaskan ralat penghantaran (nodemailer SMTP atau API HTTP). */
export function kelaskanRalat(e: unknown): JenisRalat {
  const r = (e ?? {}) as { responseCode?: unknown; status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown };
  const smtp = Number(r.responseCode);
  if (Number.isFinite(smtp) && smtp >= 400 && smtp < 500) return 'sementara';
  if (Number.isFinite(smtp) && smtp >= 500) return 'kekal';
  const http = Number(r.status ?? r.statusCode);
  if (http === 429 || (http >= 500 && http < 600)) return 'sementara';
  const kod = String(r.code ?? '');
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNRESET', 'EDNS', 'ECONNREFUSED', 'EAI_AGAIN'].includes(kod)) {
    return 'sementara';
  }
  // Mesej tanpa kod berstruktur: cari kod SMTP 4xx di awal mesej.
  if (/^\s*4\d\d[\s-]/.test(String(r.message ?? '')) || /\b4\d\d 4\.\d\.\d\b/.test(String(r.message ?? ''))) {
    return 'sementara';
  }
  return 'kekal';
}

/** Tunda sebelum cubaan seterusnya: 2^cubaan saat dengan jitter +/-25%. */
export function tundaMs(cubaan: number, rawak: () => number = Math.random): number {
  const asas = 1000 * Math.pow(2, Math.max(1, cubaan));
  return Math.round(asas * (0.75 + 0.5 * rawak()));
}

/** Escape HTML untuk nilai yang dimasukkan ke templat. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type NilaiTemplat = {
  nama: string;
  kursus: string;
  tarikh: string;
  tempat: string;
  kod_sijil: string;
  pautan_pengesahan: string;
};

/** Gantikan {nama} {kursus} {tarikh} {tempat} {kod_sijil} {pautan_pengesahan}. */
export function isiTemplat(teks: string, nilai: NilaiTemplat, html = false): string {
  return teks.replace(/\{(nama|kursus|tarikh|tempat|kod_sijil|pautan_pengesahan)\}/g, (_m, k: keyof NilaiTemplat) =>
    html ? escapeHtml(nilai[k] ?? '') : (nilai[k] ?? ''),
  );
}

/** Bina e-mel daripada templat tersuai (subjek dan isi teks biasa). */
export function emelTersuai(subjek: string, isi: string, nilai: NilaiTemplat, adaLampiran: boolean) {
  const subject = isiTemplat(subjek, nilai).replace(/[\r\n]+/g, ' ').slice(0, 200);
  const text = isiTemplat(isi, nilai);
  const htmlIsi = escapeHtml(isiTemplat(isi, nilai))
    .split(/\n{2,}/)
    .map((p) => `<p style="color:#374151;line-height:1.5;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const pautan = escapeHtml(nilai.pautan_pengesahan);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
      <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
        ${htmlIsi}
        <p style="color:#6b7280;font-size:12px;margin-top:24px;">
          ${adaLampiran ? 'Sijil dilampirkan sebagai PDF. ' : ''}Pengesahan: <a href="${pautan}">${pautan}</a>
        </p>
      </div>
    </div>`;
  return { subject, text, html };
}

type BarisGilir = {
  id: string;
  certificate_id: string;
  class_id: string;
  requested_by: string | null;
  idempotency_key: string;
  attempts: number;
  subject_override: string | null;
  body_override: string | null;
};

let pengangkut: Transporter | null = null;
function dapatkanPengangkut(): { t: Transporter; dari: string } | null {
  const host = process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT || 587);
  const user = process.env.SMTP_USER || process.env.BREVO_SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.BREVO_SMTP_PASS;
  if (!host || !user || !pass) return null;
  if (!pengangkut) {
    pengangkut = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  const dariEmel = process.env.SMTP_FROM_EMAIL || process.env.BREVO_FROM_EMAIL || 'noreply@veltrix.technology';
  const dariNama = process.env.SMTP_FROM_NAME || process.env.BREVO_FROM_NAME || 'Kuizen';
  return { t: pengangkut, dari: `"${dariNama.replace(/"/g, '')}" <${dariEmel}>` };
}

const RE_EMEL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** Hantar satu baris. Membaling ralat untuk dikelaskan oleh pemanggil. */
async function hantarBaris(svc: SupabaseClient, b: BarisGilir): Promise<{ hasil: 'sent' | 'cancelled'; lampiran: boolean }> {
  const { data: sijil, error: sijilErr } = await svc
    .from('qm_certificates')
    .select('id, code, class_id, template_id, participant_id, name_snapshot, program_snapshot, issued_at, pdf_path, revoked_at')
    .eq('id', b.certificate_id)
    .maybeSingle();
  if (sijilErr) throw ralatSementara(`Certificate lookup failed: ${sijilErr.message}`);
  if (!sijil || sijil.revoked_at || sijil.class_id !== b.class_id) return { hasil: 'cancelled', lampiran: false };

  const { data: pengguna, error: penggunaErr } = await svc.auth.admin.getUserById(String(sijil.participant_id));
  if (penggunaErr && penggunaErr.status !== 404) throw ralatSementara(`User lookup failed: ${penggunaErr.message}`);
  const emel = pengguna?.user?.email ?? '';
  if (!emel || !RE_EMEL.test(emel)) {
    const e = new Error('No valid email address for this participant.') as Error & { responseCode?: number };
    e.responseCode = 550;
    throw e;
  }

  const smtp = dapatkanPengangkut();
  if (!smtp) {
    const e = new Error('SMTP not configured') as Error & { code?: string };
    e.code = 'ECONNECTION';
    throw e;
  }

  // Lampiran PDF (pathSelamat: folder kelas, nama selamat, .pdf).
  let lampiran: { filename: string; content: Buffer; contentType: string } | null = null;
  if (pathSelamat(sijil.pdf_path, b.class_id)) {
    try {
      const { data: pdf } = await svc.storage.from('certificates').download(String(sijil.pdf_path));
      if (pdf) {
        const bait = Buffer.from(await pdf.arrayBuffer());
        if (bait.length <= MAKS_LAMPIRAN) {
          lampiran = { filename: `Certificate-${sijil.code}.pdf`, content: bait, contentType: 'application/pdf' };
        }
      }
    } catch {
      lampiran = null;
    }
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kuizen.fun').replace(/\/$/, '');
  const sahUrl = `${siteUrl}/sijil/${encodeURIComponent(sijil.code)}`;

  // Templat: override penghantaran, kemudian tetapan lalai pendidik yang
  // meminta, kemudian templat terbina dalam mengikut bahasa penerima.
  let subjek = b.subject_override ?? '';
  let isi = b.body_override ?? '';
  let namaPengirim: string | null = null;
  let balasKe: string | null = null;
  if (b.requested_by) {
    const { data: lalai } = await svc
      .from('qm_certificate_defaults')
      .select('email_template')
      .eq('educator_id', b.requested_by)
      .maybeSingle();
    const t = (lalai?.email_template ?? {}) as Record<string, string>;
    if (!subjek && t.subject) subjek = t.subject;
    if (!isi && t.body) isi = t.body;
    if (t.from_name) namaPengirim = t.from_name;
    if (t.reply_to && RE_EMEL.test(t.reply_to)) balasKe = t.reply_to;
  }

  let kandungan: { subject: string; text: string; html: string };
  if (subjek && isi) {
    const { data: tpl } = await svc
      .from('qm_certificate_templates')
      .select('fields')
      .eq('id', sijil.template_id)
      .maybeSingle();
    const f = (tpl?.fields ?? {}) as Record<string, string>;
    const tarikh = f.date_start
      ? f.date_end && f.date_end !== f.date_start
        ? `${formatTarikhBm(new Date(f.date_start))} hingga ${formatTarikhBm(new Date(f.date_end))}`
        : formatTarikhBm(new Date(f.date_start))
      : formatTarikhBm(new Date(sijil.issued_at ?? Date.now()));
    kandungan = emelTersuai(subjek, isi, {
      nama: sijil.name_snapshot ?? '',
      kursus: sijil.program_snapshot ?? '',
      tarikh,
      tempat: f.location ?? '',
      kod_sijil: sijil.code,
      pautan_pengesahan: sahUrl,
    }, !!lampiran);
  } else {
    const { data: prof } = await svc.from('qm_profiles').select('bahasa').eq('id', sijil.participant_id).maybeSingle();
    kandungan = emelSijil(prof?.bahasa === 'ms' ? 'ms' : 'en', {
      program: sijil.program_snapshot,
      kod: sijil.code,
      senaraiUrl: `${siteUrl}/participant/certificates`,
      sahUrl,
      adaLampiran: !!lampiran,
    });
  }

  const dari = namaPengirim
    ? smtp.dari.replace(/^"[^"]*"/, `"${namaPengirim.replace(/["\r\n]/g, '')}"`)
    : smtp.dari;
  await smtp.t.sendMail({
    from: dari,
    to: emel,
    ...(balasKe ? { replyTo: balasKe } : {}),
    subject: kandungan.subject,
    text: kandungan.text,
    html: kandungan.html,
    messageId: `<${b.idempotency_key.replace(/[^A-Za-z0-9.:-]/g, '')}@kuizen.fun>`,
    attachments: lampiran ? [lampiran] : undefined,
  });

  return { hasil: 'sent', lampiran: !!lampiran };
}

/** Kemas kini baris gilir dengan cubaan semula (ralat rangkaian sekejap). */
async function denganUlang(fn: () => PromiseLike<{ error: { message: string } | null }>, apa: string): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    const { error } = await fn();
    if (!error) return;
    if (i === 3) {
      console.error(`[emel-sijil] ${apa} gagal: ${error.message}`);
      return;
    }
    await tidur(500 * (i + 1));
  }
}

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

// bangun: ditetapkan bila kerja baharu masuk semasa pekerja sedang berjalan,
// supaya pekerja tidak berhenti sejurus selepas semakan "tiada kerja" yang
// dibuat sebelum sisipan baharu di-commit (semakan bebas KZ-C S1).
type KeadaanPekerja = { berjalan: boolean; bangun: boolean };
const g = globalThis as unknown as { __kzPekerjaEmel?: KeadaanPekerja };

/** Mulakan pekerja jika belum berjalan dalam proses ini. Tidak menunggu. */
export function mulaPekerja(): void {
  if (!g.__kzPekerjaEmel) g.__kzPekerjaEmel = { berjalan: false, bangun: false };
  const k = g.__kzPekerjaEmel;
  if (k.berjalan) {
    k.bangun = true;
    return;
  }
  k.berjalan = true;
  k.bangun = false;
  void gelung(k)
    .catch((e) => console.error('[emel-sijil] pekerja berhenti kerana ralat:', e))
    .finally(() => {
      k.berjalan = false;
      // Kerja masuk semasa pekerja menamatkan diri: mulakan semula.
      if (k.bangun) mulaPekerja();
    });
}

async function gelung(k: KeadaanPekerja): Promise<void> {
  const svc = getServiceSupabase();
  const selang = Math.ceil(1000 / kadarSesaat());
  let hantarTerakhir = 0;
  for (;;) {
    const { data: kerja, error } = await svc.rpc('qm_claim_certificate_emails', { p_limit: 5 });
    if (error) {
      console.error('[emel-sijil] ambil kerja gagal:', error.message);
      await tidur(10_000);
      continue;
    }
    const senarai = (kerja ?? []) as BarisGilir[];
    if (senarai.length === 0) {
      // Masih ada baris yang menunggu masa cubaan semula? Tidur sehingga
      // yang terawal (maksimum 30 saat), jika tidak, berhenti.
      const { data: tunggu } = await svc
        .from('qm_certificate_email_queue')
        .select('next_attempt_at')
        .in('status', ['queued', 'retrying'])
        .order('next_attempt_at', { ascending: true })
        .limit(1);
      if (!tunggu || tunggu.length === 0) {
        if (k.bangun) {
          k.bangun = false;
          continue;
        }
        return;
      }
      const ms = new Date(String(tunggu[0].next_attempt_at)).getTime() - Date.now();
      await tidur(Math.min(30_000, Math.max(500, ms)));
      continue;
    }

    for (const b of senarai) {
      // Pendikit kadar: sekurang-kurangnya `selang` ms antara dua penghantaran.
      const tunggu = hantarTerakhir + selang - Date.now();
      if (tunggu > 0) await tidur(tunggu);
      hantarTerakhir = Date.now();
      let keputusan: { hasil: 'sent' | 'cancelled'; lampiran: boolean };
      try {
        keputusan = await hantarBaris(svc, b);
      } catch (e) {
        const mesej = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        const jenis = kelaskanRalat(e);
        const ulang = jenis === 'sementara' && b.attempts < MAX_CUBAAN;
        await denganUlang(
          () =>
            svc
              .from('qm_certificate_email_queue')
              .update({
                status: ulang ? 'retrying' : 'failed',
                last_error: `${jenis === 'sementara' ? '[sementara]' : '[kekal]'} ${mesej}`,
                next_attempt_at: new Date(Date.now() + (ulang ? tundaMs(b.attempts) : 0)).toISOString(),
                locked_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', b.id),
          'kemas kini ralat baris gilir',
        );
        if (jenis === 'sementara') console.warn(`[emel-sijil] ${b.certificate_id} cubaan ${b.attempts}: ${mesej}`);
        continue;
      }
      if (keputusan.hasil === 'sent') {
        // Baris gilir 'sent' dan emailed_at dalam satu transaksi (S3).
        await denganUlang(
          () => svc.rpc('qm_mark_certificate_email_sent', { p_queue: b.id, p_had_attachment: keputusan.lampiran }),
          'tanda dihantar',
        );
      } else {
        await denganUlang(
          () =>
            svc
              .from('qm_certificate_email_queue')
              .update({
                status: 'cancelled',
                last_error: 'Certificate revoked or not found.',
                locked_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', b.id),
          'tanda dibatalkan',
        );
      }
    }
  }
}

/** Tunggu sehingga semua baris id selesai (sent/failed/cancelled) atau tamat masa. */
export async function tungguSelesai(svc: SupabaseClient, idBaris: string[], hadMs: number): Promise<boolean> {
  if (idBaris.length === 0) return true;
  const tamat = Date.now() + hadMs;
  while (Date.now() < tamat) {
    const { data } = await svc
      .from('qm_certificate_email_queue')
      .select('id, status')
      .in('id', idBaris);
    const belum = (data ?? []).filter((r) => !['sent', 'failed', 'cancelled'].includes(String(r.status)));
    if (belum.length === 0) return true;
    await tidur(1000);
  }
  return false;
}
