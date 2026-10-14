/**
 * /api/live/play/[code]/boss, laluan pemain Lawan Raksasa (KZ-013).
 * Corak penuh diambil daripada laluan Speed Race (race/route.ts).
 *
 * GET  ?playerId=  + pengepala x-player-token   keadaan pemain (qm_boss_state) + review
 * POST {playerId, playerToken, questionId, choiceKey}   hantar jawapan
 *
 * Keselamatan:
 * - playerToken WAJIB padan dengan baris pemain dalam sesi kod ini SEBELUM
 *   mana-mana fungsi qm_boss_* dipanggil. Fungsi itu SECURITY DEFINER dan
 *   hanya boleh dipanggil oleh service_role, jadi laluan ini ialah satu-
 *   satunya pintu masuk pemain.
 * - Semua pengiraan (betul/salah, masa, kerosakan, kritikal, pulih, nyawa)
 *   dijalankan di pelayan. Masa daripada badan permintaan tidak diterima.
 * - Dalam mod perbincangan, correctKey hanya dihantar bila review_revealed.
 * - Tiada select('*') pada qm_live_questions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung. Paksa setiap bacaan pergi ke
// pangkalan data.
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SesiRaksasa {
  id: string;
  quiz_id: string;
  status: string;
  game_mode: string | null;
  review_index: number | null;
  review_revealed: boolean | null;
}

type Sah =
  | { ok: true; sesi: SesiRaksasa; playerId: string }
  | { ok: false; response: NextResponse };

/** Sahkan kod sesi, mod raksasa dan token pemain. */
async function sahkanPemain(code: string, playerId: string, playerToken: string): Promise<Sah> {
  if (!playerId || !playerToken || !UUID.test(playerId)) {
    return { ok: false, response: NextResponse.json({ error: 'playerId and playerToken are required.' }, { status: 400 }) };
  }
  const supa = getServiceSupabase();
  const { data: sesi } = (await supa
    .from('qm_live_sessions')
    .select('id, quiz_id, status, game_mode, review_index, review_revealed')
    .eq('code', code)
    .maybeSingle()) as { data: SesiRaksasa | null };
  if (!sesi) {
    return { ok: false, response: NextResponse.json({ error: 'Session not found.' }, { status: 404 }) };
  }
  if (sesi.game_mode !== 'boss') {
    return { ok: false, response: NextResponse.json({ error: 'This session is not a Boss Battle.' }, { status: 409 }) };
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
  const { data: keadaan, error } = await supa.rpc('qm_boss_state', { p_player: sah.playerId });
  if (error || !keadaan) {
    console.error('qm_boss_state failed', error?.code);
    return NextResponse.json({ error: 'Could not read the battle.' }, { status: 500 });
  }
  const k = keadaan as Record<string, unknown>;

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

  // Senarai medan yang dibenarkan sahaja (kzsec KZ-013): jika qm_boss_state
  // diubah kelak dan memulangkan medan baharu, ia tidak bocor ke pemain.
  const MEDAN_KEADAAN = [
    'status', 'gameMode', 'endsAt', 'serverNow', 'hp', 'maxHp', 'result',
    'myDamage', 'score', 'streak', 'wrongStreak', 'frozenUntil',
    'position', 'playerCount', 'questionId', 'servedAt', 'lastHitByMe',
  ] as const;
  const balas: Record<string, unknown> = {};
  for (const m of MEDAN_KEADAAN) balas[m] = k[m] ?? null;
  return NextResponse.json({ ...balas, review });
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
  if (!dalamHad(`boss-answer:${sah.playerId}`, 120)) {
    return NextResponse.json({ error: 'Too many answers. Slow down a little.' }, { status: 429 });
  }

  const supa = getServiceSupabase();
  const { data, error } = await supa.rpc('qm_boss_submit', {
    p_player: sah.playerId,
    p_question: questionId,
    p_choice: choiceKey,
  });
  if (error || !data) {
    console.error('qm_boss_submit failed', error?.code);
    return NextResponse.json({ error: 'Your answer could not be saved.' }, { status: 500 });
  }
  return NextResponse.json(data);
}
