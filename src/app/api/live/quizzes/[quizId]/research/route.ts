import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import { requireQuizHost } from '@/lib/live-quiz';
import { sahkanPelan, tetingkapT2, tetingkapT3, STANDARD_SUSULAN } from '@/lib/kajian-solo';
import {
  LAJUR_PERSETUJUAN,
  muatPelan,
  muatRekodPeserta,
  type Persetujuan,
} from '@/lib/kajian-solo-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/**
 * GET /api/live/quizzes/[quizId]/research: pelan pengukuran dan status
 * susulan setiap ahli kelas (KZ-UTT Fasa 4), untuk panel pendidik.
 */
export async function GET(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;
  const svc = getServiceSupabase();

  const pelan = await muatPelan(svc, params.quizId);
  const classId = pelan?.class_id ?? host.quiz?.class_id ?? null;
  if (!classId) {
    return NextResponse.json({ plan: null, standard: STANDARD_SUSULAN, classLinked: false, participants: [] });
  }

  const { data: ahli, error } = await svc
    .from('qm_class_members')
    .select('user_id')
    .eq('class_id', classId);
  if (error) return ralatJson(error.message, 500);
  const ids = (ahli ?? []).map((a: { user_id: string }) => a.user_id);

  const rekod = await muatRekodPeserta(svc, params.quizId, classId, ids);
  const [{ data: prof }, { data: setuju }, { data: log }] = await Promise.all([
    ids.length ? svc.from('qm_profiles').select('id, display_name').in('id', ids) : Promise.resolve({ data: [] }),
    svc.from('qm_research_consents').select(LAJUR_PERSETUJUAN).eq('quiz_id', params.quizId),
    svc
      .from('qm_research_followups')
      .select('user_id, point, seq, status, cancel_reason, due_at, sent_at, closes_at, ref_source')
      .eq('quiz_id', params.quizId)
      .order('created_at', { ascending: true }),
  ]);
  const nama = new Map((prof ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? '']));
  const pers = new Map(((setuju ?? []) as Persetujuan[]).map((p) => [p.user_id, p]));
  const t2 = pelan ? tetingkapT2(pelan) : null;

  const participants = ids.map((id) => {
    const r = rekod.get(id)!;
    const p = pers.get(id) ?? null;
    const t3 = pelan ? tetingkapT3(pelan, r) : null;
    return {
      userId: id,
      name: nama.get(id) ?? '',
      consent: p?.decision ?? null,
      unsubscribed: !!p?.unsubscribed_at,
      withdrawn: !!p?.withdrawn_at,
      t1: iso(r.t1Selesai),
      t2: iso(r.t2Selesai),
      t3: iso(r.t3Selesai),
      t3Opens: t3 ? iso(t3.buka) : null,
      t3Closes: t3 ? iso(t3.tutup) : null,
      t3RefSource: t3?.sumber ?? null,
      emails: (log ?? [])
        .filter((l: { user_id: string }) => l.user_id === id)
        .map((l: Record<string, unknown>) => ({
          point: l.point,
          seq: l.seq,
          status: l.status,
          reason: l.cancel_reason,
          dueAt: l.due_at,
          sentAt: l.sent_at,
        })),
    };
  });

  return NextResponse.json({
    plan: pelan,
    standard: STANDARD_SUSULAN,
    classLinked: true,
    t2Window: t2 ? { opens: iso(t2.buka), closes: iso(t2.tutup) } : null,
    participants,
  });
}

/**
 * PUT /api/live/quizzes/[quizId]/research, badan { module1_start_at,
 * course_end_at, emails_enabled, consent_text, day_length_sec }.
 * Kuiz mesti dalam mod ujian dan dikongsi dengan kelas. Menukar teks
 * persetujuan menaikkan versi, jadi setiap peserta diminta membaca semula.
 */
export async function PUT(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;
  const svc = getServiceSupabase();

  const { data: kuiz } = await svc
    .from('qm_live_quizzes')
    .select('id, class_id, solo_test_mode')
    .eq('id', params.quizId)
    .maybeSingle();
  if (!kuiz) return ralatJson('Quiz not found.', 404);
  if (!kuiz.solo_test_mode) return ralatJson('Turn on test mode before setting a measurement plan.', 409);
  if (!kuiz.class_id) return ralatJson('Share this quiz with a class before setting a measurement plan.', 409);

  const body = await req.json().catch(() => ({}));
  const { pelan, ralat } = sahkanPelan(body);
  if (!pelan) return ralatJson(ralat ?? 'Invalid plan.', 400);

  const lama = await muatPelan(svc, params.quizId);
  const versi =
    lama && lama.consent_text && pelan.consent_text && lama.consent_text !== pelan.consent_text
      ? lama.consent_version + 1
      : lama?.consent_version ?? 1;

  const { error } = await svc.from('qm_solo_measure_plans').upsert(
    {
      quiz_id: params.quizId,
      class_id: kuiz.class_id,
      ...pelan,
      consent_version: versi,
      updated_by: host.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'quiz_id' },
  );
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ ok: true, plan: await muatPelan(svc, params.quizId) });
}
