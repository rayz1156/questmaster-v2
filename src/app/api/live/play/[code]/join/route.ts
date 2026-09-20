/**
 * POST /api/live/play/[code]/join — peserta masuk sesi kuiz langsung.
 *
 * Peserta tiada akaun: semua akses melalui getServiceSupabase() (service role)
 * dan lajur ditapis secara eksplisit di sini. Balasan 409 jika sesi sudah
 * tamat atau nama sudah diambil.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

interface SessionRow {
  id: string;
  status: string;
}

interface JoinRpcRow { player_id: string; player_token: string }

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

  // Sisipan pemain melalui qm_live_join_player (migrasi 0018): kiraan pemain
  // dan sisipan dilakukan dalam SATU transaksi di pelayan pangkalan data
  // (baris sesi dikunci, sisipan bersyarat), supaya dua pemain yang masuk
  // serentak pada tempat terakhir tidak kedua-duanya berjaya.
  const { data: joined, error: joinError } = (await supa.rpc('qm_live_join_player', {
    p_session_id: session.id,
    p_nickname: nickname,
  })) as { data: JoinRpcRow[] | null; error: { code?: string; message: string } | null };

  if (joinError || !joined || joined.length === 0) {
    // LV009 = nama sudah diambil (kekangan unik di pelayan pangkalan data).
    if (joinError?.code === 'LV009') {
      return NextResponse.json(
        { error: joinError.message || 'Nama sudah diambil. Sila pilih nama lain.' },
        { status: 409 },
      );
    }
    // LV005 = had pemain sesi telah dicapai (Bahagian 2.3).
    if (joinError?.code === 'LV005') {
      return NextResponse.json(
        { error: joinError.message || 'Sesi ini sudah penuh.' },
        { status: 409 },
      );
    }
    // LV004 = sesi tidak dijumpai.
    if (joinError?.code === 'LV004') {
      return NextResponse.json(
        { error: 'Sesi tidak dijumpai atau sudah tamat.' },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: joinError?.message || 'Gagal menyertai sesi.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    playerId: joined[0].player_id,
    playerToken: joined[0].player_token,
    sessionId: session.id,
    status: session.status,
  });
}
