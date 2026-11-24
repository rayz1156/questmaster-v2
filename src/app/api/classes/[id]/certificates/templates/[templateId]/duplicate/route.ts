/**
 * POST /api/classes/[id]/certificates/templates/[templateId]/duplicate (KZ-B)
 *
 * Salin templat sijil dalam KELAS YANG SAMA. Badan: { title? }.
 * Tajuk lalai "<tajuk asal> (salinan)". Layout, fields, kriteria,
 * library_id dan rujukan aset (laluan sama, tiada salinan fail) disalin.
 * Salinan TIDAK dijadikan templat aktif. Untuk kelas lain, guna
 * copy_certificate_template.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';
import { ralatJson } from '@/lib/i18n/ralatApi';

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
  if (!UUID.test(String(classId)) || !UUID.test(String(params.templateId))) return ralatJson('Not found.', 404);
  if (!dalamHad(`cert-tpl:${userId}`)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: 60 });
  }
  if (!(await semakPendidikKelas(auth.supa, classId, userId))) return ralatJson('Forbidden', 403);

  const asal = await bacaTemplatKelas(auth.supa, params.templateId, classId);
  if (!asal) return ralatJson('Certificate template not found.', 404);
  const { data: kriteria } = await auth.supa
    .from('qm_certificate_templates')
    .select('criteria')
    .eq('id', params.templateId)
    .maybeSingle();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tajukDiberi = typeof body.title === 'string' ? body.title.trim() : '';
  const title = (tajukDiberi || `${asal.title} (salinan)`).slice(0, 120);

  const { data, error } = await auth.supa
    .from('qm_certificate_templates')
    .insert({
      class_id: classId,
      title,
      criteria: kriteria?.criteria ?? { type: 'all_members' },
      background_path: asal.background_path,
      logo_path: asal.logo_path,
      signature_path: asal.signature_path,
      layout: asal.layout ?? {},
      fields: asal.fields ?? {},
      library_id: asal.library_id ?? null,
      created_by: userId,
    })
    .select('id, title, criteria, background_path, logo_path, layout, fields, signature_path')
    .single();
  if (error || !data) return ralatJson(error?.message ?? 'Could not duplicate the template.', 400);
  const { signature_path, ...lain } = data as Record<string, unknown>;
  return NextResponse.json({ template: { ...lain, has_signature: !!signature_path }, source_template_id: asal.id }, { status: 201 });
}
