/**
 * POST /api/classes/[id]/certificates/templates/[templateId]/asset-upload (KZ-B)
 *
 * Lekatkan latar/logo/tandatangan pada templat sijil TANPA shell: pelayan
 * memuat turun daripada source_url (https, perlindungan SSRF) atau menerima
 * content_base64 (sehingga 1 MB). Badan:
 *   { kind: 'background' | 'logo' | 'signature',
 *     source_url? | content_base64?, remove_white_background?: boolean }
 * Aliran tiket sedia ada (asset-ticket + asset-finalize) kekal untuk klien
 * yang ada shell.
 *
 * Kebenaran dan pelan sama seperti asset-finalize: pendidik kelas, templat
 * milik kelas, pelan pemilik kelas berbayar (402).
 */
import { NextRequest, NextResponse } from 'next/server';
import { pelanSijilBerbayar, pelanPemilikKelas } from '@/lib/sijil/pelanSijil';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad, bakiSaat } from '@/lib/hadKadar';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';
import {
  RalatAset,
  bacaImejPermintaan,
  laluanAset,
  padamJikaTidakDipakai,
  simpanAset,
  type JenisAset,
} from '@/lib/sijil/asetMasuk';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAJUR: Record<JenisAset, 'background_path' | 'logo_path' | 'signature_path'> = {
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
    return ralatJson('Not found.', 404);
  }
  const kunci = `cert-asset-upload:${userId}`;
  if (!dalamHad(kunci, 10)) {
    const saat = bakiSaat(kunci);
    return ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: saat });
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return ralatJson('Forbidden', 403);

  const template = await bacaTemplatKelas(auth.supa, params.templateId, classId);
  if (!template) return ralatJson('Certificate template not found.', 404);

  if (!pelanSijilBerbayar(await pelanPemilikKelas(auth.supa, classId))) {
    return ralatJson('Certificate backgrounds, logos and signatures are available on Pro, Institution and Unlimited plans.', 402);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === 'background' || body.kind === 'logo' || body.kind === 'signature' ? body.kind : null;
  if (!kind) return ralatJson('kind must be background, logo or signature.', 400);

  let imej;
  try {
    imej = await bacaImejPermintaan(body, kind);
  } catch (e) {
    if (e instanceof RalatAset) return ralatJson(e.message, e.status);
    throw e;
  }

  const svc = getServiceSupabase();
  const path = laluanAset(`${classId}/${params.templateId}/`, kind, imej.mime);
  try {
    await simpanAset(svc, path, imej);
  } catch (e) {
    return ralatJson(e instanceof Error ? e.message : 'Could not store the image.', 500);
  }

  const lajur = LAJUR[kind];
  const lama = template[lajur] ?? null;
  // Tulis melalui klien pendidik: RLS dan pencetus pelan kekal berkuat kuasa.
  const { data: updated, error: updErr } = await auth.supa
    .from('qm_certificate_templates')
    .update({ [lajur]: path, updated_at: new Date().toISOString() })
    .eq('id', params.templateId)
    .eq('class_id', classId)
    .select('id, title, criteria, background_path, logo_path, layout, fields, signature_path')
    .single();
  if (updErr || !updated) {
    await svc.storage.from('certificate-assets').remove([path]).catch(() => undefined);
    return ralatJson(updErr?.message ?? 'Could not attach the image.', 400);
  }
  if (lama && lama !== path) await padamJikaTidakDipakai(svc, lama);

  const { signature_path, ...lain } = updated as Record<string, unknown>;
  return NextResponse.json({
    template: { ...lain, has_signature: !!signature_path },
    kind,
    bytes: imej.bytes.length,
    content_type: imej.mime,
    white_background_removed: body.remove_white_background === true,
  });
}
