/**
 * POST /api/classes/[id]/name-confirmation/revoke (KZ-E)
 *
 * Batalkan token pautan nama yang masih pending bagi participant_ids yang
 * diberi atau semua peserta kelas, dan batalkan e-mel permintaan nama yang
 * belum dihantar. Badan: { participant_ids?, confirm? }. Tanpa confirm:
 * dry run (bilangan sahaja).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { pendidikKelasAktif } from '@/lib/sijil/kebenaranKelas';

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
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = Array.isArray(body.participant_ids)
    ? (body.participant_ids as unknown[]).filter((x): x is string => typeof x === 'string' && UUID.test(x))
    : null;
  if (ids && ids.length === 0) return ralatJson('participant_ids is empty.', 400);

  const svc = getServiceSupabase();
  let qToken = svc.from('qm_name_update_tokens').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('status', 'pending');
  if (ids) qToken = qToken.in('participant_id', ids);
  const { count } = await qToken;
  if (body.confirm !== true) return NextResponse.json({ dry_run: true, pending_tokens: count ?? 0 });

  let uToken = svc.from('qm_name_update_tokens').update({ status: 'revoked' }).eq('class_id', classId).eq('status', 'pending');
  if (ids) uToken = uToken.in('participant_id', ids);
  const { data: dibatal, error } = await uToken.select('id');
  if (error) return ralatJson(error.message, 500);

  let uGilir = svc
    .from('qm_certificate_email_queue')
    .update({ status: 'cancelled', last_error: 'Name confirmation revoked by educator.', updated_at: new Date().toISOString() })
    .eq('class_id', classId)
    .in('status', ['queued', 'retrying'])
    .not('name_link_purpose', 'is', null);
  if (ids) uGilir = uGilir.in('participant_id', ids);
  const { data: gilir } = await uGilir.select('id');

  return NextResponse.json({ revoked_tokens: (dibatal ?? []).length, cancelled_emails: (gilir ?? []).length });
}
