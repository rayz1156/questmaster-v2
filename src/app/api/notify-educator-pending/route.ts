import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getServiceSupabase } from '@/lib/supabase-route';
import { emelPendidikMenunggu } from '@/lib/i18n/emel';
import { LOKAL, type Bahasa } from '@/lib/i18n';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, name } = await req.json();
    if (!email) return ralatJson('email required', 400);

    const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL;
    // Penghantar emel: SMTP_* (Emailit) diutamakan; BREVO_* dikekalkan sebagai
    // sandaran supaya pertukaran boleh dipatahbalikkan tanpa mengubah kod.
    const host = process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT || 587);
    const user = process.env.SMTP_USER || process.env.BREVO_SMTP_USER;
    const pass = process.env.SMTP_PASS || process.env.BREVO_SMTP_PASS;
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.BREVO_FROM_EMAIL || 'noreply@veltrix.technology';
    const fromName = process.env.SMTP_FROM_NAME || process.env.BREVO_FROM_NAME || 'Kuizen';

    if (!adminTo || !host || !user || !pass) {
      return ralatJson('SMTP not configured', 500);
    }

    const transporter = nodemailer.createTransport({ host, port, secure: false, auth: { user, pass } });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kuizen.fun';
    const approveUrl = `${siteUrl}/admin/users`;

    // KZ-043 A6: bahasa penerima ialah bahasa profil pentadbir pertama
    // (superadmin), dibaca dengan service role; sandaran English.
    let bahasaPenerima: Bahasa = 'en';
    try {
      const svc = getServiceSupabase();
      const { data: pent } = await svc
        .from('qm_profiles')
        .select('bahasa')
        .eq('role', 'superadmin')
        .limit(1);
      if (pent && pent.length > 0 && (pent[0] as { bahasa?: string }).bahasa === 'ms') {
        bahasaPenerima = 'ms';
      }
    } catch {
      // Lajur bahasa belum ada (migrasi belum diterapkan): kekal English.
    }

    // KZ-043 A6: templat dwibahasa; nama dan emel di-escape dalam templat.
    const { subject, html } = emelPendidikMenunggu(bahasaPenerima, {
      nama: name || '',
      emel: email,
      tarikhDaftar: new Date().toLocaleString(LOKAL[bahasaPenerima]),
      pautanSemak: approveUrl,
    });

    await transporter.sendMail({ from: `"${fromName}" <${fromEmail}>`, to: adminTo, subject, html });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('notify-educator-pending error', e);
    return ralatJson(e?.message || 'failed', 500);
  }
}
