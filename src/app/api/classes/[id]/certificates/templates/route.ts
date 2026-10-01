/**
 * GET/POST/PATCH /api/classes/[id]/certificates/templates
 *
 * Pengurusan templat sijil untuk pendidik kelas. Muat naik imej latar/logo
 * dibuat terus oleh pelayar ke bucket `certificate-assets` melalui RLS
 * (polisi pendidik, migrasi 0042), jadi laluan ini hanya menyimpan laluan
 * objek dalam jadual. Pencetus qm_certificate_template_plan_guard memaksa
 * background_path/logo_path NULL untuk pelan bukan pro/institution.
 *
 * Kebenaran: pendidik kelas sahaja (semakPendidikKelas). Bahasa UI Inggeris.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';
import { normaliseMedan } from '@/lib/sijil/medan';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Kriteria templat yang diterima dari UI; mesti sepadan dengan
 * qm_certificate_eligibility (0042): all_members, hunt_completed, min_score
 * atau live_attended dengan kunci hunt_id, min_score dan quiz_id. */
type KriteriaMasuk = {
  type?: string;
  hunt_id?: string;
  min_score?: number;
  quiz_id?: string;
};

function bacaKriteria(body: Record<string, unknown>): KriteriaMasuk | null {
  const k = (body.criteria ?? {}) as Record<string, unknown>;
  const type = typeof k.type === 'string' ? k.type : '';
  if (!['all_members', 'hunt_completed', 'min_score', 'live_attended'].includes(type)) {
    return null;
  }
  const out: KriteriaMasuk = { type };
  if (type === 'hunt_completed' && typeof k.hunt_id === 'string') out.hunt_id = k.hunt_id;
  if (type === 'live_attended' && typeof k.quiz_id === 'string') {
    out.quiz_id = k.quiz_id;
  }
  if (type === 'min_score' && typeof k.min_score === 'number') out.min_score = k.min_score;
  return out;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;

  const ok = await semakPendidikKelas(auth.supa, classId, auth.user!.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await auth.supa
    .from('qm_certificate_templates')
    .select('id, title, background_path, logo_path, layout, fields, signature_path, criteria, created_at, updated_at')
    .eq('class_id', classId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // V2-016b: pulangkan medan isian dan boolean ada tandatangan; laluan
  // objek tandatangan tidak didedahkan (UI guna laluan signature-url).
  const senarai = (data ?? []).map((t: Record<string, unknown>) => {
    const { signature_path, ...lain } = t;
    return { ...lain, has_signature: !!signature_path };
  });
  return NextResponse.json({ templates: senarai });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  if (!dalamHad(`cert-tpl:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 });
  const criteria = bacaKriteria(body);
  if (!criteria) {
    return NextResponse.json(
      { error: 'criteria.type must be all_members, hunt_completed, min_score or live_attended.' },
      { status: 400 },
    );
  }

  // Latar/logo: laluan objek yang sudah dimuat naik pelayar ke
  // certificate-assets/<class_id>/; pelayan menyimpannya sahaja.
  const backgroundPath =
    typeof body.background_path === 'string' && body.background_path.startsWith(`${classId}/`)
      ? body.background_path
      : null;
  const logoPath =
    typeof body.logo_path === 'string' && body.logo_path.startsWith(`${classId}/`)
      ? body.logo_path
      : null;

  const { data, error } = await auth.supa
    .from('qm_certificate_templates')
    .insert({
      class_id: classId,
      title,
      criteria,
      background_path: backgroundPath,
      logo_path: logoPath,
      // Layout sentiasa dinormalkan (V2-015): kunci asing dibuang dan
      // semua nombor diapit sebelum disimpan.
      layout: normaliseSusunAtur(body.layout),
      created_by: userId,
    })
    .select('id, title, criteria, background_path, logo_path, layout, fields')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;

  const ok = await semakPendidikKelas(auth.supa, classId, auth.user!.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const templateId = typeof body.template_id === 'string' ? body.template_id : '';
  if (!templateId) return NextResponse.json({ error: 'template_id is required.' }, { status: 400 });
  // kzsec V2-015 S2: tolak ID yang bukan UUID sebelum sebarang pertanyaan.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId)) {
    return NextResponse.json({ error: 'Invalid template_id.' }, { status: 400 });
  }

  const kemas: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === 'string' && body.title.trim()) kemas.title = body.title.trim();
  const criteria = bacaKriteria(body);
  if (criteria) kemas.criteria = criteria;
  if (typeof body.layout === 'object' && body.layout !== null) {
    // Normalkan pada setiap tulisan layout (V2-015).
    kemas.layout = normaliseSusunAtur(body.layout);
  }
  // Medan isian (V2-016b): objek fields mengantikan keseluruhan nilai
  // lama (semantik ganti, bukan gabungan). Dibenarkan semua pelan.
  if (typeof body.fields === 'object' && body.fields !== null && !Array.isArray(body.fields)) {
    kemas.fields = normaliseMedan(body.fields);
  }
  if (body.clear_signature === true) kemas.signature_path = null;
  // Latar/logo hanya diterima sebagai laluan dalam kelas ini; pencetus pelan
  // memaksa NULL untuk pelan free.
  if (typeof body.background_path === 'string' && body.background_path.startsWith(`${classId}/`)) {
    kemas.background_path = body.background_path;
  }
  if (typeof body.logo_path === 'string' && body.logo_path.startsWith(`${classId}/`)) {
    kemas.logo_path = body.logo_path;
  }
  if (body.clear_background === true) kemas.background_path = null;
  if (body.clear_logo === true) kemas.logo_path = null;

  const { data, error } = await auth.supa
    .from('qm_certificate_templates')
    .update(kemas)
    .eq('id', templateId)
    .eq('class_id', classId)
    .select('id, title, criteria, background_path, logo_path, layout, fields, signature_path')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // has_signature supaya klien tahu imej ada tanpa laluan objek.
  const { signature_path, ...templatKini } = data ?? {};
  return NextResponse.json({ template: { ...templatKini, has_signature: !!signature_path } });
}
