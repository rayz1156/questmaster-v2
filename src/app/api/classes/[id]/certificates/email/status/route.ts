/**
 * GET /api/classes/[id]/certificates/email/status (KZ-C)
 *
 * Status e-mel sijil daripada baris gilir: ?certificate_ids=a,b,c (pilihan;
 * tanpa ini, semua sijil kelas). Setiap sijil: status terkini baris gilir
 * (queued/sending/sent/retrying/failed/cancelled atau not_queued),
 * attempts, last_error, next_attempt_at, sent_at dan emailed_at sijil.
 * Bacaan melalui klien Bearer: RLS pendidik kelas.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { tapiskanIdSijil } from '@/lib/sijil/keluarkan';
import { mulaPekerja } from '@/lib/sijil/pekerjaEmel';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  if (!(await semakPendidikKelas(auth.supa, classId, auth.user!.id))) return ralatJson('Forbidden', 403);

  const ids = tapiskanIdSijil((req.nextUrl.searchParams.get('certificate_ids') ?? '').split(',').filter(Boolean));

  let qSijil = auth.supa
    .from('qm_certificates')
    .select('id, code, name_snapshot, emailed_at, revoked_at')
    .eq('class_id', classId)
    .order('issued_at', { ascending: true })
    .limit(500);
  if (ids.length > 0) qSijil = qSijil.in('id', ids);
  const { data: sijil, error } = await qSijil;
  if (error) return ralatJson(error.message, 400);

  const idSijil = (sijil ?? []).map((s) => s.id);
  const terkini = new Map<string, Record<string, unknown>>();
  if (idSijil.length > 0) {
    const { data: gilir } = await auth.supa
      .from('qm_certificate_email_queue')
      .select('certificate_id, status, attempts, last_error, next_attempt_at, sent_at, created_at')
      .in('certificate_id', idSijil)
      .order('created_at', { ascending: false });
    for (const g of gilir ?? []) {
      if (!terkini.has(String(g.certificate_id))) terkini.set(String(g.certificate_id), g);
    }
  }

  const certificates = (sijil ?? []).map((s) => {
    const g = terkini.get(s.id);
    return {
      certificate_id: s.id,
      code: s.code,
      name: s.name_snapshot,
      revoked: !!s.revoked_at,
      emailed_at: s.emailed_at,
      status: g ? g.status : s.emailed_at ? 'sent_before_queue' : 'not_queued',
      attempts: g?.attempts ?? 0,
      last_error: g?.last_error ?? null,
      next_attempt_at: g?.next_attempt_at ?? null,
      sent_at: g?.sent_at ?? null,
    };
  });
  const kiraan: Record<string, number> = {};
  for (const c of certificates) kiraan[String(c.status)] = (kiraan[String(c.status)] ?? 0) + 1;
  if ((kiraan.queued ?? 0) + (kiraan.retrying ?? 0) > 0) mulaPekerja();

  return NextResponse.json({ counts: kiraan, certificates });
}
