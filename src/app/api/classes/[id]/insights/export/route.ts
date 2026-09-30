import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, requireUser } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import {
  binaCsvInsights,
  namaFailInsights,
  separaBahagian,
} from '@/lib/insightsCsv';
import type { InsightsKelas } from '@/lib/insightsKelas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/classes/[id]/insights/export?sections=... (V2-014a)
 *
 * Eksport CSV Insights: satu bahagian (`students`, `attention`,
 * `questions`, `challenges`, `teams`, `trend`) atau `all`/senarai
 * berpisah koma. Satu bahagian memulangkan fail bahagian itu sahaja;
 * lebih satu atau semua memulangkan SATU fail dengan setiap bahagian
 * dipisahkan baris `# <Section name>` dan satu baris kosong. Tiada pakej
 * npm baharu (tiada zip).
 *
 * Kebenaran sama seperti /api/classes/[id]/insights: RPC qm_insights_kelas
 * dengan klien Bearer pemanggil. Rekod audit `insights_export` ditulis
 * melalui service role selepas RPC lulus (polisi qm_audit_log selepas
 * 0047 hanya membenarkan admin menyisip sendiri, jadi tulisan laluan
 * ialah satu-satunya cara educator direkodkan).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Tolak parameter bukan UUID (kzsec: IDOR pada [id]).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(String(params.id))) {
    return NextResponse.json({ error: 'Not a valid class id.' }, { status: 400 });
  }

  // Bahagian ditapis kepada senarai putih; sekurang-kurangnya satu sah.
  const url = new URL(req.url);
  const bahagian = separaBahagian(url.searchParams.get('sections'));
  if (bahagian.length === 0) {
    return NextResponse.json(
      { error: 'No valid sections. Use students, attention, questions, challenges, teams, trend or all.' },
      { status: 400 },
    );
  }

  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;

  // Had kadar 10 eksport seminit bagi setiap pengguna, sama seperti eksport ahli.
  if (!dalamHad(`insights-export:${user!.id}`, 10)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  // Nama kelas untuk nama fail (slug). Kelas tidak wujud: 404 generik.
  const { data: klass } = await supa
    .from('qm_classes')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!klass) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Data dan kebenaran dalam satu panggilan RPC dengan klien pemanggil.
  const { data, error } = await supa.rpc('qm_insights_kelas', {
    p_class_id: params.id,
  });
  if (error) {
    if (error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('insights export rpc failed', error);
    return NextResponse.json({ error: 'Failed to export insights.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Failed to export insights.' }, { status: 500 });
  }
  const insights = data as InsightsKelas;

  // CSV: BOM UTF-8 dan CRLF supaya Excel Windows selesa; pelindung suntikan
  // formula dan petikan RFC 4180 berada dalam insightsCsv (guna semula
  // csvPeserta), bukan disalin ke sini.
  const csv = binaCsvInsights(insights, bahagian);
  const tarikhFail = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/-/g, '');
  const namaFail = namaFailInsights(String(klass.name ?? ''), bahagian, tarikhFail);

  // Rekod audit selepas kebenaran lulus: tindakan baharu insights_export
  // dengan class_id dan bahagian. Terbaik usaha: kegagalan audit tidak
  // membatalkan eksport, hanya dilog.
  try {
    const svc = getServiceSupabase();
    const { error: auditErr } = await svc.from('qm_audit_log').insert({
      actor_id: user!.id,
      action: 'insights_export',
      target_type: 'class',
      target_id: params.id,
      meta: { sections: bahagian },
    });
    if (auditErr) {
      console.error('insights export audit failed', auditErr);
    }
  } catch (e) {
    console.error('insights export audit threw', e);
  }

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${namaFail}"`,
      'cache-control': 'no-store',
    },
  });
}
