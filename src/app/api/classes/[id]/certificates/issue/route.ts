/**
 * POST /api/classes/[id]/certificates/issue
 *
 * Tanpa `confirm`: pratonton kelayakan daripada qm_certificate_eligibility.
 * Dengan `confirm: true`: panggil qm_issue_certificates (kelulusan dan
 * penapisan kelayakan di pangkalan data), jana PDF untuk setiap sijil
 * baharu, muat naik ke bucket `certificates` pada `<class_id>/<code>.pdf`
 * dan kemas kini `pdf_path`.
 *
 * Semakan kebenaran sentiasa dengan klien Bearer; klien service role
 * digunakan HANYA untuk storage dan bacaan selepas kebenaran disahkan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { janaPdfSijil, formatTarikhBm } from '@/lib/sijil/janaPdf';

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
  const { data: template } = await auth.supa
    .from('qm_certificate_templates')
    .select('id, class_id, title, background_path, logo_path, layout')
    .eq('id', templateId)
    .eq('class_id', classId)
    .maybeSingle();
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
  const { data: issued, error: issueErr } = await auth.supa.rpc('qm_issue_certificates', {
    p_template: templateId,
    p_participants: participantIds,
  });
  if (issueErr) {
    return NextResponse.json({ error: issueErr.message }, { status: 400 });
  }
  const ids: string[] = issued?.issued_ids ?? [];
  if (ids.length === 0) {
    return NextResponse.json({ issued: 0, certificates: [], skipped: true });
  }

  // Baca sijil baharu dengan klien service role (baca selepas kebenaran).
  const svc = getServiceSupabase();
  const { data: baris } = await svc
    .from('qm_certificates')
    .select('id, code, name_snapshot, program_snapshot, class_id, issued_at, issued_by, template_id')
    .in('id', ids);

  // Nama pengeluar untuk PDF (pendidik yang mengeluarkan sijil).
  const { data: profilPengeluar } = await svc
    .from('qm_profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  const pengeluarNama = profilPengeluar?.display_name ?? 'Kuizen';

  // Latar/logo: muat turun bait hanya jika templat memanggilnya.
  let latarBait: Uint8Array | undefined;
  let logoBait: Uint8Array | undefined;
  try {
    if (template.background_path) {
      const { data: d } = await svc.storage.from('certificate-assets').download(template.background_path);
      if (d) latarBait = new Uint8Array(await d.arrayBuffer());
    }
  } catch {
    latarBait = undefined;
  }
  try {
    if (template.logo_path) {
      const { data: d } = await svc.storage.from('certificate-assets').download(template.logo_path);
      if (d) logoBait = new Uint8Array(await d.arrayBuffer());
    }
  } catch {
    logoBait = undefined;
  }

  const layout = (template.layout ?? {}) as Record<string, string>;

  const hasil: { id: string; code: string; pdf_path: string | null }[] = [];
  for (const s of baris ?? []) {
    const namaFail = `${classId}/${s.code}.pdf`;
    const bait = await janaPdfSijil({
      nama: s.name_snapshot,
      program: s.program_snapshot,
      tarikh: formatTarikhBm(new Date(s.issued_at ?? Date.now())),
      pengeluar: pengeluarNama ?? 'Kuizen',
      kod: s.code,
      urlSah: `https://kuizen.fun/sijil/${s.code}`,
      latar: latarBait,
      logo: logoBait,
      tera: true,
      layout,
    });
    const { error: upErr } = await svc.storage
      .from('certificates')
      .upload(namaFail, bait, { contentType: 'application/pdf', upsert: true });
    if (upErr) {
      hasil.push({ id: s.id, code: s.code, pdf_path: null });
      continue;
    }
    await svc.from('qm_certificates').update({ pdf_path: namaFail }).eq('id', s.id);
    hasil.push({ id: s.id, code: s.code, pdf_path: namaFail });
  }

  return NextResponse.json({ issued: issued?.issued_count ?? 0, certificates: hasil });
}
