import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { perananKelas } from '@/lib/lnaAkses';
import { sahUuid, sahOutcomeIds } from '@/lib/live-outcomes';
import { bacaJsonKecil } from '@/lib/bilikAi';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Tag dibaca semula selepas guru menyimpan; jangan biarkan cache route
// handler membekukan keadaan (corak semua laluan /api/live/**).
export const fetchCache = 'force-no-store';

/** Baris qm_live_quizzes yang dibaca di sini (tiada correct_key). */
interface KuizRingkas {
  id: string;
  class_id: string | null;
  owner_id: string;
}

/** Baris qm_learning_outcomes yang selamat dibaca. */
interface BarisOutcome {
  id: string;
  code: string | null;
  label: string;
}

/** Setiap baris dalam `outcomes` balasan GET/PUT. */
interface OutcomeTag {
  id: string;
  code: string | null;
  label: string;
  tagged: boolean;
}

/**
 * Semakan akses laluan outcomes satu kuiz:
 *  1. pengguna mesti log masuk (Bearer; 401 daripada requireUser);
 *  2. quizId mesti UUID sah dan kuiz mesti wujud; 404 generik
 *     'Quiz not found.' supaya kewujudan kuiz orang lain tidak
 *     terbongkar (kzsec: IDOR pada quizId);
 *  3. kuiz dengan kelas: pemanggil mesti guru kelas kuiz
 *     (perananKelas 'teacher'); pelajar dan bukan ahli menerima
 *     404 generik yang sama;
 *  4. kuiz tanpa kelas: tiada guru kelas; hanya pemilik kuiz
 *     dibenarkan (GET memulangkan classId null), selain itu 404.
 *
 * Semua kerja jadual selepas ini dibuat dengan service role kerana
 * qm_live_quiz_outcomes dilindungi RLS tanpa polisi.
 */
async function aksesGuru(
  req: NextRequest,
  quizId: string,
): Promise<
  | { ok: false; response: NextResponse }
  | { ok: true; svc: SupabaseClient; kuiz: KuizRingkas }
> {
  const auth = await requireUser(req);
  if (auth.response) return { ok: false, response: auth.response };
  const svc = getServiceSupabase();
  const tidakJumpa = ralatJson('Quiz not found.', 404);

  if (!sahUuid(quizId)) return { ok: false, response: tidakJumpa };

  const { data: kuiz } = (await svc
    .from('qm_live_quizzes')
    .select('id, class_id, owner_id')
    .eq('id', quizId)
    .maybeSingle()) as { data: KuizRingkas | null };
  if (!kuiz) return { ok: false, response: tidakJumpa };

  if (kuiz.class_id === null) {
    // Kuiz tanpa kelas: GET memulangkan { classId: null, outcomes: [] }
    // hanya kepada pemiliknya; PUT ditolak 400 oleh laluan.
    if (auth.user!.id !== kuiz.owner_id) return { ok: false, response: tidakJumpa };
    return { ok: true, svc, kuiz };
  }

  const peranan = await perananKelas(svc, auth.user!.id, kuiz.class_id);
  if (peranan !== 'teacher') return { ok: false, response: tidakJumpa };
  return { ok: true, svc, kuiz };
}

/**
 * Muat senarai SEMUA Outcome kelas (susun code nulls last, label)
 * bersama status tag kuiz ini. Jadual ini selamat dibaca oleh
 * laluan yang sudah mengesahkan guru kelas; correct_key
 * qm_live_questions tidak pernah disentuh di sini.
 */
async function muatTag(
  svc: SupabaseClient,
  classId: string,
  quizId: string,
): Promise<{ outcomes: OutcomeTag[] | null; error: string | null }> {
  const { data: baris, error } = (await svc
    .from('qm_learning_outcomes')
    .select('id, code, label')
    .eq('class_id', classId)
    .order('code', { ascending: true, nullsFirst: false })
    .order('label', { ascending: true })) as {
    data: BarisOutcome[] | null;
    error: { message: string } | null;
  };
  if (error) return { outcomes: null, error: error.message };

  const { data: tag, error: ralatTag } = (await svc
    .from('qm_live_quiz_outcomes')
    .select('outcome_id')
    .eq('quiz_id', quizId)) as {
    data: { outcome_id: string }[] | null;
    error: { message: string } | null;
  };
  if (ralatTag) return { outcomes: null, error: ralatTag.message };

  const ditag = new Set((tag || []).map((t) => t.outcome_id));
  return {
    outcomes: (baris || []).map((o) => ({
      id: o.id,
      code: o.code,
      label: o.label,
      tagged: ditag.has(o.id),
    })),
    error: null,
  };
}

/**
 * GET /api/live/quizzes/[quizId]/outcomes
 * { classId, outcomes: [{ id, code, label, tagged }] }
 */
export async function GET(req: NextRequest, { params }: { params: { quizId: string } }) {
  const akses = await aksesGuru(req, params.quizId);
  if (!akses.ok) return akses.response;

  if (akses.kuiz.class_id === null) {
    return NextResponse.json({ classId: null, outcomes: [] });
  }
  const { outcomes, error } = await muatTag(akses.svc, akses.kuiz.class_id, params.quizId);
  if (error) return ralatJson(error, 500);
  return NextResponse.json({ classId: akses.kuiz.class_id, outcomes });
}

/**
 * PUT /api/live/quizzes/[quizId]/outcomes
 * Badan { outcomeIds: string[] } menggantikan seluruh set tag kuiz
 * (padam yang tiada dalam senarai, upsert yang ada, weight 1).
 * Pulangkan set baharu, bentuk sama seperti GET.
 */
export async function PUT(req: NextRequest, { params }: { params: { quizId: string } }) {
  const akses = await aksesGuru(req, params.quizId);
  if (!akses.ok) return akses.response;

  if (akses.kuiz.class_id === null) {
    return ralatJson('Kongsi kuiz dengan kelas dahulu untuk memilih Outcome.', 400);
  }
  const classId = akses.kuiz.class_id;

  const badan = await bacaJsonKecil(req);
  if (!badan.ok) return badan.response;

  // sahOutcomeIds menyemak tatasusunan, had 15, format UUID setiap
  // unsur, dan membuang pendua (upsert tidak boleh melanggar PK
  // (quiz_id, outcome_id)). Nilai null bermakna badan tidak sah.
  const ids = sahOutcomeIds(badan.body.outcomeIds);
  if (!ids) {
    return ralatJson('outcomeIds must be a list of at most 15 valid Outcome IDs.', 400);
  }

  if (ids.length > 0) {
    // Semua Outcome mesti milik kelas kuiz; Outcome kelas lain,
    // walaupun milik guru yang sama, ditolak di sini dan oleh
    // pencetus migrasi 0072.
    const { data: milik, error } = (await akses.svc
      .from('qm_learning_outcomes')
      .select('id')
      .eq('class_id', classId)
      .in('id', ids)) as { data: { id: string }[] | null; error: { message: string } | null };
    if (error) return ralatJson(error.message, 500);
    if (!milik || milik.length !== ids.length) {
      return ralatJson('Every Outcome must belong to this class.', 400);
    }
  }

  // Ganti set: padam semua tag kuiz ini, kemudian upsert set baharu.
  const { error: ralatPadam } = (await akses.svc
    .from('qm_live_quiz_outcomes')
    .delete()
    .eq('quiz_id', params.quizId)) as { error: { message: string } | null };
  if (ralatPadam) return ralatJson(ralatPadam.message, 500);

  if (ids.length > 0) {
    const baris = ids.map((outcome_id) => ({ quiz_id: params.quizId, outcome_id, weight: 1 }));
    const { error: ralatUpsert } = (await akses.svc
      .from('qm_live_quiz_outcomes')
      .upsert(baris, { onConflict: 'quiz_id,outcome_id' })) as { error: { message: string } | null };
    if (ralatUpsert) return ralatJson(ralatUpsert.message, 500);
  }

  const { outcomes, error } = await muatTag(akses.svc, classId, params.quizId);
  if (error) return ralatJson(error, 500);
  return NextResponse.json({ classId: classId, outcomes });
}