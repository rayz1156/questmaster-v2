import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import type { LiveSessionRow } from '@/lib/live-quiz';
import {
  susunPapan,
  susunPenyerang,
  taburanCubaanPertama,
  type BarisJawapanLumba,
  type BarisPapanLumba,
  type BarisPenyerang,
} from '@/lib/lumba-laju';

/** Baris sesi hos, termasuk lajur Speed Race (KZ-012) dan Boss Battle (KZ-013). */
interface SesiHos extends LiveSessionRow {
  game_mode?: string | null;
  race_minutes?: number | null;
  race_ends_at?: string | null;
  race_finished?: number | null;
  review_index?: number | null;
  review_revealed?: boolean | null;
  // KZ-032: tempoh bonus kelajuan dipilih guru.
  race_bonus_sec?: number | null;
  // KZ-013
  boss_k?: number | null;
  boss_max_hp?: number | null;
  boss_hp?: number | null;
  boss_crits?: number | null;
  boss_healed?: number | null;
  boss_last_hit?: string | null;
  boss_result?: string | null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * Mod perbincangan untuk sesi race dan boss (KZ-013 dipindahkan keluar dari
 * cabang race supaya kedua-dua cabang memanggil logik yang sama, bukan salinan).
 * correct_key hanya keluar selepas guru menekan Reveal.
 */
async function binaReviewHos(
  supa: SupabaseClient,
  sessionId: string,
  sesi: SesiHos,
  allQuestions: unknown[],
): Promise<Record<string, unknown> | null> {
  const idx = typeof sesi.review_index === 'number' ? sesi.review_index : -1;
  if (sesi.status !== 'ended' || idx < 0 || idx >= allQuestions.length) return null;
  const q = allQuestions[idx] as {
    id: string; prompt: string; options: { key: string; text: string }[];
    correct_key: string;
  };
  const { data: jawapan } = await supa
    .from('qm_live_answers')
    .select('player_id, choice_key, is_correct, attempt')
    .eq('session_id', sessionId)
    .eq('question_id', q.id);
  const dedah = sesi.review_revealed === true;
  return {
    index: idx,
    total: allQuestions.length,
    revealed: dedah,
    question: {
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      correct_key: dedah ? q.correct_key : null,
    },
    distribution: taburanCubaanPertama(
      (jawapan || []) as BarisJawapanLumba[],
      (q.options || []).map((o) => o.key),
    ),
  };
}

/**
 * GET /api/live/sessions/[sessionId], keadaan hos penuh.
 * Hos sahaja (pemilik sesi, pendidik kelas atau admin). Termasuk soalan semasa
 * dengan correct_key kerana ini laluan hos.
 */
export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  interface QuizRef { class_id: string; owner_id: string }
  interface ProfileRef { role: string; suspended: boolean | null }
  interface AnswerRef { choice_key: string }
  const LAJUR_SESI =
    'id, quiz_id, host_id, code, status, current_index, question_started_at, max_players, created_at, ended_at, ' +
    'game_mode, race_minutes, race_ends_at, race_finished, review_index, review_revealed, ' +
    // KZ-032: tempoh bonus kelajuan untuk bar panel hos.
    'race_bonus_sec, ' +
    // KZ-013: keadaan raksasa untuk panel hos.
    'boss_k, boss_max_hp, boss_hp, boss_crits, boss_healed, boss_last_hit, boss_result';
  const { data: session } = await auth.supa
    .from('qm_live_sessions')
    .select(LAJUR_SESI)
    .eq('id', params.sessionId)
    .maybeSingle();
  let ses = session as unknown as SesiHos | null;
  if (!ses) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

  const isHost = ses.host_id === auth.user!.id;
  let isEducator = isHost;
  let isAdmin = false;
  if (!isHost) {
    const { data: quiz } = await auth.supa
      .from('qm_live_quizzes')
      .select('class_id, owner_id')
      .eq('id', ses.quiz_id)
      .maybeSingle();
    const qz = quiz as QuizRef | null;
    if (qz && qz.owner_id === auth.user!.id) isEducator = true;
    if (qz) {
      const { data: member } = await auth.supa
        // Pendidik ada dalam qm_class_educators (educator_id), bukan qm_class_members (peserta).
        .from('qm_class_educators')
        .select('educator_id, accepted_at')
        .eq('class_id', qz.class_id)
        .eq('educator_id', auth.user!.id)
        .not('accepted_at', 'is', null)
        .maybeSingle();
      if (member) isEducator = true;
    }
    const { data: profile } = await auth.supa
      .from('qm_profiles')
      .select('role, suspended')
      .eq('id', auth.user!.id)
      .maybeSingle();
    const me = profile as ProfileRef | null;
    if (me && !me.suspended && ['admin', 'superadmin'].includes(me.role)) isAdmin = true;
  }

  if (!isEducator && !isAdmin) {
    return NextResponse.json({ error: 'You are not the host of this session.' }, { status: 403 });
  }

  const { data: quiz } = await auth.supa
    .from('qm_live_quizzes')
    .select('id, class_id, title, description')
    .eq('id', ses.quiz_id)
    .maybeSingle();

  const { data: questions, error: qErr } = await auth.supa
    .from('qm_live_questions')
    .select('id, order_idx, prompt, options, correct_key, points, time_limit_sec, use_countdown, double_points')
    .eq('quiz_id', ses.quiz_id)
    .order('order_idx');
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  const allQuestions = questions || [];

  // KZ-012: sesi Speed Race mempunyai bentuk balasan sendiri.
  if (ses.game_mode === 'race') {
    const svc = getServiceSupabase();
    // Tamatkan lumba bila masa habis walaupun tiada pemain sedang meninjau.
    if (ses.status === 'asking' && ses.race_ends_at && Date.parse(ses.race_ends_at) <= Date.now()) {
      await svc.rpc('qm_race_end', { p_session: params.sessionId });
      const { data: semula } = await auth.supa
        .from('qm_live_sessions')
        .select(LAJUR_SESI)
        .eq('id', params.sessionId)
        .maybeSingle();
      if (semula) ses = semula as unknown as SesiHos;
    }
    const sesi = ses!;

    const { data: pemainLumba, error: plErr } = await auth.supa
      .from('qm_live_players')
      .select('id, nickname, score, total_ms, joined_at, streak, best_streak, race_distance, race_rank, race_frozen_until, race_finished_at')
      .eq('session_id', params.sessionId);
    if (plErr) {
      console.error('race host players failed', plErr.code);
      return NextResponse.json({ error: 'Could not load the racers.' }, { status: 500 });
    }
    const papan = susunPapan((pemainLumba || []) as unknown as Array<BarisPapanLumba & Record<string, unknown>>);

    // Mod perbincangan: logik kongsi dengan sesi boss (fungsi binaReviewHos).
    const review = await binaReviewHos(auth.supa, params.sessionId, sesi, allQuestions);

    return NextResponse.json({
      data: {
        session: sesi,
        quiz: quiz,
        // Kunci jawapan TIDAK dihantar dalam senarai soalan sesi lumba; ia
        // hanya keluar melalui review.question.correct_key selepas Reveal,
        // kerana skrin ini selalunya ditayang kepada kelas.
        questions: allQuestions.map((q) => {
          const { correct_key: _kunci, ...tanpaKunci } = q as Record<string, unknown>;
          void _kunci;
          return tanpaKunci;
        }),
        players: papan,
        playerCount: papan.length,
        currentQuestion: null,
        distribution: null,
        serverNow: new Date().toISOString(),
        review,
      },
    });
  }

  // KZ-013: sesi Lawan Raksasa mempunyai bentuk balasan sendiri (corak cabang
  // race di atas).
  if (ses.game_mode === 'boss') {
    const svc = getServiceSupabase();
    // Tamatkan pertarungan bila masa habis walaupun tiada pemain sedang meninjau.
    if (ses.status === 'asking' && ses.race_ends_at && Date.parse(ses.race_ends_at) <= Date.now()) {
      await svc.rpc('qm_boss_end', { p_session: params.sessionId, p_result: 'lose' });
      const { data: semula } = await auth.supa
        .from('qm_live_sessions')
        .select(LAJUR_SESI)
        .eq('id', params.sessionId)
        .maybeSingle();
      if (semula) ses = semula as unknown as SesiHos;
    }
    const sesi = ses!;

    const { data: pemainRaksasa, error: prErr } = await auth.supa
      .from('qm_live_players')
      .select('id, nickname, score, streak, best_streak, boss_damage, race_frozen_until')
      .eq('session_id', params.sessionId);
    if (prErr) {
      console.error('boss host players failed', prErr.code);
      return NextResponse.json({ error: 'Could not load the players.' }, { status: 500 });
    }
    const papan = susunPenyerang(
      (pemainRaksasa || []) as unknown as Array<BarisPenyerang & Record<string, unknown>>,
    );
    const namaPemain = new Map(papan.map((p) => [p.id, p.nickname]));

    // Feed serangan: 8 jawapan terkini. Tiada choice_key dan tiada question_id
    // supaya skrin yang ditayang tidak membocorkan pilihan pemain (kzsec).
    const { data: feedRows, error: feedErr } = await auth.supa
      .from('qm_live_answers')
      .select('player_id, is_correct, boss_effect, boss_crit, created_at')
      .eq('session_id', params.sessionId)
      .order('created_at', { ascending: false })
      .limit(8);
    if (feedErr) {
      console.error('boss host feed failed', feedErr.code);
      return NextResponse.json({ error: 'Could not load the battle.' }, { status: 500 });
    }
    const feed = ((feedRows || []) as Array<{
      player_id: string; is_correct: boolean; boss_effect: number; boss_crit: boolean; created_at: string;
    }>).map((a) => ({
      nickname: namaPemain.get(a.player_id) ?? null,
      effect: a.boss_effect,
      crit: a.boss_crit,
      at: a.created_at,
    }));

    // Pemain yang mendarat pukulan terakhir.
    const lastHitName = sesi.boss_last_hit ? namaPemain.get(sesi.boss_last_hit) ?? null : null;

    // Statistik akhir: peratus betul pada cubaan pertama (satu perpuluhan).
    let stats: Record<string, unknown> | null = null;
    if (sesi.status === 'ended') {
      // Kiraan di pangkalan data (head: true), bukan semua baris: sesi besar
      // boleh melebihi had baris PostgREST dan memesongkan peratus.
      const [{ count: kiraPertama }, { count: kiraBetul }] = await Promise.all([
        auth.supa.from('qm_live_answers').select('id', { count: 'exact', head: true })
          .eq('session_id', params.sessionId).eq('attempt', 1),
        auth.supa.from('qm_live_answers').select('id', { count: 'exact', head: true })
          .eq('session_id', params.sessionId).eq('attempt', 1).eq('is_correct', true),
      ]);
      const pertama = kiraPertama ?? 0;
      const betul = kiraBetul ?? 0;
      stats = {
        correctPct: pertama > 0 ? Math.round((betul / pertama) * 1000) / 10 : null,
        crits: sesi.boss_crits ?? 0,
        healed: sesi.boss_healed ?? 0,
      };
    }

    const review = await binaReviewHos(auth.supa, params.sessionId, sesi, allQuestions);

    return NextResponse.json({
      data: {
        session: sesi,
        quiz: quiz,
        // Kunci jawapan TIDAK dihantar dalam senarai soalan sesi raksasa; ia
        // hanya keluar melalui review.question.correct_key selepas Reveal,
        // kerana skrin ini selalunya ditayang kepada kelas.
        questions: allQuestions.map((q) => {
          const { correct_key: _kunci, ...tanpaKunci } = q as Record<string, unknown>;
          void _kunci;
          return tanpaKunci;
        }),
        players: papan,
        playerCount: papan.length,
        currentQuestion: null,
        distribution: null,
        serverNow: new Date().toISOString(),
        review,
        // KZ-013: medan tambahan untuk panel raksasa.
        feed,
        lastHitName,
        stats,
      },
    });
  }

  const { data: players, error: pErr } = await auth.supa
    .from('qm_live_players')
    .select('id, nickname, score, total_ms, joined_at, streak, best_streak')
    .eq('session_id', params.sessionId)
    .order('score', { ascending: false });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const currentQuestion =
    ses.current_index >= 0 && ses.current_index < allQuestions.length
      ? allQuestions[ses.current_index]
      : null;

  // Taburan jawapan bagi soalan semasa (hos sahaja).
  let distribution: Record<string, number> | null = null;
  if (currentQuestion) {
    const { data: answers } = (await auth.supa
      .from('qm_live_answers')
      .select('choice_key')
      .eq('session_id', params.sessionId)
      .eq('question_id', currentQuestion.id)) as { data: AnswerRef[] | null };
    distribution = {};
    for (const opt of currentQuestion.options || []) {
      distribution[opt.key] = 0;
    }
    for (const a of answers || []) {
      const k = a.choice_key;
      distribution[k] = (distribution[k] || 0) + 1;
    }
  }

  return NextResponse.json({
    data: {
      session: ses,
      quiz: quiz,
      questions: allQuestions,
      players: players || [],
      playerCount: (players || []).length,
      currentQuestion,
      distribution,
    },
  });
}
