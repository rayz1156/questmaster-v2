import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { classId, email, code } = body || {};
    if (!classId || !email || !code) {
      return NextResponse.json({ error: 'Missing classId, email, or code' }, { status: 400 });
    }

    // The browser uses localStorage-based auth (no cookies). The client must
    // forward its access token via the Authorization header.
    const authHeader = req.headers.get('authorization') || '';
    const accessToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supa = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const user = userData.user;

    // Verify caller is owner of the class (using the user's RLS-scoped token)
    const { data: klass, error: kErr } = await supa
      .from('qm_classes')
      .select('id, name, owner_id')
      .eq('id', classId)
      .single();
    if (kErr || !klass) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    if (klass.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Inviter display name
    const { data: profile } = await supa
      .from('qm_profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    const inviterName = profile?.display_name || user.email || 'A colleague';

    const host = process.env.BREVO_SMTP_HOST;
    const port = Number(process.env.BREVO_SMTP_PORT || 587);
    const smtpUser = process.env.BREVO_SMTP_USER;
    const smtpPass = process.env.BREVO_SMTP_PASS;
    const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@airizintelligence.com';
    const fromName = process.env.BREVO_FROM_NAME || 'Cendekia';

    if (!host || !smtpUser || !smtpPass) {
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.origin}`;
    const acceptUrl = `${siteUrl}/educator/invites?code=${encodeURIComponent(code)}`;

    const transporter = nodemailer.createTransport({
      host, port, secure: false, auth: { user: smtpUser, pass: smtpPass },
    });

    const subject = `[Cendekia] You're invited to co-teach "${klass.name}"`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">Educator invite</h2>
          <p style="color:#374151;line-height:1.5;">Hello,</p>
          <p style="color:#374151;line-height:1.5;">
            <b>${escapeHtml(inviterName)}</b> has invited you to co-teach the class
            <b>${escapeHtml(klass.name)}</b> on Cendekia.
          </p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${acceptUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
              Accept invite
            </a>
          </p>
          <p style="color:#374151;line-height:1.5;font-size:13px;">
            If the button doesn't work, sign in to Cendekia using
            <b>${escapeHtml(email)}</b> and paste this 8-character code at
            <a href="${siteUrl}/educator/invites">${siteUrl}/educator/invites</a>:
          </p>
          <div style="text-align:center;margin:16px 0;">
            <code style="display:inline-block;font-family:monospace;font-size:22px;letter-spacing:4px;background:#f3f4f6;color:#111827;padding:12px 20px;border-radius:8px;border:1px solid #e5e7eb;">${escapeHtml(code)}</code>
          </div>
          <p style="color:#6b7280;font-size:12px;margin-top:24px;">
            You received this because someone invited you as an educator on Cendekia.
            If this wasn't expected, you can ignore this email.
          </p>
        </div>
      </div>`;
    const text =
      `${inviterName} invited you to co-teach "${klass.name}" on Cendekia.\n\n` +
      `Accept link: ${acceptUrl}\n\n` +
      `If the link doesn't work, sign in with ${email} and paste this code at ${siteUrl}/educator/invites :\n` +
      `${code}\n`;

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject,
      text,
      html,
    });

    return NextResponse.json({ ok: true, sent: true, link: acceptUrl });
  } catch (e: any) {
    console.error('educator-invites/notify error', e);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
