/**
 * POST /api/classes/[id]/certificates/templates/[templateId]/apply-defaults (KZ-B)
 *
 * Salin tetapan lalai sijil pemanggil ke templat sedia ada. Badan:
 *   { include?: ('assets' | 'signer' | 'layout')[] }  lalai: semua.
 * assets: latar/logo/tandatangan lalai yang ADA disalin ke folder templat
 *   (kekangan 0066), hanya untuk pelan pemilik kelas berbayar.
 * signer: signer_name dan signer_title digabung ke fields templat.
 * layout: layout lalai menggantikan layout templat (dinormalkan).
 * Tulisan melalui klien Bearer: RLS pendidik dan pencetus pelan terpakai.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';
import { normaliseMedan } from '@/lib/sijil/medan';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { bacaTetapanLalai, layoutLalai, medanPenandatangan, salinAsetLalai } from '@/lib/sijil/tetapanLalai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Bahagian = 'assets' | 'signer' | 'layout';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; templateId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;
  if (!UUID.test(String(classId)) || !UUID.test(String(params.templateId))) return ralatJson('Not found.', 404);
  if (!dalamHad(`cert-apply-defaults:${userId}`, 20)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: 60 });
  }
  if (!(await semakPendidikKelas(auth.supa, classId, userId))) return ralatJson('Forbidden', 403);

  const template = await bacaTemplatKelas(auth.supa, params.templateId, classId);
  if (!template) return ralatJson('Certificate template not found.', 404);
  const lalai = await bacaTetapanLalai(auth.supa, userId);
  if (!lalai) return ralatJson('No certificate defaults saved yet. Save them first with set_certificate_defaults.', 404);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const semua: Bahagian[] = ['assets', 'signer', 'layout'];
  const include = Array.isArray(body.include)
    ? (body.include as unknown[]).filter((x): x is Bahagian => semua.includes(x as Bahagian))
    : semua;
  if (include.length === 0) return ralatJson('include must contain assets, signer or layout.', 400);

  const kemas: Record<string, unknown> = {};
  const digunakan: string[] = [];
  if (include.includes('signer')) {
    const p = medanPenandatangan(lalai);
    if (Object.keys(p).length > 0) {
      kemas.fields = normaliseMedan({ ...((template.fields as Record<string, unknown>) ?? {}), ...p });
      digunakan.push('signer');
    }
  }
  if (include.includes('layout')) {
    const l = layoutLalai(lalai);
    if (l) { kemas.layout = l; digunakan.push('layout'); }
  }
  const mahuAset = include.includes('assets') && !!(lalai.background_path || lalai.logo_path || lalai.signature_path);
  if (Object.keys(kemas).length === 0 && !mahuAset) {
    return ralatJson('The certificate defaults have no values for the requested parts.', 400);
  }

  let data: Record<string, unknown> | null = null;
  if (Object.keys(kemas).length > 0) {
    kemas.updated_at = new Date().toISOString();
    const r = await auth.supa
      .from('qm_certificate_templates')
      .update(kemas)
      .eq('id', params.templateId)
      .eq('class_id', classId)
      .select('id, title, criteria, background_path, logo_path, layout, fields, signature_path')
      .single();
    if (r.error || !r.data) return ralatJson(r.error?.message ?? 'Could not update the template.', 400);
    data = r.data as Record<string, unknown>;
  }

  // Aset lalai disalin ke folder templat (kekangan 0066), pelan berbayar sahaja.
  let nota: string | null = null;
  if (mahuAset) {
    const aset = await salinAsetLalai(auth.supa, lalai, classId, params.templateId, {
      background: true,
      logo: true,
      signature: true,
    });
    if (aset.dikemaskini) data = aset.dikemaskini;
    digunakan.push(...aset.disalin);
    if (aset.dilangkau_pelan) nota = 'Default assets were not applied because the class owner is on the free plan.';
  }
  if (!data) {
    const semula = await bacaTemplatKelas(auth.supa, params.templateId, classId);
    data = (semula as unknown as Record<string, unknown>) ?? {};
  }
  const { signature_path, ...lain } = data as Record<string, unknown>;
  return NextResponse.json({
    template: { ...lain, has_signature: !!signature_path },
    applied: digunakan,
    ...(nota ? { note: nota } : {}),
  });
}
