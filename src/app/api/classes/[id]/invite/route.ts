import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { email } = await req.json();
    if (!email || !/^[^@]+@[^@]+$/.test(email)) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    const cookieStore = cookies();
    const supa = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set() {}, remove() {} } }
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authed' }, { status: 401 });
    // verify ownership
    const { data: klass } = await supa.from('qm_classes').select('id, name, owner_id').eq('id', params.id).single();
    if (!klass || klass.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { data: inv, error: ie } = await supa.from('qm_class_invites').insert({ class_id: params.id, email, invited_by: user.id }).select().single();
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });
    const origin = req.nextUrl.origin;
    const link = `${origin}/join/${inv.token}`;
    const apiKey = process.env.BREVO_API_KEY;
    const sender = process.env.BREVO_SENDER_EMAIL || 'noreply@airiz.tech';
    const senderName = process.env.BREVO_SENDER_NAME || 'QuestMaster';
    if (apiKey) {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: sender, name: senderName },
          to: [{ email }],
          subject: `You\'re invited to join "${klass.name}" on QuestMaster`,
          htmlContent: `<p>Hello!</p><p>You\'ve been invited to join the class <b>${klass.name}</b> on QuestMaster.</p><p><a href="${link}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Accept invite</a></p><p>Or open this link: <a href="${link}">${link}</a></p>`
        })
      });
      if (!r.ok) { const t = await r.text(); return NextResponse.json({ error: `Brevo: ${t}` }, { status: 500 }); }
    }
    return NextResponse.json({ ok: true, token: inv.token, link, sent: !!apiKey });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unknown' }, { status: 500 });
  }
}
