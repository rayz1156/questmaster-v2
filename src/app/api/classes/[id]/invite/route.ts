import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { emelJemputanKelas } from "@/lib/i18n/emel";
import { bahasaPelayan } from "@/lib/i18n/pelayan";
import { ralatJson } from '@/lib/i18n/ralatApi';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { email } = await req.json();
    if (!email || !/^[^@]+@[^@]+$/.test(email)) return ralatJson('Invalid email', 400);
    const cookieStore = cookies();
    const supa = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set() {}, remove() {} } }
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return ralatJson('Not authed', 401);
    // verify ownership
    const { data: klass } = await supa.from('qm_classes').select('id, name, owner_id').eq('id', params.id).single();
    if (!klass || klass.owner_id !== user.id) return ralatJson('Forbidden', 403);
    const { data: inv, error: ie } = await supa.from('qm_class_invites').insert({ class_id: params.id, email, invited_by: user.id }).select().single();
    if (ie) return ralatJson(ie.message, 500);
    const origin = req.nextUrl.origin;
    const link = `${origin}/join/${inv.token}`;
    const apiKey = process.env.BREVO_API_KEY;
    const sender = process.env.BREVO_SENDER_EMAIL || 'noreply@airiz.tech';
    const senderName = process.env.BREVO_SENDER_NAME || 'Kuizen';
    if (apiKey) {
      // KZ-043 A6: templat dwibahasa mengikut bahasa penghantar (penerima
      // mungkin belum ada akaun). Nama kelas di-escape dalam templat,
      // satu peningkatan berbanding HTML mentah sebelum ini.
      const { subject, html } = emelJemputanKelas(bahasaPelayan(), {
        namaKelas: klass.name,
        pautan: link,
      });
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: sender, name: senderName },
          to: [{ email }],
          subject,
          htmlContent: html
        })
      });
      if (!r.ok) { const t = await r.text(); return ralatJson(`Brevo: ${t}`, 500); }
    }
    return NextResponse.json({ ok: true, token: inv.token, link, sent: !!apiKey });
  } catch (e: any) {
    return ralatJson(e.message || 'Unknown', 500);
  }
}
