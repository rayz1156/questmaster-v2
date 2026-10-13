/**
 * /api/live/play/[code]/race, laluan pemain Speed Race (KZ-012).
 *
 * GET  ?playerId=  + pengepala x-player-token   keadaan pemain (qm_race_state) + review
 * POST {playerId, playerToken, questionId, choiceKey}   hantar jawapan
 *
 * Keselamatan:
 * - playerToken WAJIB padan dengan baris pemain dalam sesi kod ini SEBELUM
 *   mana-mana fungsi qm_race_* dipanggil. Fungsi itu SECURITY DEFINER dan
 *   hanya boleh dipanggil oleh service_role, jadi laluan ini ialah satu-
 *   satunya pintu masuk pemain.
 * - Semua pengiraan (betul/salah, masa, maju, nitro, markah) di pelayan.
 *   Masa daripada badan permintaan tidak diterima langsung.
 * - Dalam mod perbincangan, correctKey hanya dihantar bila review_revealed.
 *   Selepas pemain menjawab dalam lumba, qm_race_submit memulangkan
 *   correctKey dengan sengaja kerana soalan dikitar semula untuk latihan.
 * - Tiada select('*') pada qm_live_questions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { susunPapan, type BarisPapanLumba } from '@/lib/lumba-laju';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung. Paksa setiap bacaan pergi ke
// pangkalan data.
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SesiLumba {
  id: string;
  quiz_id: string;
  status: string;
  game_mode: string | null;
  review_index: number | null;
  review_revealed: boolean | null;
}

type Sah =
  | { ok: true; sesi: SesiLumba; playerId: string }
  | { ok: false; response: NextResponse };

/** Sahkan kod sesi, mod lumba dan token pemain. */
async function sahkanPemain(code: string, playerId: string, playerToken: string): Promise<Sah> {
  if (!playerId || !playerToken || !UUID.test(playerId)) {
    return { ok: false, response: NextResponse.json({ error: 'playerId and playerToken are required.' }, { status: 400 }) };
  }
  const supa = getServiceSupabase();
  const { data: sesi } = (await supa
    .from('qm_live_sessions')
    .select('id, quiz_id, status, game_mode, review_index, review_revealed')
    .eq('code', code)
    .maybeSingle()) as { data: SesiLumba | null };
  if (!sesi) {
    return { ok: false, response: NextResponse.json({ error: 'Session not found.' }, { status: 404 }) };
  }
  if (sesi.game_mode !== 'race') {
    return { ok: false, response: NextResponse.json({ error: 'This session is not a Speed Race.' }, { status: 409 }) };
  }
  const { data: pemain } = (await supa
    .from('qm_live_players')
    .select('id, player_token')
    .eq('id', playerId)
    .eq('session_id', sesi.id)
    .maybeSingle()) as { data: { id: string; player_token: string } | null };
  if (!pemain || pemain.player_token !== playerToken) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid player token.' }, { status: 403 }) };
  }
  return { ok: true, sesi, playerId: pemain.id };
}

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').toUpperCase();
  const playerId = req.nextUrl.searchParams.get('playerId') || '';
  // Token hanya dalam pengepala: token dalam URL akan tercatat dalam log Nginx.
  const playerToken = req.headers.get('x-player-token') || '';

  const sah = await sahkanPemain(code, playerId, playerToken);
  if (!sah.ok) return sah.response;

  const supa = getServiceSupabase();
  const { data: keadaan, error } = await supa.rpc('qm_race_state', { p_player: sah.playerId });
  if (error || !keadaan) {
    console.error('qm_race_state failed', error?.code);
    return NextResponse.json({ error: 'Could not read the race.' }, { status: 500 });
  }
  const k = keadaan as Record<string, unknown>;

  // Kedudukan dikira dengan susunPapan yang sama dengan skrin guru, supaya
  // dua pemain pada jarak sama tidak kedua-duanya nampak "1st" di telefon
  // sedangkan podium menunjukkan 1 dan 2. Hanya lajur kedudukan dibaca.
  const { data: semuaPemain } = await supa
    .from('qm_live_players')
    .select('id, nickname, score, race_distance, race_rank')
    .eq('session_id', sah.sesi.id);
  if (semuaPemain && semuaPemain.length > 0) {
    const papan = susunPapan(semuaPemain as BarisPapanLumba[]);
    const saya = papan.find((p) => p.id === sah.playerId);
    if (saya) {
      k.position = saya.kedudukan;
      k.playerCount = papan.length;
    }
  }

  // Mod perbincangan: soalan semasa guru, jawapan pertama pemain ini, dan
  // kunci jawapan HANYA selepas guru menekan Reveal.
  let review: Record<string, unknown> | null = null;
  const idx = typeof sah.sesi.review_index === 'number' ? sah.sesi.review_index : -1;
  if (k.status === 'ended' && idx >= 0) {
    const { data: senarai } = (await supa
      .from('qm_live_questions')
      .select('id')
      .eq('quiz_id', sah.sesi.quiz_id)
      .order('order_idx')) as { data: { id: string }[] | null };
    const semua = senarai || [];
    const q = idx < semua.length ? semua[idx] : null;
    if (q) {
      const { data: pertama } = (await supa
        .from('qm_live_answers')
        .select('choice_key, is_correct')
        .eq('session_id', sah.sesi.id)
        .eq('player_id', sah.playerId)
        .eq('question_id', q.id)
        .eq('attempt', 1)
        .maybeSingle()) as { data: { choice_key: string; is_correct: boolean } | null };
      const dedah = sah.sesi.review_revealed === true;
      review = {
        index: idx,
        total: semua.length,
        revealed: dedah,
        questionId: q.id,
        myFirstChoice: pertama?.choice_key ?? null,
        myFirstCorrect: dedah && pertama ? pertama.is_correct : null,
        correctKey: null as string | null,
      };
      if (dedah) {
        const { data: kunci } = (await supa
          .from('qm_live_questions')
          .select('correct_key')
          .eq('id', q.id)
          .maybeSingle()) as { data: { correct_key: string } | null };
        review.correctKey = kunci?.correct_key ?? null;
      }
    }
  }

  return NextResponse.json({ ...k, review });
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').toUpperCase();

  let body: { playerId?: unknown; playerToken?: unknown; questionId?: unknown; choiceKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  const playerToken = typeof body.playerToken === 'string' ? body.playerToken : '';
  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  const choiceKey = typeof body.choiceKey === 'string' ? body.choiceKey.trim().toUpperCase() : '';
  if (!playerId || !playerToken || !UUID.test(questionId) || !/^[A-F]$/.test(choiceKey)) {
    return NextResponse.json(
      { error: 'playerId, playerToken, questionId and choiceKey are required.' },
      { status: 400 },
    );
  }

  const sah = await sahkanPemain(code, playerId, playerToken);
  if (!sah.ok) return sah.response;

  // Jawapan secepat mungkin masih jauh di bawah 120 seminit; lebihan ialah skrip.
  if (!dalamHad(`race-answer:${sah.playerId}`, 120)) {
    return NextResponse.json({ error: 'Too many answers. Slow down a little.' }, { status: 429 });
  }

  const supa = getServiceSupabase();
  const { data, error } = await supa.rpc('qm_race_submit', {
    p_player: sah.playerId,
    p_question: questionId,
    p_choice: choiceKey,
  });
  if (error || !data) {
    console.error('qm_race_submit failed', error?.code);
    return NextResponse.json({ error: 'Your answer could not be saved.' }, { status: 500 });
  }
  return NextResponse.json(data);
}
