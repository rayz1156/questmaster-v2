import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import { muatKuizSolo, semakLarian, type LarianSolo } from '@/lib/lumba-solo-api';
import { nilaiTinjauanSah } from '@/lib/lumba-solo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface BarisItem {
  id: string;
  prompt: string;
  scale_min: number;
  scale_max: number;
  label_min: string | null;
  label_max: string | null;
}

/** Item tinjauan bagi titik larian mod ujian ini, mengikut kedudukan. */
async function itemUntukLarian(larian: LarianSolo): Promise<BarisItem[]> {
  if (!larian.test_mode || !larian.measure_point) return [];
  const svc = getServiceSupabase();
  const { data } = await svc
    .from('qm_solo_survey_items')
    .select('id, prompt, scale_min, scale_max, label_min, label_max')
    .eq('quiz_id', larian.quiz_id)
    .contains('points', [larian.measure_point])
    .order('position', { ascending: true });
  return (data ?? []) as BarisItem[];
}

/**
 * GET /api/solo/[code]/survey, pengepala x-run-token (KZ-UTT Fasa 2).
 * Item tinjauan bagi titik larian mod ujian, dengan nilai yang sudah
 * disimpan (larian yang disambung tidak perlu menjawab semula).
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const svc = getServiceSupabase();
  const kuiz = await muatKuizSolo(svc, params.code);
  if (!kuiz) return ralatJson('Challenge not found.', 404);
  const semakan = await semakLarian(req, svc, kuiz, null);
  if (semakan.response) return semakan.response;
  const larian = semakan.larian!;

  const item = await itemUntukLarian(larian);
  let nilai: Record<string, number> = {};
  if (item.length > 0) {
    const { data } = await svc
      .from('qm_solo_survey_answers')
      .select('item_id, value')
      .eq('run_id', larian.id);
    nilai = Object.fromEntries((data ?? []).map((r: { item_id: string; value: number }) => [r.item_id, r.value]));
  }
  return NextResponse.json({ items: item, values: nilai });
}

/**
 * POST /api/solo/[code]/survey, pengepala x-run-token, badan
 * { answers: [{ itemId, value }] }. Simpan (upsert) jawapan tinjauan.
 * Hanya larian mod ujian yang masih playing; nilai mesti integer dalam
 * julat skala item; item mesti milik kuiz dan titik larian.
 */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const svc = getServiceSupabase();
  const kuiz = await muatKuizSolo(svc, params.code);
  if (!kuiz) return ralatJson('Challenge not found.', 404);
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const semakan = await semakLarian(req, svc, kuiz, body.runToken);
  if (semakan.response) return semakan.response;
  const larian = semakan.larian!;
  if (!larian.test_mode) return ralatJson('This run has no survey.', 409);
  if (larian.status !== 'playing') return ralatJson('This run has already finished.', 409);
  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return ralatJson('answers must be a non-empty list.', 400);
  }

  const item = await itemUntukLarian(larian);
  const peta = new Map(item.map((it) => [it.id, it]));
  const baris: { run_id: string; item_id: string; value: number; answered_at: string }[] = [];
  const kini = new Date().toISOString();
  for (const a of body.answers as unknown[]) {
    const r = (a ?? {}) as Record<string, unknown>;
    const it = typeof r.itemId === 'string' ? peta.get(r.itemId) : undefined;
    if (!it) return ralatJson('Unknown survey item.', 400);
    const v = nilaiTinjauanSah(it, r.value);
    if (v === null) return ralatJson('Each answer must be a whole number on the item scale.', 400);
    baris.push({ run_id: larian.id, item_id: it.id, value: v, answered_at: kini });
  }

  const { error } = await svc.from('qm_solo_survey_answers').upsert(baris, { onConflict: 'run_id,item_id' });
  if (error) return ralatJson('Could not save the survey.', 503);
  return NextResponse.json({ saved: baris.length, total: item.length });
}
