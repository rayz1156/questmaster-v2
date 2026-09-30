import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { kedudukanSeri, pangkasTeks, ringkasanSesi } from '@/lib/laporanMarkah';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung. Paksa setiap bacaan pergi ke
// pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * GET /api/live/sessions/[sessionId]/results (V2-017)
 *
 * Keputusan penuh satu sesi Live Quiz: SEMUA pemain (bukan 20 teratas),
 * pecahan setiap soalan dan ringkasan. Sesi yang belum tamat dibenarkan;
 * medan `status` menandakan keadaannya.
 *
 * Kebenaran: hos sesi, pemilik kuiz, pemilik kelas, pendidik kelas yang
 * sudah menerima jemputan atau admin aktif. Kuiz tanpa kelas: hos, pemilik
 * kuiz atau admin sahaja. Bacaan data melalui service role HANYA selepas
 * semakan kebenaran, dengan senarai lajur eksplisit dan tiada emel.
 * `correct_label` (teks pilihan betul) hanya keluar di laluan pengurus kuiz
 * ini, tidak pernah ke peserta.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIADA_UUID = '00000000-0000-0000-0000-000000000000';
const HAD_PROMPT = 200;

interface BarisSesi {
  id: string;
  quiz_id: string;
  host_id: string;
  status: string;
  created_at: string;
  ended_at: string | null;
}

interface BarisKuiz {
  id: string;
  class_id: string | null;
  owner_id: string;
  title: string;
}

interface BarisPemain {
  id: string;
  nickname: string;
  user_id: string | null;
  score: number;
  total_ms: number;
  best_streak: number;
}

interface BarisSoalan {
  id: string;
  order_idx: number;
  prompt: string;
  options: Array<{ key: string; text: string }>;
  correct_key: string;
}

interface BarisJawapan {
  player_id: string;
  question_id: string;
  choice_key: string;
  is_correct: boolean;
  ms_taken: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  if (!UUID.test(String(params.sessionId))) {
    return NextResponse.json({ error: 'Not a valid session id.' }, { status: 400 });
  }

  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;
  const callerId = user!.id;

  // Had kadar 30 permintaan seminit bagi setiap pengguna.
  if (!dalamHad(`live-results:${callerId}`, 30)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  const svc = getServiceSupabase();

  // Sesi dan kuiz dibaca dahulu untuk menentukan kebenaran; semakan dibuat
  // di sini kerana RLS qm_live_sessions tidak merangkumi pemilik kelas.
  const { data: sesiRow } = await svc
    .from('qm_live_sessions')
    .select('id, quiz_id, host_id, status, created_at, ended_at')
    .eq('id', params.sessionId)
    .maybeSingle();
  const sesi = sesiRow as BarisSesi | null;
  if (!sesi) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  const { data: kuizRow } = await svc
    .from('qm_live_quizzes')
    .select('id, class_id, owner_id, title')
    .eq('id', sesi.quiz_id)
    .maybeSingle();
  const kuiz = kuizRow as BarisKuiz | null;
  if (!kuiz) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  // ----- Kebenaran (sebelum sebarang bacaan data berat) -----
  const isHost = sesi.host_id === callerId;
  const isPemilikKuiz = kuiz.owner_id === callerId;
  let dibenarkan = isHost || isPemilikKuiz;
  if (!dibenarkan && kuiz.class_id) {
    const { data: kelas } = await supa
      .from('qm_classes')
      .select('owner_id')
      .eq('id', kuiz.class_id)
      .maybeSingle();
    if (kelas && kelas.owner_id === callerId) dibenarkan = true;
    else dibenarkan = await semakPendidikKelas(supa, kuiz.class_id, callerId);
  }
  if (!dibenarkan) {
    // Kuiz tanpa kelas milik orang lain: 403 generik.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ----- Pemain dan jawapan -----
  const { data: pemainData, error: errPemain } = await svc
    .from('qm_live_players')
    .select('id, nickname, user_id, score, total_ms, best_streak')
    .eq('session_id', params.sessionId);
  if (errPemain) {
    console.error('live results players failed', errPemain);
    return NextResponse.json({ error: 'Failed to load results.' }, { status: 500 });
  }
  const pemain = (pemainData || []) as BarisPemain[];

  const { data: jawapanData, error: errJawapan } = await svc
    .from('qm_live_answers')
    .select('player_id, question_id, choice_key, is_correct, ms_taken')
    .eq('session_id', params.sessionId);
  if (errJawapan) {
    console.error('live results answers failed', errJawapan);
    return NextResponse.json({ error: 'Failed to load results.' }, { status: 500 });
  }
  const jawapan = (jawapanData || []) as BarisJawapan[];

  // Nama berdaftar bagi pemain yang log masuk; hanya display_name, tiada emel.
  const idsProfil = Array.from(
    new Set(pemain.map((p) => p.user_id).filter((u): u is string => !!u)),
  );
  const petaNama = new Map<string, string>();
  if (idsProfil.length > 0) {
    const { data: profilBaris } = await svc
      .from('qm_profiles')
      .select('id, display_name')
      .in('id', idsProfil);
    for (const p of (profilBaris || []) as Array<{ id: string; display_name: string | null }>) {
      petaNama.set(String(p.id), String(p.display_name ?? ''));
    }
  }

  // ----- Pemain: kedudukan seri ikut markah -----
  interface StatistikPemain {
    correct: number;
    answered: number;
    jumlahMs: number;
  }
  const statPemain = new Map<string, StatistikPemain>();
  for (const a of jawapan) {
    const s = statPemain.get(a.player_id) ?? { correct: 0, answered: 0, jumlahMs: 0 };
    s.answered += 1;
    if (a.is_correct) s.correct += 1;
    s.jumlahMs += Number(a.ms_taken) || 0;
    statPemain.set(a.player_id, s);
  }

  const aturPemain = [...pemain].sort(
    (a, b) =>
      (Number(b.score) || 0) - (Number(a.score) || 0) ||
      (Number(a.total_ms) || 0) - (Number(b.total_ms) || 0) ||
      (a.nickname < b.nickname ? -1 : a.nickname > b.nickname ? 1 : 0),
  );
  const kedudukan = kedudukanSeri(aturPemain.map((p) => Number(p.score) || 0));

  const barisPemain = aturPemain.map((p, i) => {
    const s = statPemain.get(p.id) ?? { correct: 0, answered: 0, jumlahMs: 0 };
    return {
      rank: kedudukan[i],
      name: p.user_id ? petaNama.get(p.user_id) || p.nickname : p.nickname,
      user_id: p.user_id,
      score: Number(p.score) || 0,
      correct: s.correct,
      answered: s.answered,
      accuracy_pct: s.answered > 0 ? Math.round((s.correct / s.answered) * 1000) / 10 : null,
      avg_ms: s.answered > 0 ? Math.round(s.jumlahMs / s.answered) : null,
      best_streak: Number(p.best_streak) || 0,
    };
  });

  // ----- Soalan -----
  const { data: soalanData, error: errSoalan } = await svc
    .from('qm_live_questions')
    .select('id, order_idx, prompt, options, correct_key')
    .eq('quiz_id', sesi.quiz_id)
    .order('order_idx');
  if (errSoalan) {
    console.error('live results questions failed', errSoalan);
    return NextResponse.json({ error: 'Failed to load results.' }, { status: 500 });
  }
  const soalan = (soalanData || []) as BarisSoalan[];

  interface StatistikSoalan {
    answered: number;
    correct: number;
    jumlahMs: number;
    salah: Map<string, number>;
  }
  const statSoalan = new Map<string, StatistikSoalan>();
  for (const a of jawapan) {
    const s =
      statSoalan.get(a.question_id) ??
      { answered: 0, correct: 0, jumlahMs: 0, salah: new Map<string, number>() };
    s.answered += 1;
    if (a.is_correct) s.correct += 1;
    else s.salah.set(a.choice_key, (s.salah.get(a.choice_key) ?? 0) + 1);
    s.jumlahMs += Number(a.ms_taken) || 0;
    statSoalan.set(a.question_id, s);
  }

  const barisSoalan = soalan.map((q) => {
    const s = statSoalan.get(q.id);
    const teksPilihan = new Map<string, string>();
    for (const opt of Array.isArray(q.options) ? q.options : []) {
      teksPilihan.set(opt.key, opt.text);
    }
    let salahTeratas: { label: string; count: number } | null = null;
    if (s) {
      // forEach dan bukannya for..of kerana tsconfig projek tidak
      // mendayakan downlevelIteration bagi Map.
      s.salah.forEach((bilangan, kunci) => {
        if (!salahTeratas || bilangan > salahTeratas.count) {
          salahTeratas = { label: teksPilihan.get(kunci) ?? kunci, count: bilangan };
        }
      });
    }
    const pangkas = pangkasTeks(String(q.prompt ?? ''), HAD_PROMPT);
    return {
      order: Number(q.order_idx) || 0,
      prompt: pangkas.teks,
      prompt_truncated: pangkas.truncated,
      correct_label: teksPilihan.get(q.correct_key) ?? q.correct_key,
      answered: s?.answered ?? 0,
      correct_pct:
        s && s.answered > 0 ? Math.round((s.correct / s.answered) * 1000) / 10 : null,
      avg_ms: s && s.answered > 0 ? Math.round(s.jumlahMs / s.answered) : null,
      top_wrong: salahTeratas,
    };
  });

  // ----- Ringkasan -----
  const ringkasan = ringkasanSesi(
    barisPemain.map((p) => ({ score: p.score, correct: p.correct, answered: p.answered })),
  );

  return NextResponse.json({
    data: {
      session_id: sesi.id,
      quiz_id: sesi.quiz_id,
      quiz_title: kuiz.title,
      class_id: kuiz.class_id,
      status: sesi.status,
      created_at: sesi.created_at,
      ended_at: sesi.ended_at,
      players: barisPemain,
      questions: barisSoalan,
      summary: ringkasan,
    },
  });
}
