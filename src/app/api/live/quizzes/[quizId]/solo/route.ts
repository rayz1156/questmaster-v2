import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import { requireQuizHost } from '@/lib/live-quiz';
import { papanSolo } from '@/lib/lumba-solo-api';
import { janaKodSolo } from '@/lib/lumba-solo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Pemalar laluan supaya GET dan POST berkongsi. */
const LAJUR_LARIAN_GURU =
  'id, nickname, user_id, score, correct, wrong, elapsed_ms, status, started_at, finished_at';

async function muatMedanSolo(quizId: string) {
  const svc = getServiceSupabase();
  const { data } = await svc
    .from('qm_live_quizzes')
    .select('id, solo_enabled, solo_code, title, class_id')
    .eq('id', quizId)
    .maybeSingle();
  return (data ?? null) as {
    id: string;
    solo_enabled: boolean | null;
    solo_code: string | null;
    title: string;
    class_id: string | null;
  } | null;
}

/** Bina pautan cabaran daripada hos permintaan (corak laluan QR). */
function pautanSolo(req: NextRequest, kod: string): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return `https://kuizen.fun/solo/${kod}`;
  const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
  return `${proto === 'http' ? 'http' : 'https'}://${host}/solo/${kod}`;
}

/**
 * GET /api/live/quizzes/[quizId]/solo: keadaan Cabaran Solo untuk panel
 * pendidik: {enabled, code, link, leaderboard, runs} (runs: 100 terkini).
 */
export async function GET(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const svc = getServiceSupabase();
  const medan = await muatMedanSolo(params.quizId);
  if (!medan) return ralatJson('Quiz not found.', 404);

  const { data: runs } = await svc
    .from('qm_solo_runs')
    .select(LAJUR_LARIAN_GURU)
    .eq('quiz_id', params.quizId)
    .order('started_at', { ascending: false })
    .limit(100);

  return NextResponse.json({
    enabled: medan.solo_enabled === true,
    code: medan.solo_code ?? null,
    link: medan.solo_code ? pautanSolo(req, medan.solo_code) : null,
    leaderboard: await papanSolo(svc, params.quizId),
    runs: (runs ?? []) as unknown as {
      id: string;
      nickname: string;
      user_id: string | null;
      score: number;
      correct: number;
      wrong: number;
      elapsed_ms: number | null;
      status: string;
      started_at: string;
      finished_at: string | null;
    }[],
  });
}

/**
 * POST /api/live/quizzes/[quizId]/solo, badan { enabled: boolean }.
 *
 * Hidup atau matikan Cabaran Solo. Bila dihidupkan kali pertama, kod solo
 * unik dijana pelayan (6 aksara tanpa 0/O/1/I); pelanggaran unik dicuba
 * semula sehingga berjaya.
 */
export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (typeof body.enabled !== 'boolean') {
    return ralatJson('enabled must be true or false.', 400);
  }

  const svc = getServiceSupabase();
  const medan = await muatMedanSolo(params.quizId);
  if (!medan) return ralatJson('Quiz not found.', 404);

  let kod = medan.solo_code;
  if (body.enabled && !kod) {
    // Jana kod unik: kemas kini bersyarat is null mengelakkan perlumbaan;
    // jika berlanggar, cuba kod baharu.
    for (let cuba = 0; cuba < 10 && !kod; cuba++) {
      const calon = janaKodSolo();
      const { data } = await svc
        .from('qm_live_quizzes')
        .update({ solo_code: calon })
        .eq('id', params.quizId)
        .is('solo_code', null)
        .select('id, solo_code')
        .maybeSingle();
      if (data?.solo_code) kod = data.solo_code;
    }
    if (!kod) return ralatJson('Could not generate a solo code.', 503);
  }

  const { error } = await svc
    .from('qm_live_quizzes')
    .update({ solo_enabled: body.enabled })
    .eq('id', params.quizId);
  if (error) return ralatJson(error.message, 500);

  return NextResponse.json({
    enabled: body.enabled,
    code: kod ?? null,
    link: kod ? pautanSolo(req, kod) : null,
  });
}