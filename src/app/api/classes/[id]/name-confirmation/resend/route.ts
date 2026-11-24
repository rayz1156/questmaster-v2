/**
 * POST /api/classes/[id]/name-confirmation/resend (KZ-E)
 *
 * Peringatan kepada peserta yang belum mengesahkan nama: token terkini
 * berstatus pending (atau tamat tempoh) dan dicipta lebih awal daripada
 * older_than_days (lalai 7). Token baharu dicipta semasa menghantar dan
 * token lama dibatalkan. Badan: { older_than_days?, expires_in_days?,
 * participant_ids?, confirm? }. Tanpa confirm: dry run.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { kadarSesaat, mulaPekerja } from '@/lib/sijil/pekerjaEmel';
import { pelanEmelKelas, pendidikKelasAktif } from '@/lib/sijil/kebenaranKelas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;
  const classId = params.id;
  if (!UUID.test(classId)) return ralatJson('Not found', 404);
  if (!(await pendidikKelasAktif(supa, user!.id, classId))) return ralatJson('Forbidden', 403);
  if (!dalamHad(`name-resend:${user!.id}`, 10)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: 60 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const lebihHari = Math.max(0, Number.isFinite(Number(body.older_than_days)) ? Number(body.older_than_days) : 7);
  const hari = Math.min(90, Math.max(1, Number.isFinite(Number(body.expires_in_days)) ? Math.round(Number(body.expires_in_days)) : 30));
  const hadPeserta = Array.isArray(body.participant_ids)
    ? new Set((body.participant_ids as unknown[]).filter((x): x is string => typeof x === 'string'))
    : null;

  const svc = getServiceSupabase();
  const { data: token, error } = await svc
    .from('qm_name_update_tokens')
    .select('participant_id, certificate_id, template_id, purpose, status, created_at, expires_at, failed_attempts, superseded')
    .eq('class_id', classId)
    .order('created_at', { ascending: false });
  if (error) return ralatJson(error.message, 500);
  // Token terkini bagi setiap peserta.
  const terkini = new Map<string, Record<string, string | number | boolean | null>>();
  for (const t of token ?? []) if (!terkini.has(String(t.participant_id))) terkini.set(String(t.participant_id), t);
  const sempadan = Date.now() - lebihHari * 86_400_000;
  const calon = Array.from(terkini.values()).filter(
    (t) =>
      // Pending, tamat tempoh, atau dikunci selepas 5 cubaan gagal (bukan
      // dibatalkan oleh pendidik).
      (t.status === 'pending' || t.status === 'expired' ||
        (t.status === 'revoked' && !t.superseded && Number(t.failed_attempts) >= 5)) &&
      new Date(String(t.created_at)).getTime() <= sempadan &&
      (!hadPeserta || hadPeserta.has(String(t.participant_id))),
  );

  if (body.confirm !== true) {
    return NextResponse.json({ dry_run: true, older_than_days: lebihHari, reminders: calon.length, participant_ids: calon.map((t) => t.participant_id) });
  }
  if (!(await pelanEmelKelas(supa, classId))) return ralatJson('Bulk certificate email is available on Pro and Institution plans.', 403);

  const batch = randomUUID();
  let queued = 0;
  let alreadyQueued = 0;
  for (const t of calon) {
    const selepas = t.purpose === 'after_issue' && t.certificate_id;
    const { error: e } = await svc.from('qm_certificate_email_queue').insert({
      certificate_id: selepas ? String(t.certificate_id) : null,
      class_id: classId,
      participant_id: t.participant_id,
      template_id: t.template_id,
      requested_by: user!.id,
      kind: selepas ? 'certificate' : 'name_request',
      name_link_purpose: selepas ? 'after_issue' : 'before_issue',
      name_link_days: hari,
      idempotency_key: `${t.participant_id}:${classId}:name-reminder:${batch}`,
    });
    if (e) {
      if ((e as { code?: string }).code === '23505') alreadyQueued += 1;
      continue;
    }
    queued += 1;
  }
  mulaPekerja();
  return NextResponse.json({ queued, already_queued: alreadyQueued, estimated_seconds: Math.ceil(queued / kadarSesaat()) });
}
