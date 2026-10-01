/**
 * POST /api/classes/[id]/certificates/templates/[templateId]/copy
 *
 * Salin templat sijil kelas ini ke kelas lain yang pemanggil juga
 * pendidiknya (V2-016a). Tajuk, layout, latar/logo (RUJUKAN laluan sama,
 * tiada salinan fail) dan library_id disalin; kriteria DITETAPKAN SEMULA
 * kepada all_members kerana hunt/quiz kelas asal tidak wujud dalam kelas
 * sasaran.
 *
 * Pencetus pelan terpakai pada kelas SASARAN: jika latar dibuang kerana
 * pelan pemilik kelas sasaran, balas membawa background_removed: true.
 *
 * Body: { target_class_id }. Kebenaran: pendidik KEDUA-DUA kelas.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; templateId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const targetClassId = typeof body.target_class_id === 'string' ? body.target_class_id : '';

  if (!UUID.test(String(classId)) || !UUID.test(String(params.templateId)) || !UUID.test(targetClassId)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!dalamHad(`cert-lib-copy:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  if (targetClassId === classId) {
    return NextResponse.json({ error: 'Choose a different class.' }, { status: 400 });
  }

  // Pemanggil mesti pendidik kedua-dua kelas: sumber untuk baca templat,
  // sasaran untuk menulis templat baharu.
  const [okSumber, okSasaran] = await Promise.all([
    semakPendidikKelas(auth.supa, classId, userId),
    semakPendidikKelas(auth.supa, targetClassId, userId),
  ]);
  if (!okSumber || !okSasaran) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = await bacaTemplatKelas(auth.supa, params.templateId, classId);
  if (!template) {
    return NextResponse.json({ error: 'Certificate template not found.' }, { status: 404 });
  }

  // Sisipan melalui klien pengguna: RLS templat kelas sasaran (pendidik)
  // dan pencetus pelan (latar/gallery//library/ kelas sasaran) berkuat
  // kuasa. Kriteria ditetapkan semula kepada all_members.
  const { data: salinan, error: insErr } = await auth.supa
    .from('qm_certificate_templates')
    .insert({
      class_id: targetClassId,
      title: template.title.slice(0, 120),
      criteria: { type: 'all_members' },
      background_path: template.background_path,
      logo_path: template.logo_path,
      layout: normaliseSusunAtur(template.layout),
      // Medan isian dan imej tandatangan turut disalin (V2-016b): rujukan
      // laluan sama, tiada salinan fail; pencetus pelan kelas sasaran
      // memaksa signature_path NULL jika pemiliknya Percuma.
      fields: template.fields ?? {},
      signature_path: template.signature_path,
      library_id: template.library_id ?? null,
      created_by: userId,
    })
    .select('id, class_id, title, criteria, background_path, logo_path, layout, fields, library_id')
    .single();
  if (insErr || !salinan) {
    return NextResponse.json(
      { error: insErr?.message ?? 'Could not copy the template.' },
      { status: 400 },
    );
  }

  // Pencetus pelan mungkin memaksa latar NULL pada kelas sasaran (pelan
  // pemilik kelas sasaran percuma): laporkan kepada UI dan bukan gagal
  // secara senyap, templat tetap dicipta. Laluan logo ada dalam templat
  // yang dipulangkan supaya klien boleh bandingkan sendiri.
  const backgroundRemoved =
    template.background_path !== null && salinan.background_path === null;

  return NextResponse.json(
    { template: salinan, background_removed: backgroundRemoved },
    { status: 201 },
  );
}
