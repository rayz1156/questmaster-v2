import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';

// Tiket V2-006: halaman /naik-taraf menghantar minat pelan ke sini. Satu baris
// dimasukkan ke qm_feedback dengan type 'plan_interest' melalui klien Supabase
// milik pengguna (Bearer), bukan service role, supaya polisi RLS 0043 berkuat
// kuasa: baris miliki auth.uid() sahaja.

export const dynamic = 'force-dynamic';
// S2: force-dynamic sahaja tidak cukup untuk mencegah Next.js men-cache panggilan
// fetch klien Supabase di dalam route handler (CLAUDE.md, bahagian live quiz).
export const fetchCache = 'force-no-store';

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

    // R1: had kadar ringkas. Pengguna yang sama tidak boleh menghantar minat pelan
    // dua kali dalam 10 minit. Semakan dibaca melalui klien pengguna itu sendiri,
    // jadi RLS qm_feedback_select_own (auth.uid() = user_id) mengehadkan SELECT
    // kepada baris sendiri sahaja; baris orang lain tidak pernah nampak. Kalau
    // bacaan gagal, kami langkau had kadar dan catat di log, bukan menyekat
    // hantaran yang sah.
    const sepuluhMinitLalu = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count, error: errSemak } = await supa
      .from('qm_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'plan_interest')
      .gte('created_at', sepuluhMinitLalu);
    if (errSemak) {
      console.error('naik-taraf rate check failed, skipping', errSemak);
    } else if (count && count > 0) {
      return NextResponse.json(
        { error: 'You already sent a request recently. Please wait 10 minutes.' },
        { status: 429 },
      );
    }

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
    // S1: jangan pulangkan mesej ralat dalaman kepada klien; log di pelayan
    // sahaja dan balas dengan mesej umum, sama seperti laluan insert gagal.
    console.error('naik-taraf unexpected', e);
    return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 });
  }
}
