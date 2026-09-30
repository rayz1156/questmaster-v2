/**
 * POST /api/classes/[id]/certificates/templates/[templateId]/asset-finalize
 *
 * Sahkan muat naik latar/logo sijil (V2-015) selepas klien melakukan PUT ke
 * URL bertandatangan. Body: { kind: 'background' | 'logo', path }.
 *
 * 1. Laluan mesti berprefiks `${classId}/${templateId}/${kind}-` (laluan
 *    sentiasa dijana asset-ticket; klien hanya memulangkannya).
 * 2. Muat turun 16 bait pertama objek dan sahkan tandatangan PNG/JPEG
 *    sebenar (jenis MIME yang diisytiharkan pada tiket tidak dipercayai).
 *    Objek yang bukan imej dipadam dan dibalas 400.
 * 3. Kemas kini background_path/logo_path templat melalui klien pendidik
 *    (RLS); pencetus pelan 0042 kekal berkuat kuasa di pangkalan data.
 * 4. Objek lama templat dipadam daripada bucket jika laluan berbeza.
 *
 * Kebenaran: pendidik kelas, templat milik kelas, pelan pemilik kelas
 * pro/institution (402 selain itu, selari asset-ticket).
 */
import { NextRequest, NextResponse } from 'next/server';
import { pelanSijilBerbayar } from '@/lib/sijil/pelanSijil';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Medan templat yang dikemas kini mengikut kind. */
const LAJUR: Record<'background' | 'logo', 'background_path' | 'logo_path'> = {
  background: 'background_path',
  logo: 'logo_path',
};

/**
 * Muat turun 16 bait pertama objek storage dengan header Range melalui
 * kunci service role. Versi storage-js yang dipasang tidak menyokong
 * pilihan range pada download(), jadi fetch mentah digunakan; jika pelayan
 * abaikan Range, badan penuh diterima dan hanya 16 bait pertama dibaca.
 */
async function muat16Bait(path: string): Promise<Uint8Array | null> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!base || !key) return null;
  const selamat = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${base}/storage/v1/object/certificate-assets/${selamat}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Range: 'bytes=0-15' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/** Tandatangan PNG (89 50 4E 47) atau JPEG (FF D8 FF) pada bait pertama. */
function tandatanganImej(b: Uint8Array): boolean {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  return false;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; templateId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  if (!UUID.test(String(classId)) || !UUID.test(String(params.templateId))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  if (!dalamHad(`cert-asset-finalize:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const template = await bacaTemplatKelas(auth.supa, params.templateId, classId);
  if (!template) {
    return NextResponse.json({ error: 'Certificate template not found.' }, { status: 404 });
  }

  // Pelan berkesan pemilik kelas: semak sama seperti asset-ticket supaya
  // tulisan tidak dipadam senyap oleh pencetus 0042.
  const { data: kelas } = await auth.supa
    .from('qm_classes')
    .select('owner_id')
    .eq('id', classId)
    .maybeSingle();
  const ownerId = (kelas as { owner_id?: string } | null)?.owner_id;
  let pelan = 'free';
  if (ownerId) {
    const { data: rpcPlan, error: rpcErr } = await auth.supa.rpc('qm_effective_plan', { p_user: ownerId });
    if (!rpcErr && typeof rpcPlan === 'string') pelan = rpcPlan;
  }
  if (!pelanSijilBerbayar(pelan)) {
    return NextResponse.json(
      { error: 'Certificate backgrounds and logos are available on Pro and Institution plans.' },
      { status: 402 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === 'background' || body.kind === 'logo' ? body.kind : null;
  const path = typeof body.path === 'string' ? body.path : '';

  if (!kind) {
    return NextResponse.json({ error: 'kind must be background or logo.' }, { status: 400 });
  }

  // Laluan mesti berprefiks kelas+templat+kind dan bebas path traversal.
  const prefiks = `${classId}/${params.templateId}/${kind}-`;
  if (
    !path.startsWith(prefiks)
    || path.includes('..')
    || path.startsWith('/')
    || path.includes('//')
    || path.endsWith('/')
  ) {
    return NextResponse.json(
      { error: 'Invalid path. Use the path returned by the asset ticket.' },
      { status: 400 },
    );
  }

  // Sahkan tandatangan bait pertama objek.
  const bait = await muat16Bait(path);
  if (!bait) {
    return NextResponse.json(
      { error: 'Uploaded file not found. Upload it to the signed URL first.' },
      { status: 404 },
    );
  }
  if (!tandatanganImej(bait)) {
    // Bukan PNG/JPEG: padam objek supaya bucket tidak menimpan sampah.
    const svc = getServiceSupabase();
    await svc.storage.from('certificate-assets').remove([path]).catch(() => undefined);
    return NextResponse.json(
      { error: 'The uploaded file is not a valid PNG or JPEG image.' },
      { status: 400 },
    );
  }

  const lajur = LAJUR[kind];
  // Objek lama templat untuk kolum ini, dipadam kemudian jika berbeza.
  const lama = kind === 'background' ? template.background_path : template.logo_path;

  // Tulis melalui klien pendidik: RLS mengecil kepada templat kelas ini
  // dan pencetus pelan 0042 kekal berkuat kuasa.
  const { data: updated, error: updErr } = await auth.supa
    .from('qm_certificate_templates')
    .update({ [lajur]: path, updated_at: new Date().toISOString() })
    .eq('id', params.templateId)
    .eq('class_id', classId)
    .select('id, title, criteria, background_path, logo_path, layout')
    .single();
  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? 'Could not attach the image.' },
      { status: 400 },
    );
  }

  // Padam objek lama jika berbeza daripada yang baharu.
  if (lama && lama !== path) {
    const svc = getServiceSupabase();
    await svc.storage.from('certificate-assets').remove([lama]).catch(() => undefined);
  }

  return NextResponse.json({ template: updated });
}
