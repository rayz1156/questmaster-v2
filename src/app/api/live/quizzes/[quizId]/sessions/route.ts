import { NextRequest, NextResponse } from 'next/server';
import { requireQuizHost, generateSessionCode } from '@/lib/live-quiz';
import {
  BONUS_LALAI_SEC,
  RACE_DEFAULT_MINUTES,
  TAHAP_RAKSASA,
  sahBonusKelajuan,
  sahMinitLumba,
  sahModPermainan,
  sahTahapRaksasa,
} from '@/lib/lumba-laju';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/** POST /api/live/quizzes/[quizId]/sessions, mula sesi baharu dalam lobi. */
export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response || !host.quiz) {
    return host.response || NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });
  }

  // KZ-012: badan pilihan { mode, raceMinutes }. Badan kosong = classic,
  // supaya klien lama dan alat MCP lama berkelakuan sama seperti dahulu.
  // KZ-013: mode 'boss' menambah bossLevel (easy/medium/hard, lalai medium).
  // KZ-032: race dan boss menambah raceBonusSec (15/30/45/60 saat, lalai 30),
  // tempoh bar bonus kelajuan yang dipilih guru.
  const badan = (await req.json().catch(() => ({}))) as {
    mode?: unknown;
    raceMinutes?: unknown;
    bossLevel?: unknown;
    raceBonusSec?: unknown;
  };
  const mod = sahModPermainan(badan?.mode);
  if (!mod) {
    return NextResponse.json({ error: 'Invalid game mode.' }, { status: 400 });
  }
  let minitLumba = RACE_DEFAULT_MINUTES;
  if (mod === 'race' || mod === 'boss') {
    const m = sahMinitLumba(badan?.raceMinutes);
    if (m === null) {
      return NextResponse.json(
        { error: 'Race time must be a whole number of minutes from 1 to 60.' },
        { status: 400 },
      );
    }
    minitLumba = m;
  }
  // Tempoh bonus kelajuan hanya untuk mod race dan boss; classic abaikan.
  let bonusKelajuan = BONUS_LALAI_SEC;
  if (mod === 'race' || mod === 'boss') {
    const b =
      badan?.raceBonusSec === undefined || badan?.raceBonusSec === null || badan?.raceBonusSec === ''
        ? BONUS_LALAI_SEC
        : sahBonusKelajuan(badan.raceBonusSec);
    if (b === null) {
      return NextResponse.json(
        { error: 'Speed bonus must be 15, 30, 45 or 60 seconds.' },
        { status: 400 },
      );
    }
    bonusKelajuan = b;
  }
  let tahapRaksasa: 'easy' | 'medium' | 'hard' = 'medium';
  if (mod === 'boss') {
    const t = sahTahapRaksasa(badan?.bossLevel);
    if (t === null) {
      return NextResponse.json({ error: 'Invalid boss level.' }, { status: 400 });
    }
    tahapRaksasa = t;
  }

  const { data: questions } = await host.supa
    .from('qm_live_questions')
    .select('id')
    .eq('quiz_id', params.quizId)
    .limit(1);
  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'The quiz needs at least one question.' }, { status: 400 });
  }

  const code = await generateSessionCode(host.supa);
  if (!code) {
    return NextResponse.json({ error: 'Could not generate a session code. Please try again.' }, { status: 500 });
  }

  // Bahagian 2.3: petik had pemain pemilik kuiz pada masa sesi dicipta, supaya
  // menurunkan taraf pengguna tidak menjejaskan sesi yang sedang berjalan.
  const { data: ownerProfile } = (await host.supa
    .from('qm_profiles')
    .select('max_live_players')
    .eq('id', host.quiz.owner_id)
    .maybeSingle()) as { data: { max_live_players: number } | null };
  const maxPlayers = ownerProfile?.max_live_players ?? 50;

  const { data: session, error } = await host.supa
    .from('qm_live_sessions')
    .insert({
      quiz_id: params.quizId,
      host_id: host.user.id,
      code,
      status: 'lobby',
      current_index: -1,
      max_players: maxPlayers,
      // Petik tetapan bonus rentetan kuiz sekarang, supaya menukarnya
      // kemudian tidak mengubah sesi yang sedang berjalan.
      streak_bonus: host.quiz.streak_bonus !== false,
      game_mode: mod,
      race_minutes: minitLumba,
      // KZ-013: tahap raksasa dipetik kepada pemalar k sekarang, supaya
      // menukarnya kemudian tidak mengubah sesi yang sedang berjalan.
      ...(mod === 'boss' ? { boss_k: TAHAP_RAKSASA[tahapRaksasa] } : {}),
      // KZ-032: tempoh bonus kelajuan dipetik sekarang supaya menukar
      // tetapan kemudian tidak mengubah sesi yang sedang berjalan.
      ...(mod === 'race' || mod === 'boss' ? { race_bonus_sec: bonusKelajuan } : {}),
    })
    .select('id, quiz_id, code, status, current_index, game_mode')
    .single();

  if (error || !session) {
    return NextResponse.json({ error: error?.message || 'The session could not be created.' }, { status: 500 });
  }
  return NextResponse.json(
    { data: { sessionId: session.id, code: session.code, gameMode: session.game_mode ?? mod } },
    { status: 201 },
  );
}
