/**
 * POST /api/classes/[id]/certificates/issue
 *
 * Tanpa `confirm`: pratonton kelayakan daripada qm_certificate_eligibility.
 * Dengan `confirm: true`: keluarkan sijil melalui keluarkanSijil() dari
 * src/lib/sijil/keluarkan.ts (fungsi yang sama dipakai oleh alat MCP
 * issue_certificates), jana PDF untuk setiap sijil baharu, muat naik ke
 * bucket `certificates` pada `<class_id>/<code>.pdf` dan kemas kini
 * pdf_path.
 *
 * Semakan kebenaran sentiasa dengan klien Bearer; klien service role
 * digunakan HANYA untuk storage dan bacaan selepas kebenaran disahkan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaTemplatKelas, keluarkanSijil } from '@/lib/sijil/keluarkan';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  if (!dalamHad(`cert-issue:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const templateId = typeof body.template_id === 'string' ? body.template_id : '';
  const confirm = body.confirm === true;
  const participantIds: string[] | null = Array.isArray(body.participant_ids)
    ? body.participant_ids.filter((x: unknown) => typeof x === 'string')
    : null;
  if (!templateId) {
    return NextResponse.json({ error: 'template_id is required.' }, { status: 400 });
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Templat mesti milik kelas ini.
  const template = await bacaTemplatKelas(auth.supa, templateId, classId);
  if (!template) {
    return NextResponse.json({ error: 'Certificate template not found.' }, { status: 404 });
  }

  // ------------------------------------------------------------------
  // Pratonton: tanpa confirm, pulangkan senarai kelayakan sahaja.
  // ------------------------------------------------------------------
  if (!confirm) {
    const { data, error } = await auth.supa.rpc('qm_certificate_eligibility', {
      p_template: templateId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ preview: data ?? [] });
  }

  // ------------------------------------------------------------------
  // Pengeluaran: fungsi SQL menyemak semula kebenaran dan kelayakan.
  // ------------------------------------------------------------------
  try {
    const hasil = await keluarkanSijil(auth.supa, template, participantIds, userId);
    return NextResponse.json({
      issued: hasil.issued,
      certificates: hasil.certificates,
      ...(hasil.skipped ? { skipped: true } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not issue certificates.' },
      { status: 400 },
    );
  }
}
