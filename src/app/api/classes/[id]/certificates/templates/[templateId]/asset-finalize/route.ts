/**
 * POST /api/classes/[id]/certificates/templates/[templateId]/asset-finalize
 *
 * Sahkan muat naik latar/logo/tandatangan sijil (V2-015, V2-016b) selepas
 * klien melakukan PUT ke URL bertandatangan. Body:
 * { kind: 'background' | 'logo' | 'signature', path }.
 *
 * 1. Laluan mesti berprefiks `${classId}/${templateId}/${kind}-` (laluan
 *    sentiasa dijana asset-ticket; klien hanya memulangkannya).
 * 2. Muat turun 16 bait pertama objek dan sahkan tandatangan PNG/JPEG
 *    sebenar (jenis MIME yang diisytiharkan pada tiket tidak dipercayai).
 *    Objek yang bukan imej dipadam dan dibalas 400.
 * 3. Kemas kini background_path/logo_path/signature_path templat melalui
 *    klien pendidik (RLS); pencetus pelan kekal berkuat kuasa di pangkalan
 *    data.
 * 4. Objek lama templat dipadam daripada bucket jika laluan berbeza.
 *
 * Kebenaran: pendidik kelas, templat milik kelas, pelan pemilik kelas
 * berbayar (402 selain itu, selari asset-ticket).
 */
import { NextRequest, NextResponse } from 'next/server';
import { pelanSijilBerbayar } from '@/lib/sijil/pelanSijil';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';
import { muat16Bait, tandatanganImej } from '@/lib/sijil/aset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Medan templat yang dikemas kini mengikut kind. */
const LAJUR: Record<'background' | 'logo' | 'signature', 'background_path' | 'logo_path' | 'signature_path'> = {
  background: 'background_path',
  logo: 'logo_path',
  signature: 'signature_path',
};

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
      { error: 'Certificate backgrounds, logos and signatures are available on Pro, Institution and Unlimited plans.' },
      { status: 402 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind =
    body.kind === 'background' || body.kind === 'logo' || body.kind === 'signature'
      ? body.kind
      : null;
  const path = typeof body.path === 'string' ? body.path : '';

  if (!kind) {
    return NextResponse.json({ error: 'kind must be background, logo or signature.' }, { status: 400 });
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
  const lama =
    kind === 'background' ? template.background_path
      : kind === 'logo' ? template.logo_path
        : template.signature_path;

  // Tulis melalui klien pendidik: RLS mengecil kepada templat kelas ini
  // dan pencetus pelan kekal berkuat kuasa.
  const { data: updated, error: updErr } = await auth.supa
    .from('qm_certificate_templates')
    .update({ [lajur]: path, updated_at: new Date().toISOString() })
    .eq('id', params.templateId)
    .eq('class_id', classId)
    .select('id, title, criteria, background_path, logo_path, layout, fields, signature_path')
    .single();
  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? 'Could not attach the image.' },
      { status: 400 },
    );
  }

  // Padam objek lama hanya jika TIADA baris lain (templat kelas atau item
  // pustaka) yang masih merujuk laluannya (V2-016a: fail kini boleh
  // dikongsi antara templat, memadam buta merosakkan templat lain).
  if (lama && lama !== path) {
    const svc = getServiceSupabase();
    const { data: dipakai, error: ralatGuna } = await svc.rpc('qm_certificate_asset_in_use', { p_path: lama });
    if (!ralatGuna && dipakai === false) { // CTO: ralat RPC = jangan padam
      await svc.storage.from('certificate-assets').remove([lama]).catch(() => undefined);
    }
  }

  return NextResponse.json({ template: updated });
}
