import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import {
  kunciJawapan,
  muatKuizSolo,
  msJawap,
  semakLarian,
} from '@/lib/lumba-solo-api';
import { kiraMata, SOALAN_TETINGKAH_MS } from '@/lib/lumba-solo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * POST /api/solo/[code]/answer, badan { questionId, choice }, pengepala
 * x-run-token.
 *
 * questionId mesti soalan semasa (question_ids[next_idx]) dan soalan itu
 * mesti sudah dihidangkan. Masa jawab sentiasa dikira PELAYAN daripada
 * served_at; masa daripada badan tidak pernah dipercayai. Melebihi 30 saat
 * atau choice kosong dikira salah (tamat masa).
 *
 * Kemas kini larian bersifat atomik: klausa where next_idx = <idx lama>
 * menolak dua jawapan serentak untuk soalan yang sama, dan kekangan unique
 * (run_id, question_id) pada jadual jawapan menahannya pada peringkat DB.
 */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const svc = getServiceSupabase();
  const kuiz = await muatKuizSolo(svc, params.code);
  if (!kuiz) return ralatJson('Challenge not found.', 404);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const semakan = await semakLarian(req, svc, kuiz, body.runToken);
  if (semakan.response) return semakan.response;
  const larian = semakan.larian!;
  if (larian.status !== 'playing') {
    return ralatJson('This run has already finished.', 409);
  }

  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  const idx = larian.next_idx;
  const semasa = idx < larian.question_ids.length ? larian.question_ids[idx] : null;
  if (!questionId || questionId !== semasa) {
    return ralatJson('Not the current question.', 400);
  }
  if (larian.served_at === null) {
    return ralatJson('The question has not been served yet.', 400);
  }

  // Kunci jawapan dibaca pelayan sahaja; tidak pernah masuk respons sebelum
  // soalan ini dijawab.
  const kunci = await kunciJawapan(svc, questionId);
  if (!kunci || !kunci.correct_key) {
    return ralatJson('Could not read the question.', 500);
  }

  const ms = msJawap(larian.served_at);
  const choice = typeof body.choice === 'string' && body.choice ? body.choice : null;
  // Tamat masa (melebihi 30 saat) atau tiada pilihan: dikira salah.
  const betul =
    ms <= SOALAN_TETINGKAH_MS && choice !== null && choice === kunci.correct_key;
  const mata = kiraMata(kunci.points, ms, betul);

  // Kemas kini bersyarat next_idx: jawapan berganda serentak ditolak
  // (sifar baris dikemas kini).
  const { data: upd, error } = await svc
    .from('qm_solo_runs')
    .update({
      score: larian.score + mata,
      correct: larian.correct + (betul ? 1 : 0),
      wrong: larian.wrong + (betul ? 0 : 1),
      next_idx: idx + 1,
      served_at: null,
    })
    .eq('id', larian.id)
    .eq('status', 'playing')
    .eq('next_idx', idx)
    .select('id, score')
    .maybeSingle();
  if (error) return ralatJson('Could not save the answer.', 503);
  if (!upd) {
    return ralatJson('You have already answered this question.', 409);
  }

  // Simpan jawapan selepas kemas kini larian berjaya; kekangan unique
  // (run_id, question_id) menjaga kes perlumbaan.
  const { error: ralatJawapan } = await svc.from('qm_solo_answers').insert({
    run_id: larian.id,
    question_id: questionId,
    choice,
    is_correct: betul,
    ms,
    points: mata,
  });
  if (ralatJawapan) return ralatJson('Could not save the answer.', 503);

  return NextResponse.json({
    correct: betul,
    correctKey: kunci.correct_key,
    points: mata,
    score: upd.score,
  });
}