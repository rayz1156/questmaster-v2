import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { emelJemputanPendidik } from '@/lib/i18n/emel';
import { bahasaPelayan } from '@/lib/i18n/pelayan';
import { ralatJson } from '@/lib/i18n/ralatApi';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { classId, email, code } = body || {};
    if (!classId || !email || !code) {
      return ralatJson('Missing classId, email, or code', 400);
    }

    // The browser uses localStorage-based auth (no cookies). The client must
    // forward its access token via the Authorization header.
    const authHeader = req.headers.get('authorization') || '';
    const accessToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!accessToken) {
      return ralatJson('Missing access token', 401);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supa = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return ralatJson('Not authenticated', 401);
    }
    const user = userData.user;

    // Verify caller is owner of the class (using the user's RLS-scoped token)
    const { data: klass, error: kErr } = await supa
      .from('qm_classes')
      .select('id, name, owner_id')
      .eq('id', classId)
      .single();
    if (kErr || !klass) {
      return ralatJson('Class not found', 404);
    }
    if (klass.owner_id !== user.id) {
      return ralatJson('Forbidden', 403);
    }

    // Inviter display name
    const { data: profile } = await supa
      .from('qm_profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    const inviterName = profile?.display_name || user.email || 'A colleague';

    // Penghantar emel: SMTP_* (Emailit) diutamakan; BREVO_* dikekalkan sebagai
    // sandaran supaya pertukaran boleh dipatahbalikkan tanpa mengubah kod.
    const host = process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER || process.env.BREVO_SMTP_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.BREVO_SMTP_PASS;
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.BREVO_FROM_EMAIL || 'noreply@veltrix.technology';
    const fromName = process.env.SMTP_FROM_NAME || process.env.BREVO_FROM_NAME || 'Kuizen';

    if (!host || !smtpUser || !smtpPass) {
      return ralatJson('SMTP not configured', 500);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.origin}`;
    const acceptUrl = `${siteUrl}/educator/invites?code=${encodeURIComponent(code)}`;

    const transporter = nodemailer.createTransport({
      host, port, secure: false, auth: { user: smtpUser, pass: smtpPass },
    });

    // KZ-043 A6: templat dwibahasa mengikut bahasa penghantar (laluan ini
    // tidak mengenal pasti user_id penerima). Nilai di-escape dalam templat.
    const { subject, html, text } = emelJemputanPendidik(bahasaPelayan(), {
      namaPenghantar: inviterName,
      namaKelas: klass.name,
      emelPenerima: email,
      kod: code,
      pautanTerima: acceptUrl,
      pautanSesi: `${siteUrl}/educator/invites`,
    });

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
    return ralatJson(e?.message || 'failed', 500);
  }
}
