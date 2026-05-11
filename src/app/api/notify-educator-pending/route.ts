import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, name } = await req.json();
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

    const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL;
    const host = process.env.BREVO_SMTP_HOST;
    const port = Number(process.env.BREVO_SMTP_PORT || 587);
    const user = process.env.BREVO_SMTP_USER;
    const pass = process.env.BREVO_SMTP_PASS;
    const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@airizintelligence.com';
    const fromName = process.env.BREVO_FROM_NAME || 'Kuizen';

    if (!adminTo || !host || !user || !pass) {
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({ host, port, secure: false, auth: { user, pass } });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kuizen.veltrix.technology';
    const approveUrl = `${siteUrl}/admin/users`;

    const subject = `[Kuizen] New educator pending approval: ${name || email}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">New Educator Awaiting Approval</h2>
          <p style="color:#374151;">A new educator has registered on Kuizen and is awaiting your approval.</p>
          <table style="width:100%;margin:16px 0;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#6b7280;">Name:</td><td style="padding:6px 0;color:#111827;font-weight:600;">${name || '(not provided)'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Email:</td><td style="padding:6px 0;color:#111827;font-weight:600;">${email}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Registered:</td><td style="padding:6px 0;color:#111827;">${new Date().toLocaleString()}</td></tr>
          </table>
          <a href="${approveUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Review &amp; Approve</a>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Kuizen Admin Notification</p>
        </div>
      </div>`;

    await transporter.sendMail({ from: `"${fromName}" <${fromEmail}>`, to: adminTo, subject, html });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('notify-educator-pending error', e);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
