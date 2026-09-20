/**
 * POST /api/live/play/[code]/join — peserta masuk sesi kuiz langsung.
 *
 * Peserta tiada akaun: semua akses melalui getServiceSupabase() (service role)
 * dan lajur ditapis secara eksplisit di sini. Balasan 409 jika sesi sudah
 * tamat atau nama sudah diambil.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SessionRow {
  id: string;
  status: string;
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: 'Kod sesi tidak sah.' }, { status: 400 });
  }

  let body: { nickname?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Badan permintaan tidak sah.' }, { status: 400 });
  }
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  if (nickname.length < 1 || nickname.length > 24) {
    return NextResponse.json(
      { error: 'Nama pemain mesti antara 1 hingga 24 aksara.' },
      { status: 400 },
    );
  }

  const supa = getServiceSupabase();

  const { data: session } = (await supa
    .from('qm_live_sessions')
    .select('id, status')
    .eq('code', code)
    .neq('status', 'ended')
    .maybeSingle()) as { data: SessionRow | null };
  if (!session) {
    return NextResponse.json({ error: 'Sesi tidak dijumpai atau sudah tamat.' }, { status: 404 });
  }
  if (session.status === 'ended') {
    return NextResponse.json({ error: 'Sesi ini sudah tamat.' }, { status: 409 });
  }

  // Rahsia pemain: 32 aksara rawak, disimpan di pelayan sahaja.
  const playerToken = randomBytes(16).toString('hex'); // 32 aksara

  const { data: player, error } = (await supa
    .from('qm_live_players')
    .insert({ session_id: session.id, nickname, player_token: playerToken })
    .select('id')
    .single()) as { data: { id: string } | null; error: { code?: string; message: string } | null };

  if (error || !player) {
    // Kekangan unik (session_id, lower(nickname)) => nama sudah diambil.
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'Nama sudah diambil. Sila pilih nama lain.' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error?.message || 'Gagal menyertai sesi.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    playerId: player.id,
    playerToken,
    sessionId: session.id,
    status: session.status,
  });
}
