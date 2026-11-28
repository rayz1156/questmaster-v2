import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import { requireQuizHost } from '@/lib/live-quiz';
import { lindungFormula, petikCsv } from '@/lib/csvPeserta';
import { LAJUR_EKSPORT, dijawab, hariDari, rujukanT3, tetingkapT2 } from '@/lib/kajian-solo';
import {
  LAJUR_PERSETUJUAN,
  bolehEksport,
  kodPeserta,
  muatPelan,
  muatRekodPeserta,
  type Persetujuan,
} from '@/lib/kajian-solo-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type Larian = {
  id: string;
  user_id: string;
  measure_point: 'T1' | 'T2' | 'T3';
  question_ids: string[];
  started_at: string;
  finished_at: string | null;
  status: string;
};

/**
 * GET /api/live/quizzes/[quizId]/research/export: CSV format panjang untuk
 * analisis (KZ-UTT Fasa 4). Satu baris bagi setiap soalan pengetahuan dan
 * setiap item tinjauan bagi setiap larian ujian.
 *
 * - Tanpa nama: `participant` ialah kod stabil bagi kuiz ini (kodPeserta),
 *   bukan nama, e-mel atau user_id.
 * - Hanya peserta yang bersetuju dan belum tarik diri.
 * - `correct` dan `answered` (bukan markah) ialah pemboleh ubah analisis;
 *   tiada `score` atau `points` dieksport.
 * - `days_from_ref`: T1 dari mula Modul 1, T2 dari tamat kursus, T3 dari
 *   tarikh rujukan T3 (T2, kemudian T1, kemudian sertai kelas).
 */
export async function GET(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response) return host.response;
  const svc = getServiceSupabase();

  const pelan = await muatPelan(svc, params.quizId);
  if (!pelan) return ralatJson('Set a measurement plan first.', 409);

  const { data: setuju, error: sErr } = await svc
    .from('qm_research_consents')
    .select(LAJUR_PERSETUJUAN)
    .eq('quiz_id', params.quizId);
  if (sErr) return ralatJson(sErr.message, 500);
  const layak = ((setuju ?? []) as Persetujuan[]).filter(bolehEksport).map((p) => p.user_id);

  const larian: Larian[] = [];
  for (let i = 0; i < layak.length; i += 200) {
    const { data, error } = await svc
      .from('qm_solo_runs')
      .select('id, user_id, measure_point, question_ids, started_at, finished_at, status')
      .eq('quiz_id', params.quizId)
      .eq('test_mode', true)
      .in('user_id', layak.slice(i, i + 200));
    if (error) return ralatJson(error.message, 500);
    larian.push(...((data ?? []) as Larian[]));
  }
  const rekod = await muatRekodPeserta(svc, params.quizId, pelan.class_id, layak);

  const idLarian = larian.map((l) => l.id);
  type Jawapan = { run_id: string; question_id: string; choice: string | null; is_correct: boolean; ms: number };
  type JawapanT = { run_id: string; item_id: string; value: number };
  const jawapan: Jawapan[] = [];
  const tinjauan: JawapanT[] = [];
  for (let i = 0; i < idLarian.length; i += 200) {
    const potong = idLarian.slice(i, i + 200);
    const [{ data: j, error: jErr }, { data: t, error: tErr }] = await Promise.all([
      svc.from('qm_solo_answers').select('run_id, question_id, choice, is_correct, ms').in('run_id', potong),
      svc.from('qm_solo_survey_answers').select('run_id, item_id, value').in('run_id', potong),
    ]);
    if (jErr || tErr) return ralatJson((jErr ?? tErr)!.message, 500);
    jawapan.push(...((j ?? []) as Jawapan[]));
    tinjauan.push(...((t ?? []) as JawapanT[]));
  }
  const { data: item } = await svc
    .from('qm_solo_survey_items')
    .select('id, code, construct, position')
    .eq('quiz_id', params.quizId);
  const petaItem = new Map((item ?? []).map((x: { id: string; code: string; construct: string; position: number }) => [x.id, x]));

  const t2 = tetingkapT2(pelan);
  const m1 = pelan.module1_start_at ? Date.parse(pelan.module1_start_at) : null;

  const baris: string[] = [LAJUR_EKSPORT.join(',')];
  const teks = (v: unknown) => petikCsv(lindungFormula(String(v ?? '')));
  const nombor = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(v));

  larian.sort((a, b) => (a.user_id + a.measure_point).localeCompare(b.user_id + b.measure_point));
  for (const l of larian) {
    const mula = Date.parse(l.started_at);
    let sumber = '';
    let hari: number | null = null;
    if (l.measure_point === 'T1' && m1 !== null) {
      sumber = 'module1_start';
      hari = hariDari(pelan, m1, mula);
    } else if (l.measure_point === 'T2' && t2) {
      sumber = 'course_end';
      hari = hariDari(pelan, t2.buka, mula);
    } else if (l.measure_point === 'T3') {
      const ruj = rujukanT3(rekod.get(l.user_id)!);
      if (ruj) {
        sumber = ruj.sumber;
        hari = hariDari(pelan, ruj.masa, mula);
      }
    }
    const awal = [
      teks(kodPeserta(params.quizId, l.user_id)),
      l.measure_point,
      'solo',
      l.started_at,
      l.finished_at ?? '',
      l.status,
      sumber,
      nombor(hari),
    ];
    const jw = new Map(jawapan.filter((j) => j.run_id === l.id).map((j) => [j.question_id, j]));
    l.question_ids.forEach((qid, idx) => {
      const j = jw.get(qid);
      baris.push(
        [
          ...awal,
          'knowledge',
          qid,
          String(idx + 1),
          '',
          j ? (j.is_correct ? '1' : '0') : '0',
          dijawab(j?.choice, j?.ms) ? '1' : '0',
          nombor(j?.ms),
          '',
        ].join(','),
      );
    });
    for (const t of tinjauan.filter((x) => x.run_id === l.id)) {
      const it = petaItem.get(t.item_id);
      baris.push(
        [...awal, 'survey', teks(it?.code ?? t.item_id), nombor(it?.position), teks(it?.construct ?? ''), '', '1', '', String(t.value)].join(','),
      );
    }
  }

  const tarikh = new Date().toISOString().slice(0, 10);
  return new NextResponse('﻿' + baris.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kajian-t1-t2-t3-${tarikh}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
