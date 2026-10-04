/**
 * POST /api/classes/[id]/certificates/email
 *
 * Emel pukal sijil yang belum emailed_at. Pendidik kelas sahaja dan pelan
 * Pro/Institusi/Unlimited disemak DI PELAYAN (bukan hanya UI). Modul emel
 * yang sama dipakai: nodemailer SMTP dengan SMTP_* diutamakan dan BREVO_*
 * sandaran (corak educator-invites/notify); tiada penyedia baharu.
 *
 * Subjek: "Your certificate: <program>". Emel membawa pautan ke
 * /participant/certificates dan pautan pengesahan awam /sijil/<kod>.
 * URL bertandatangan TIDAK dilampirkan. emailed_at dikemas
 * kini untuk setiap sijil yang berjaya dihantar.
 *
 * KZ-007: badan JSON pilihan { certificate_ids?, resend? }. Tanpa badan,
 * tingkah laku tidak berubah (semua sijil yang belum diemel). Dengan
 * certificate_ids, hanya sijil itu (UUID sah, maksimum 200); resend: true
 * membolehkan penghantaran semula sijil yang sudah diemel.
 *
 * KZ-008: PDF dilampirkan terus pada emel. Satu panggilan menghantar
 * maksimum MAKS_SEKALI (20) sasaran (p_limit) supaya laluan tidak melebihi
 * timeout nginx 60 saat; UI mengulang panggilan sehingga semua dihantar.
 * PDF dimuat turun dari bucket `certificates` dengan klien service role
 * HANYA selepas requireUser, semakPendidikKelas, semakan pelan dan RPC
 * (yang menyemak pendidik sekali lagi) berjaya. pdf_path di luar folder
 * kelas, mengandungi `..` atau bukan .pdf tidak pernah dimuat turun.
 * Muat turun gagal atau melebihi MAKS_LAMPIRAN: emel tetap dihantar tanpa
 * lampiran dan dikira dalam no_attachment. Penghantaran serentak 3 melalui
 * untukSetiap (src/lib/sijil/emelSijil.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { tapiskanIdSijil } from '@/lib/sijil/keluarkan';
import { MAKS_SEKALI, MAKS_LAMPIRAN, pathSelamat, untukSetiap } from '@/lib/sijil/emelSijil';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Escape HTML untuk badan emel (corak sedia ada dalam notify). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  // KZ-008: had kadar 20 seminit supaya gelung kelompok UI (sehingga 10
  // pusingan) dan butang per baris tidak tersekat 429.
  if (!dalamHad(`cert-email:${userId}`, 20)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // KZ-007: badan JSON pilihan; badan kosong/tidak sah bermakna semua yang
  // belum diemel (tingkah laku lama kekal).
  let certificateIds: string[] = [];
  let resend = false;
  try {
    const badan = (await req.json()) as { certificate_ids?: unknown; resend?: unknown } | null;
    if (badan && typeof badan === 'object' && !Array.isArray(badan)) {
      certificateIds = tapiskanIdSijil(badan.certificate_ids);
      resend = badan.resend === true && certificateIds.length > 0;
    }
  } catch {
    // Tiada badan atau bukan JSON: teruskan tanpa penapis sijil.
    certificateIds = [];
    resend = false;
  }

  // Semakan pelan DI PELAYAN (kzsec S1): emel pukal ialah keistimewaan
  // KELAS, jadi pelan berkesan PEMILIK kelas yang mengawal, bukan pelan
  // pendidik yang memanggil. qm_effective_plan (0040) mengendalikan tamat
  // tempoh (jatuh ke free) dan pentadbir.
  const { data: kelas } = await auth.supa
    .from('qm_classes')
    .select('owner_id')
    .eq('id', classId)
    .maybeSingle();
  const ownerId = (kelas as { owner_id?: string } | null)?.owner_id;
  let pelan = 'free';
  if (ownerId) {
    const { data: rpcPlan, error: rpcErr } = await auth.supa.rpc('qm_effective_plan', { p_user: ownerId });
    if (!rpcErr && typeof rpcPlan === 'string') pelan = rpcPlan;
  }
  if (pelan !== 'pro' && pelan !== 'institution' && pelan !== 'unlimited') {
    return NextResponse.json(
      { error: 'Bulk certificate email is available on Pro and Institution plans.' },
      { status: 403 },
    );
  }

  // Konfigurasi SMTP: SMTP_* (Emailit) diutamakan, BREVO_* sandaran.
  const host = process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER || process.env.BREVO_SMTP_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.BREVO_SMTP_PASS;
  const fromEmail =
    process.env.SMTP_FROM_EMAIL || process.env.BREVO_FROM_EMAIL || 'noreply@airizintelligence.com';
  const fromName = process.env.SMTP_FROM_NAME || process.env.BREVO_FROM_NAME || 'Kuizen';
  if (!host || !smtpUser || !smtpPass) {
    return NextResponse.json({ error: 'SMTP not configured' }, { status: 500 });
  }

  // Sasaran: RPC SECURITY DEFINER menyemak semula pendidik kelas dan
  // mengapit had MAKS_SEKALI (KZ-008: 20 setiap panggilan supaya laluan
  // tidak melebihi timeout nginx 60 saat; UI mengulang panggilan). PDF
  // mesti sudah ada (pdf_path bukan NULL). KZ-007: p_ids dan p_resend
  // membolehkan emel sijil terpilih dan penghantaran semula.
  const { data: sasaran, error: rpcErr } = await auth.supa.rpc('qm_certificate_email_targets', {
    p_class: classId,
    p_limit: MAKS_SEKALI,
    p_ids: certificateIds.length > 0 ? certificateIds : null,
    p_resend: resend,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 });
  const baris = (sasaran ?? []) as {
    certificate_id: string;
    code: string;
    name_snapshot: string;
    program_snapshot: string;
    email: string;
  }[];
  if (baris.length === 0) {
    return NextResponse.json({ sent: 0, failed: [], message: 'No certificates waiting for email.' });
  }

  // Nama kelas tidak diperlukan: subjek dibina daripada program_snapshot
  // setiap sijil.

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  // KZ-008: baca pdf_path untuk id sasaran dengan klien service role.
  // Digunakan HANYA selepas requireUser, semakPendidikKelas, semakan pelan
  // dan RPC (yang menyemak pendidik sekali lagi) berjaya. Baris yang
  // class_id !== classId dibuang (pertahanan berlapis).
  const ids = baris.map((b) => b.certificate_id);
  const svc = getServiceSupabase();
  const { data: barisPdf } = await svc
    .from('qm_certificates')
    .select('id, pdf_path, class_id')
    .in('id', ids);
  const petaPdf = new Map<string, string | null>();
  for (const r of (barisPdf ?? []) as { id: string; pdf_path: string | null; class_id: string }[]) {
    if (r.class_id === classId) petaPdf.set(r.id, r.pdf_path);
  }

  let sent = 0;
  let noAttachment = 0;
  const failed: { certificate_id: string; error: string }[] = [];
  const hantar = baris.filter((b) => typeof b.email === 'string' && b.email.includes('@'));
  if (hantar.length < baris.length) {
    for (const b of baris) {
      if (!hantar.includes(b)) failed.push({ certificate_id: b.certificate_id, error: 'No email address.' });
    }
  }

  // KZ-008: penghantaran serentak 3 (untukSetiap). Emel tanpa lampiran
  // tetap dihantar dan dikira dalam noAttachment.
  await untukSetiap(hantar, 3, async (b) => {
    const sahUrl = `${siteUrl}/sijil/${encodeURIComponent(b.code)}`;
    const senaraiUrl = `${siteUrl}/participant/certificates`;
    const subject = `Your certificate: ${b.program_snapshot}`;

    // Muat turun PDF hanya jika pdf_path selamat untuk kelas ini
    // (folder kelas, berakhir .pdf, tiada ..). Selebihnya: tanpa lampiran.
    let lampiran: { filename: string; content: Buffer; contentType: string } | null = null;
    const pdfPath = petaPdf.get(b.certificate_id);
    if (pathSelamat(pdfPath, classId)) {
      try {
        const { data: pdfData } = await svc.storage.from('certificates').download(pdfPath as string);
        if (pdfData) {
          const bait = Buffer.from(await pdfData.arrayBuffer());
          if (bait.length <= MAKS_LAMPIRAN) {
            // Nama fail HANYA guna code (aksara selamat), bukan nama peserta.
            lampiran = { filename: `Certificate-${b.code}.pdf`, content: bait, contentType: 'application/pdf' };
          }
        }
      } catch {
        lampiran = null;
      }
    }

    // Ayat badan bergantung kepada lampiran; butang dan pautan sah kekal.
    const ayatLampiran = lampiran
      ? 'Your certificate is attached to this email as a PDF.'
      : 'Download your certificate from Kuizen using the button below.';
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">Your certificate is ready</h2>
          <p style="color:#374151;line-height:1.5;">
            Congratulations! Your certificate for
            <b>${escapeHtml(b.program_snapshot)}</b> has been issued.
          </p>
          <p style="color:#374151;line-height:1.5;">${ayatLampiran}</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${senaraiUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
              Download your certificate
            </a>
          </p>
          <p style="color:#374151;line-height:1.5;font-size:13px;">
            Anyone can verify this certificate with its code
            <b>${escapeHtml(b.code)}</b> at
            <a href="${sahUrl}">${sahUrl}</a>.
          </p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px;">
            You received this because a certificate was issued to you on Kuizen.
          </p>
        </div>
      </div>`;
    const text =
      `Congratulations! Your certificate for "${b.program_snapshot}" has been issued.\n\n` +
      `${ayatLampiran}\n` +
      `Download your certificate: ${senaraiUrl}\n` +
      `Verify online with code ${b.code}: ${sahUrl}\n`;

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: b.email,
        subject,
        text,
        html,
        attachments: lampiran ? [lampiran] : undefined,
      });
      // emailed_at dikemas kini hanya selepas penghantaran berjaya.
      const { error: updErr } = await auth.supa
        .from('qm_certificates')
        .update({ emailed_at: new Date().toISOString() })
        .eq('id', b.certificate_id)
        .is('revoked_at', null);
      if (updErr) {
        failed.push({ certificate_id: b.certificate_id, error: updErr.message });
      } else {
        sent += 1;
        if (!lampiran) noAttachment += 1;
      }
    } catch (e) {
      failed.push({
        certificate_id: b.certificate_id,
        error: e instanceof Error ? e.message : 'Send failed.',
      });
    }
  });

  return NextResponse.json({
    sent,
    failed,
    total_targets: hantar.length,
    no_attachment: noAttachment,
    // more: UI mengulang panggilan selagi true (RPC mengapit MAKS_SEKALI).
    more: baris.length === MAKS_SEKALI,
  });
}
