import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { SESI_BOLEH_MASUK } from '@/lib/papanPemukaPeserta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung. Paksa setiap bacaan pergi ke
// pangkalan data (perangkap dokumen CLAUDE.md, bahagian live quiz).
export const fetchCache = 'force-no-store';

/**
 * GET /api/participant/live-now (KZ-018b)
 *
 * Sesi kuiz langsung yang SEDANG boleh dimasuki (status lobby / asking /
 * revealed, lihat migrasi 0017 baris 61) bagi kelas yang pemanggil ialah
 * AHLI (qm_class_members; jadual peserta, bukan qm_class_educators).
 *
 * Skop keahlian dibaca dari pangkalan data melalui klien pengguna sendiri
 * (RLS polisi p_cm_self memastikan pengguna hanya nampak keahliannya
 * sendiri); TIADA parameter permintaan yang boleh menukar skop. Bacaan
 * sesi selepas itu melalui klien service kerana RLS menghalang peserta
 * daripada qm_live_sessions, dengan senarai lajur eksplisit.
 *
 * Medan pulangan minimum sahaja: code, title, class_id, class_name,
 * status, player_count, started_at. TIADA id hos, emel, token, soalan
 * atau jawapan.
 */

interface BarisSesi {
  id: string;
  quiz_id: string;
  code: string;
  status: string;
  created_at: string;
}

interface BarisKuiz {
  id: string;
  title: string;
  class_id: string | null;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;
  const callerId = user!.id;

  // Had kadar ringan: tinjauan 30 saat klien = 2 permintaan seminit;
  // had 30 seminit masih jauh di atas dan menghalang klien rosak.
  if (!dalamHad(`live-now:${callerId}`, 30)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  // 1. Kelas yang pengguna ini ahli; dari pangkalan data, bukan parameter.
  const { data: keahlian, error: errKeahlian } = await supa
    .from('qm_class_members')
    .select('class_id')
    .eq('user_id', callerId);
  if (errKeahlian) {
    console.error('live-now membership read failed', errKeahlian.message);
    return NextResponse.json({ error: 'Failed to load live sessions.' }, { status: 500 });
  }
  const idsKelas = Array.from(
    new Set(((keahlian || []) as Array<{ class_id: string }>).map((m) => m.class_id)),
  );
  if (idsKelas.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const svc = getServiceSupabase();

  // 2. Kuiz langsung bagi kelas-kelas itu sahaja.
  const { data: kuizData, error: errKuiz } = await svc
    .from('qm_live_quizzes')
    .select('id, title, class_id')
    .in('class_id', idsKelas);
  if (errKuiz) {
    console.error('live-now quiz read failed', errKuiz.message);
    return NextResponse.json({ error: 'Failed to load live sessions.' }, { status: 500 });
  }
  const kuiz = (kuizData || []) as BarisKuiz[];
  if (kuiz.length === 0) {
    return NextResponse.json({ data: [] });
  }
  const petaKuiz = new Map<string, BarisKuiz>();
  for (const k of kuiz) petaKuiz.set(String(k.id), k);

  // 3. Sesi yang belum tamat untuk kuiz-kuiz itu. Id sesi diambil untuk
  //    kiraan pemain di pelayan tetapi tidak pernah dipulangkan; tiada
  //    host_id, tiada question_started_at dalam pertanyaan.
  const { data: sesiData, error: errSesi } = await svc
    .from('qm_live_sessions')
    .select('id, quiz_id, code, status, created_at')
    .in('quiz_id', Array.from(petaKuiz.keys()))
    .in('status', SESI_BOLEH_MASUK as unknown as string[])
    .order('created_at', { ascending: false });
  if (errSesi) {
    console.error('live-now session read failed', errSesi.message);
    return NextResponse.json({ error: 'Failed to load live sessions.' }, { status: 500 });
  }
  const sesi = (sesiData || []) as BarisSesi[];
  if (sesi.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // 4. Kiraan pemain setiap sesi (lajur session_id sahaja; tiada token,
  //    tiada nama panggilan diperlukan).
  const { data: pemainData, error: errPemain } = await svc
    .from('qm_live_players')
    .select('session_id')
    .in('session_id', sesi.map((s) => s.id));
  if (errPemain) {
    console.error('live-now player read failed', errPemain.message);
    return NextResponse.json({ error: 'Failed to load live sessions.' }, { status: 500 });
  }
  const pemainPerSesi = new Map<string, number>();
  for (const p of (pemainData || []) as Array<{ session_id: string }>) {
    pemainPerSesi.set(p.session_id, (pemainPerSesi.get(p.session_id) ?? 0) + 1);
  }

  // 5. Nama kelas, untuk ayat "{class name} · {n} classmates already in.".
  const idsNamaKelas = Array.from(
    new Set(kuiz.map((k) => k.class_id).filter((c): c is string => !!c)),
  );
  const petaNamaKelas = new Map<string, string>();
  if (idsNamaKelas.length > 0) {
    const { data: kelasData, error: errKelas } = await svc
      .from('qm_classes')
      .select('id, name')
      .in('id', idsNamaKelas);
    if (errKelas) {
      console.error('live-now class name read failed', errKelas.message);
      return NextResponse.json({ error: 'Failed to load live sessions.' }, { status: 500 });
    }
    for (const k of (kelasData || []) as Array<{ id: string; name: string | null }>) {
      petaNamaKelas.set(String(k.id), String(k.name ?? ''));
    }
  }

  const baris = sesi.map((s) => {
    const k = petaKuiz.get(s.quiz_id);
    return {
      code: s.code,
      title: k?.title ?? null,
      class_id: k?.class_id ?? null,
      class_name: k?.class_id ? petaNamaKelas.get(k.class_id) ?? null : null,
      status: s.status,
      player_count: pemainPerSesi.get(s.id) ?? 0,
      started_at: s.created_at,
    };
  });

  return NextResponse.json({ data: baris });
}
