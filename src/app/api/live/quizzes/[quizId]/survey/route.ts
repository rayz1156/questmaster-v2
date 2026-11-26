import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import { requireQuizHost } from '@/lib/live-quiz';
import { sahkanItemTinjauan, TINJAUAN_MAX_ITEM, type ItemTinjauan } from '@/lib/lumba-solo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const LAJUR_ITEM = 'id, position, code, construct, prompt, scale_min, scale_max, label_min, label_max, points';

/** Bilangan jawapan tinjauan yang sudah wujud bagi item kuiz ini. */
async function bilanganJawapan(quizId: string): Promise<number> {
  const svc = getServiceSupabase();
  const { data: item } = await svc.from('qm_solo_survey_items').select('id').eq('quiz_id', quizId);
  const ids = (item ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return 0;
  const { count } = await svc
    .from('qm_solo_survey_answers')
    .select('item_id', { count: 'exact', head: true })
    .in('item_id', ids);
  return count ?? 0;
}

/**
 * GET /api/live/quizzes/[quizId]/survey: item tinjauan mod ujian
 * (KZ-UTT Fasa 2) untuk panel pendidik, dengan `locked` jika sudah ada
 * jawapan peserta.
 */
export async function GET(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from('qm_solo_survey_items')
    .select(LAJUR_ITEM)
    .eq('quiz_id', params.quizId)
    .order('position', { ascending: true });
  if (error) return ralatJson(error.message, 500);
  const jawapan = await bilanganJawapan(params.quizId);
  return NextResponse.json({ items: data ?? [], locked: jawapan > 0, responses: jawapan });
}

/**
 * PUT /api/live/quizzes/[quizId]/survey, badan { items: [...] }: ganti
 * keseluruhan senarai item. Semua atau tiada: satu item tidak sah bermakna
 * tiada perubahan (corak import CSV). Ditolak 409 selepas ada jawapan
 * peserta, kerana menukar item di tengah pengumpulan data merosakkan
 * perbandingan T1, T2 dan T3 (pangkalan data turut menghalang dengan
 * ON DELETE RESTRICT).
 */
export async function PUT(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (!Array.isArray(body.items)) return ralatJson('items must be a list.', 400);
  if (body.items.length > TINJAUAN_MAX_ITEM) {
    return ralatJson(`A survey can have at most ${TINJAUAN_MAX_ITEM} items.`, 400);
  }

  const sah: ItemTinjauan[] = [];
  const errors: { row: number; message: string }[] = [];
  body.items.forEach((raw: unknown, i: number) => {
    const { item, ralat } = sahkanItemTinjauan(raw);
    if (item) sah.push(item);
    else errors.push({ row: i + 1, message: ralat ?? 'Invalid item.' });
  });
  if (errors.length > 0) {
    return ralatJson(`Item ${errors[0].row}: ${errors[0].message}`, 400, { errors });
  }

  if ((await bilanganJawapan(params.quizId)) > 0) {
    return ralatJson('Survey items are locked because participants have already answered them.', 409, {
      code: 'SURVEY_LOCKED',
    });
  }

  const svc = getServiceSupabase();
  const { error: ralatPadam } = await svc.from('qm_solo_survey_items').delete().eq('quiz_id', params.quizId);
  if (ralatPadam) return ralatJson(ralatPadam.message, 500);

  if (sah.length > 0) {
    const { error: ralatSisip } = await svc
      .from('qm_solo_survey_items')
      .insert(sah.map((it, i) => ({ ...it, quiz_id: params.quizId, position: i })));
    if (ralatSisip) return ralatJson(ralatSisip.message, 500);
  }

  const { data } = await svc
    .from('qm_solo_survey_items')
    .select(LAJUR_ITEM)
    .eq('quiz_id', params.quizId)
    .order('position', { ascending: true });
  return NextResponse.json({ items: data ?? [], locked: false, responses: 0 });
}
