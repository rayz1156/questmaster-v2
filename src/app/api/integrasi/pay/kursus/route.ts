// KZ-031: GET /api/integrasi/pay/kursus (pelayan ke pelayan).
// Senarai kursus milik pemilik kunci melalui lms_creators.owner_id.
// Tanpa kunci, kunci salah atau kunci dibatalkan: 401 generik.
import { NextRequest, NextResponse } from 'next/server';
import { benarkanKadar, sahkanKunciApi, tandaKunciDigunakan } from '@/lib/integrasi-pay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // a. Sahkan kunci Bearer (401 generik untuk semua kegagalan)
    const kunci = await sahkanKunciApi(req);
    if (!kunci) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!benarkanKadar(kunci.id)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { getServiceSupabase } = await import('@/lib/supabase-route');
    const db = getServiceSupabase();

    const { data: pencipta } = await db
      .from('lms_creators')
      .select('id')
      .eq('owner_id', kunci.user_id)
      .maybeSingle();
    if (!pencipta) {
      await tandaKunciDigunakan(kunci.id);
      return NextResponse.json({ kursus: [] });
    }

    const { data, error } = await db
      .from('lms_courses')
      .select('id, title, slug, is_published, price_cents, currency')
      .eq('creator_id', pencipta.id)
      .order('title');
    if (error) {
      console.error('KZ-031 kursus: ralat queri', error.message);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    await tandaKunciDigunakan(kunci.id);
    return NextResponse.json({ kursus: data ?? [] });
  } catch (e) {
    console.error('KZ-031 kursus: ralat tidak dijangka', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
