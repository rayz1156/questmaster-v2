/**
 * POST /api/classes/[id]/name-confirmation (KZ-E, request_name_confirmation)
 *
 * Hantar e-mel meminta peserta mengesahkan nama penuh melalui pautan
 * /nama/<token>. Badan:
 *   participant_ids?: uuid[]; filter?: unconfirmed|flagged|all (lalai unconfirmed)
 *   mode: after_issue | before_issue
 *   template_id?: lalai templat aktif kelas
 *   email_subject?, email_body?: mengatasi templat lalai
 *   expires_in_days?: 1 hingga 90, lalai 30
 *   exclude_participant_ids?: uuid[]
 *   skip_warnings?: kod amaran (contoh ["organization","duplicate"]) untuk dilangkau
 *   confirm?: true. Tanpa ini: dry run.
 *
 * after_issue: sijil dikeluarkan sekarang (yang belum ada) dan e-mel sijil
 *   membawa pautan kemas kini nama. before_issue: e-mel tanpa sijil; sijil
 *   dikeluarkan selepas peserta mengesahkan nama. Token dicipta oleh pekerja
 *   semasa menghantar. Idempoten: peserta yang ada permintaan aktif dilangkau.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { bacaTemplatKelas, keluarkanSijil } from '@/lib/sijil/keluarkan';
import { kadarSesaat, mulaPekerja } from '@/lib/sijil/pekerjaEmel';
import { pelanEmelKelas, pendidikKelasAktif } from '@/lib/sijil/kebenaranKelas';
import { contohEmel, pesertaSedangAktif, pilihPenerima, senaraiCalon, type Mod, type Penapis } from '@/lib/sijil/permintaanNama';
import type { KodAmaranNama } from '@/lib/sijil/namaSijil';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAKS_SEKALI = 150;

function senaraiUuid(v: unknown): string[] {
  return Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && UUID.test(x)))) : [];
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;
  const classId = params.id;
  if (!UUID.test(classId)) return ralatJson('Not found', 404);
  if (!(await pendidikKelasAktif(supa, user!.id, classId))) return ralatJson('Forbidden', 403);
  if (!dalamHad(`name-confirm:${user!.id}`, 20)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: 60 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mod: Mod | null = body.mode === 'after_issue' || body.mode === 'before_issue' ? body.mode : null;
  if (!mod) return ralatJson('mode must be after_issue or before_issue.', 400);
  const penapis: Penapis = body.filter === 'flagged' || body.filter === 'all' ? body.filter : 'unconfirmed';
  const hari = Math.min(90, Math.max(1, Number.isFinite(Number(body.expires_in_days)) ? Math.round(Number(body.expires_in_days)) : 30));
  const subjek = typeof body.email_subject === 'string' && body.email_subject.trim() ? body.email_subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 200) : null;
  const isi = typeof body.email_body === 'string' && body.email_body.trim() ? body.email_body.replace(/\r\n/g, '\n').trim() : null;
  if (isi && isi.length > 8000) return ralatJson('email_body exceeds 8000 characters.', 400);
  const participantIds = body.participant_ids !== undefined ? senaraiUuid(body.participant_ids) : null;
  const kecuali = new Set(senaraiUuid(body.exclude_participant_ids));
  const kodSah: KodAmaranNama[] = ['unconfirmed', 'brackets', 'short', 'nickname', 'deleted', 'organization', 'has_digits_or_underscore', 'duplicate'];
  const langkauAmaran = new Set(
    (Array.isArray(body.skip_warnings) ? body.skip_warnings : []).filter((k): k is KodAmaranNama => kodSah.includes(k as KodAmaranNama)),
  );
  const confirm = body.confirm === true;

  // Templat: diberi (mesti kelas ini) atau aktif.
  let templateId = typeof body.template_id === 'string' && UUID.test(body.template_id) ? body.template_id : null;
  if (!templateId) {
    const { data } = await supa.from('qm_certificate_templates').select('id').eq('class_id', classId).eq('is_active', true).maybeSingle();
    templateId = (data as { id?: string } | null)?.id ?? null;
  }
  const template = templateId ? await bacaTemplatKelas(supa, templateId, classId) : null;
  if (!template) return ralatJson('No certificate template for this class. Provide template_id or set an active template.', 400);

  const svc = getServiceSupabase();
  let calon;
  try {
    calon = await senaraiCalon(supa, template.id);
  } catch (e) {
    return ralatJson(e instanceof Error ? e.message : 'Could not read participants.', 400);
  }
  const sedangAktif = await pesertaSedangAktif(svc, classId);
  const { penerima, dilangkau } = pilihPenerima(calon, { participantIds, penapis, kecuali, langkauAmaran, sedangAktif });
  const { data: kelas } = await supa.from('qm_classes').select('name').eq('id', classId).maybeSingle();

  if (!confirm) {
    return NextResponse.json({
      dry_run: true,
      mode: mod,
      filter: participantIds ? 'participant_ids' : penapis,
      template: { id: template.id, title: template.title },
      expires_in_days: hari,
      recipients_count: penerima.length,
      recipients: penerima.map((c) => ({
        participant_id: c.participant_id,
        current_name: c.current_name,
        already_issued: c.already_issued,
        warnings: c.warnings.map((w) => w.code),
      })),
      skipped_count: dilangkau.length,
      skipped: dilangkau,
      sample_email: penerima[0]
        ? await contohEmel(svc, user!.id, mod, penerima[0], template, kelas?.name ?? '', { subject: subjek, body: isi }, hari)
        : null,
      ...(penerima.length > MAKS_SEKALI ? { note: `Only ${MAKS_SEKALI} recipients are processed per call; call again to continue.` } : {}),
    });
  }

  if (!(await pelanEmelKelas(supa, classId))) {
    return ralatJson('Bulk certificate email is available on Pro and Institution plans.', 403);
  }
  if (!(process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST)) return ralatJson('SMTP not configured', 500);

  const kumpulan = penerima.slice(0, MAKS_SEKALI);
  const ids = kumpulan.map((c) => c.participant_id);
  let dikeluarkan = 0;
  const petaSijil = new Map<string, string>();
  if (mod === 'after_issue' && ids.length > 0) {
    // Keluarkan sijil yang belum ada (fungsi SQL menyemak pendidik dan kelayakan).
    const belum = kumpulan.filter((c) => !c.already_issued).map((c) => c.participant_id);
    for (let i = 0; i < belum.length; i += 50) {
      try {
        const h = await keluarkanSijil(supa, template, belum.slice(i, i + 50), user!.id);
        dikeluarkan += h.issued;
      } catch (e) {
        return ralatJson(e instanceof Error ? e.message : 'Could not issue certificates.', 400, { issued_so_far: dikeluarkan });
      }
    }
    const { data: sijil } = await svc
      .from('qm_certificates')
      .select('id, participant_id')
      .eq('template_id', template.id)
      .is('revoked_at', null)
      .in('participant_id', ids);
    for (const s of sijil ?? []) petaSijil.set(String(s.participant_id), String(s.id));
  }

  const batch = randomUUID();
  let queued = 0;
  let alreadyQueued = 0;
  const gagal: { participant_id: string; error: string }[] = [];
  for (const c of kumpulan) {
    const sijilId = mod === 'after_issue' ? petaSijil.get(c.participant_id) ?? null : null;
    if (mod === 'after_issue' && !sijilId) {
      gagal.push({ participant_id: c.participant_id, error: 'Sijil tidak dapat dikeluarkan.' });
      continue;
    }
    const { error } = await svc.from('qm_certificate_email_queue').insert({
      certificate_id: sijilId,
      class_id: classId,
      participant_id: c.participant_id,
      template_id: template.id,
      requested_by: user!.id,
      kind: mod === 'after_issue' ? 'certificate' : 'name_request',
      name_link_purpose: mod,
      name_link_days: hari,
      subject_override: subjek,
      body_override: isi,
      idempotency_key: `${c.participant_id}:${classId}:name:${mod}:${batch}`,
    });
    if (error) {
      if ((error as { code?: string }).code === '23505') alreadyQueued += 1;
      else gagal.push({ participant_id: c.participant_id, error: error.message });
      continue;
    }
    queued += 1;
  }
  mulaPekerja();

  return NextResponse.json({
    mode: mod,
    certificates_issued: dikeluarkan,
    queued,
    already_queued: alreadyQueued,
    failed: gagal,
    skipped_count: dilangkau.length,
    estimated_seconds: Math.ceil(queued / kadarSesaat()),
    ...(penerima.length > MAKS_SEKALI ? { remaining: penerima.length - MAKS_SEKALI, note: 'Call again to continue with the remaining recipients.' } : {}),
  });
}
