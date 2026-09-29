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
 * URL bertandatangan TIDAK dilampirkan. Had 200 emel setiap panggilan
 * (dikuatkuasakan oleh qm_certificate_email_targets). emailed_at dikemas
 * kini untuk setiap sijil yang berjaya dihantar.
 */
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';

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

  if (!dalamHad(`cert-email:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

  // Sasaran: RPC SECURITY DEFINER menyemak semula pendidik kelas dan mengapit
  // had 200. PDF mesti sudah ada (pdf_path bukan NULL).
  const { data: sasaran, error: rpcErr } = await auth.supa.rpc('qm_certificate_email_targets', {
    p_class: classId,
    p_limit: 200,
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

  let sent = 0;
  const failed: { certificate_id: string; error: string }[] = [];
  const hantar = baris.filter((b) => typeof b.email === 'string' && b.email.includes('@'));
  if (hantar.length < baris.length) {
    for (const b of baris) {
      if (!hantar.includes(b)) failed.push({ certificate_id: b.certificate_id, error: 'No email address.' });
    }
  }

  for (const b of hantar) {
    const sahUrl = `${siteUrl}/sijil/${encodeURIComponent(b.code)}`;
    const senaraiUrl = `${siteUrl}/participant/certificates`;
    const subject = `Your certificate: ${b.program_snapshot}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">Your certificate is ready</h2>
          <p style="color:#374151;line-height:1.5;">
            Congratulations! Your certificate for
            <b>${escapeHtml(b.program_snapshot)}</b> has been issued.
          </p>
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
      `Download your certificate: ${senaraiUrl}\n` +
      `Verify online with code ${b.code}: ${sahUrl}\n`;

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: b.email,
        subject,
        text,
        html,
      });
      // emailed_at dikemas kini hanya selepas penghantaran berjaya.
      const { error: updErr } = await auth.supa
        .from('qm_certificates')
        .update({ emailed_at: new Date().toISOString() })
        .eq('id', b.certificate_id);
      if (updErr) {
        failed.push({ certificate_id: b.certificate_id, error: updErr.message });
      } else {
        sent += 1;
      }
    } catch (e) {
      failed.push({
        certificate_id: b.certificate_id,
        error: e instanceof Error ? e.message : 'Send failed.',
      });
    }
  }

  return NextResponse.json({ sent, failed, total_targets: hantar.length });
}
