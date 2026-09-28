import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';

// Tiket V2-006: halaman /naik-taraf menghantar minat pelan ke sini. Satu baris
// dimasukkan ke qm_feedback dengan type 'plan_interest' melalui klien Supabase
// milik pengguna (Bearer), bukan service role, supaya polisi RLS 0043 berkuat
// kuasa: baris miliki auth.uid() sahaja.

export const dynamic = 'force-dynamic';

type Bil = 'bulanan' | 'tahunan';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (auth.response) return auth.response;
    const user = auth.user!;
    const supa = auth.supa;

    const body = await req.json().catch(() => null);
    const pelan = String(body?.pelan || '');
    if (pelan !== 'pro' && pelan !== 'institution') {
      return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    }

    const bil: Bil = body?.bil === 'bulanan' ? 'bulanan' : 'tahunan';
    const institutionName = body?.institutionName ? String(body.institutionName).trim().slice(0, 200) : '';
    const educatorCountRaw = Number(body?.educatorCount);
    const educatorCount =
      Number.isFinite(educatorCountRaw) && educatorCountRaw > 0
        ? Math.floor(educatorCountRaw)
        : null;
    const mesej = body?.message ? String(body.message).trim().slice(0, 2000) : '';
    const page_url = body?.page_url ? String(body.page_url).slice(0, 500) : null;

    // Ringkasan medan dibina di pelayan supaya subject dan message konsisten.
    const baris: string[] = [`Plan: ${pelan === 'pro' ? 'Pro' : 'Institution'}`];
    if (pelan === 'pro') baris.push(`Billing: ${bil}`);
    if (pelan === 'institution') {
      if (institutionName) baris.push(`Institution: ${institutionName}`);
      if (educatorCount) baris.push(`Educators: ${educatorCount}`);
    }
    if (mesej) baris.push(`Message: ${mesej}`);

    const { error } = await supa.from('qm_feedback').insert({
      user_id: user.id,
      user_email: user.email ?? null,
      type: 'plan_interest',
      subject: `Minat pelan ${pelan}`,
      message: baris.join('\n'),
      page_url,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) || null,
      status: 'open',
    });

    if (error) {
      console.error('plan interest insert failed', error);
      return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
