/**
 * POST /api/live/play/[code]/join, peserta masuk sesi kuiz langsung.
 *
 * Peserta tiada akaun: semua akses melalui getServiceSupabase() (service role)
 * dan lajur ditapis secara eksplisit di sini. Balasan 409 jika sesi sudah
 * tamat atau nama sudah diambil.
 *
 * Tiket V2-007: jika Bearer sah (auth.getUser(token), bukan kuki) DAN pengguna
 * ahli (qm_class_members) atau educator (qm_class_educators diterima, atau
 * pemilik qm_classes) kelas milik kuiz sesi itu, guna nama berdaftar
 * (display_name, dipotong 24 aksara) dan abaikan nickname daripada klien.
 * Selepas qm_live_join_player berjaya, kemas kini qm_live_players.user_id
 * untuk baris yang baru dicipta sahaja. Jika nama berdaftar sudah diambil
 * (LV009), cuba "<nama> 2" hingga "<nama> 9". Jika pengguna yang sama sudah
 * ada baris dengan user_id sama dalam sesi itu, pulangkan pemain sedia ada
 * (sambung semula): player_token hanya dipulangkan kepada pemilik yang sama,
 * yang sudah disahkan melalui Bearer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, getRouteSupabase, bearerFromReq } from '@/lib/supabase-route';
import { namaBerdaftar, ahliKelas } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

interface SessionRow {
  id: string;
  status: string;
  quiz_id: string | null;
}

interface JoinRpcRow { player_id: string; player_token: string }

interface JoinError { code?: string; message: string }

// "<nama> 2" hingga "<nama> 9", tetap 24 aksara maksimum.
function namaAkhiran(nama: string, i: number): string {
  const akhiran = ' ' + String(i);
  return nama.slice(0, 24 - akhiran.length) + akhiran;
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: 'Invalid session code.' }, { status: 400 });
  }

  // Badan pilihan bagi pengguna berdaftar (klien masih menghantar nickname
  // terkunci, tetapi nilai itu tidak dipercayai).
  // Temuan R3 (V2-007-sec): bezakan badan TERLALU BESAR (413) daripada JSON
  // rosak (400). Badan kosong dibenarkan: pengguna berdaftar boleh POST
  // tanpa badan, dan nickname kekal kosong tanpa mesej mengelirukan.
  const HAD_BADAN = 1_000_000; // selari client_max_body_size nginx 1 MB
  const panjangBadan = Number(req.headers.get('content-length') || 0);
  if (panjangBadan > HAD_BADAN) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
  }
  let raw = '';
  try {
    raw = await req.text();
  } catch {
    raw = '';
  }
  if (raw.length > HAD_BADAN) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
  }
  let nickname = '';
  if (raw.trim() !== '') {
    try {
      const body = JSON.parse(raw) as { nickname?: unknown };
      if (typeof body?.nickname === 'string') nickname = body.nickname.trim();
    } catch {
      // Badan bukan JSON: ralat yang jujur, bukan "nama mesti 1 hingga 24".
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
  }

  const supa = getServiceSupabase();

  const { data: session } = (await supa
    .from('qm_live_sessions')
    .select('id, status, quiz_id')
    .eq('code', code)
    .neq('status', 'ended')
    .limit(1)
    .maybeSingle()) as { data: SessionRow | null };
  if (!session) {
    return NextResponse.json({ error: 'Session not found, or already over.' }, { status: 404 });
  }
  if (session.status === 'ended') {
    return NextResponse.json({ error: 'This session is already over.' }, { status: 409 });
  }

  // Identiti berdaftar daripada Bearer (pilihan).
  let daftar: { userId: string; nama: string } | null = null;
  const token = bearerFromReq(req);
  if (token && session.quiz_id) {
    const routeSupa = getRouteSupabase(req);
    const { data: gu } = await routeSupa.auth.getUser(token);
    const user = gu.user;
    if (user && session.quiz_id) {
      // Kelas milik kuiz sesi itu (class_id boleh null untuk kuiz umum).
      const { data: quiz } = await supa
        .from('qm_live_quizzes')
        .select('class_id')
        .eq('id', session.quiz_id)
        .limit(1)
        .maybeSingle();
      const classId = (quiz?.class_id as string | null) || null;
      if (classId) {
        // Temuan R1 (V2-007-sec): semakan keahlian kongsi dengan whoami
        // (src/lib/live-quiz.ts). Pendidik diterima dan pemilik kelas turut
        // diterima; qm_class_members ialah jadual PESERTA sahaja.
        const k = await ahliKelas(supa, classId, user.id);
        if (k.member || k.educator || k.owner) {
          const nama = await namaBerdaftar(supa, user.id);
          if (nama) daftar = { userId: user.id, nama };
        }
      }
    }
  }

  // Sambung semula: baris sedia ada milik pengguna yang sama dalam sesi ini.
  // player_token dipulangkan HANYA kepada pemilik yang sama (sudah disahkan
  // melalui Bearer), jadi tiada token pemain lain terdedah.
  if (daftar) {
    const { data: sedia } = await supa
      .from('qm_live_players')
      .select('id, player_token, nickname')
      .eq('session_id', session.id)
      .eq('user_id', daftar.userId)
      .limit(1)
      .maybeSingle();
    if (sedia) {
      return NextResponse.json({
        playerId: sedia.id,
        playerToken: sedia.player_token,
        nickname: sedia.nickname,
        sessionId: session.id,
        status: session.status,
      });
    }
  }

  const namaMain = daftar ? daftar.nama : nickname;
  // Had 1 hingga 24 aksara hanya untuk nama bebas; nama berdaftar sentiasa
  // sah (dipotong 24) dan badan permintaan boleh kosong sama sekali.
  if (!daftar && (nickname.length < 1 || nickname.length > 24)) {
    return NextResponse.json(
      { error: 'A player name must be 1 to 24 characters.' },
      { status: 400 },
    );
  }

  // Sisipan pemain melalui qm_live_join_player (migrasi 0018): kiraan pemain
  // dan sisipan dilakukan dalam SATU transaksi di pelayan pangkalan data
  // (baris sesi dikunci, sisipan bersyarat), supaya dua pemain yang masuk
  // serentak pada tempat terakhir tidak kedua-duanya berjaya.
  // Pengguna berdaftar mencuba nama asas, kemudian akhiran 2 hingga 9.
  let cubaan: string[];
  if (daftar) {
    cubaan = [namaMain];
    for (let i = 2; i <= 9; i++) cubaan.push(namaAkhiran(namaMain, i));
  } else {
    cubaan = [nickname];
  }

  let joined: JoinRpcRow[] | null = null;
  let joinError: JoinError | null = null;
  let namaDigunakan = namaMain;
  for (const calon of cubaan) {
    const r = (await supa.rpc('qm_live_join_player', {
      p_session_id: session.id,
      p_nickname: calon,
    })) as { data: JoinRpcRow[] | null; error: JoinError | null };
    joined = r.data;
    joinError = r.error;
    namaDigunakan = calon;
    if (!joinError) break;
    // Cuma nama diambil: pengguna berdaftar boleh cuba akhiran seterusnya.
    if (joinError.code === 'LV009' && daftar) continue;
    break;
  }

  if (joinError || !joined || joined.length === 0) {
    // LV009 = nama sudah diambil (kekangan unik di pelayan pangkalan data).
    if (joinError?.code === 'LV009') {
      return NextResponse.json(
        { error: joinError.message || 'That name is taken. Please choose another.' },
        { status: 409 },
      );
    }
    // LV005 = had pemain sesi telah dicapai (Bahagian 2.3).
    if (joinError?.code === 'LV005') {
      return NextResponse.json(
        { error: joinError.message || 'This session is full.' },
        { status: 409 },
      );
    }
    // LV004 = sesi tidak dijumpai.
    if (joinError?.code === 'LV004') {
      return NextResponse.json(
        { error: 'Session not found, or already over.' },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: joinError?.message || 'Could not join the session.' },
      { status: 500 },
    );
  }

  // Kaitkan baris pemain yang BARU dicipta dengan pengguna berdaftar
  // (user_id masih null, lihat syarat .is). Service role, baris ini sahaja.
  if (daftar) {
    await supa
      .from('qm_live_players')
      .update({ user_id: daftar.userId })
      .eq('id', joined[0].player_id)
      .is('user_id', null);
  }

  return NextResponse.json({
    playerId: joined[0].player_id,
    playerToken: joined[0].player_token,
    nickname: namaDigunakan,
    sessionId: session.id,
    status: session.status,
  });
}
