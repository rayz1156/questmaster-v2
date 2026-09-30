import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { tigaTeratas, type PemainTeratas } from '@/lib/laporanMarkah';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung. Paksa setiap bacaan pergi ke
// pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * GET /api/live/sessions (V2-017)
 *
 * Senarai sesi Live Quiz lepas dan semasa bagi kuiz yang pemanggil boleh
 * urus: kuiz miliknya (termasuk kuiz tanpa kelas) serta kuiz kelas yang dia
 * pemiliknya atau pendidiknya yang sudah menerima jemputan. Admin aktif
 * melihat semua. Parameter: class_id, quiz_id, status (lobby|asking|
 * revealed|ended), limit (lalai 20, maksimum 100), terbaru dahulu.
 *
 * Kebenaran disemak di sini (pemilik kelas, educator diterima, admin aktif;
 * kuiz tanpa kelas: pemilik kuiz atau admin sahaja); bacaan data berat
 * melalui service role HANYA selepas semakan itu, dengan senarai lajur
 * eksplisit dan tiada emel. Hasil dipangkas pada limit dengan bendera
 * `truncated`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_SESI = ['lobby', 'asking', 'revealed', 'ended'] as const;
const LIMIT_LALAI = 20;
const LIMIT_MAKS = 100;
const TIADA_UUID = '00000000-0000-0000-0000-000000000000';

interface BarisSesi {
  id: string;
  quiz_id: string;
  code: string;
  status: string;
  created_at: string;
  ended_at: string | null;
}

interface BarisPemain {
  id: string;
  session_id: string;
  nickname: string;
  user_id: string | null;
  score: number;
  total_ms: number;
}

interface BarisJawapanRingkas {
  session_id: string;
  player_id: string;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const classId = sp.get('class_id');
  const quizId = sp.get('quiz_id');
  const status = sp.get('status');
  const limitRaw = Number(sp.get('limit'));

  if (classId !== null && !UUID.test(classId)) {
    return NextResponse.json({ error: 'Not a valid class id.' }, { status: 400 });
  }
  if (quizId !== null && !UUID.test(quizId)) {
    return NextResponse.json({ error: 'Not a valid quiz id.' }, { status: 400 });
  }
  if (status !== null && !(STATUS_SESI as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }
  const limit =
    Number.isFinite(limitRaw) && limitRaw >= 1
      ? Math.min(Math.floor(limitRaw), LIMIT_MAKS)
      : LIMIT_LALAI;

  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;
  const callerId = user!.id;

  // Had kadar 60 permintaan seminit bagi setiap pengguna.
  if (!dalamHad(`live-sessions:${callerId}`, 60)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  // Peranan pemanggil: admin yang tidak digantung melihat semua sesi.
  const { data: profilPemanggil } = await supa
    .from('qm_profiles')
    .select('role, suspended')
    .eq('id', callerId)
    .maybeSingle();
  const adminAktif =
    !!profilPemanggil &&
    !profilPemanggil.suspended &&
    ['admin', 'superadmin'].includes(profilPemanggil.role);

  // SemakPendidikKelas tidak merangkumi pemilik kelas, jadi pemilik disemak
  // berasingan melalui qm_classes.owner_id (corak laluan member scores).
  const bolehUrusKelas = async (idKelas: string): Promise<boolean> => {
    if (adminAktif) return true;
    const { data: kelas } = await supa
      .from('qm_classes')
      .select('owner_id')
      .eq('id', idKelas)
      .maybeSingle();
    if (kelas && kelas.owner_id === callerId) return true;
    return semakPendidikKelas(supa, idKelas, callerId);
  };

  const svc = getServiceSupabase();

  // Tentukan set kuiz yang pemanggil boleh urus. null bermakna tiada tapis
  // (admin tanpa penapis); tatasusunan kosong bermakna tiada kuiz langsung.
  let idKuizTapis: string[] | null = null;
  if (quizId) {
    const { data: kuiz } = await svc
      .from('qm_live_quizzes')
      .select('id, class_id, owner_id')
      .eq('id', quizId)
      .maybeSingle();
    if (!kuiz) {
      return NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });
    }
    const dibenarkan = kuiz.class_id
      ? kuiz.owner_id === callerId || (await bolehUrusKelas(kuiz.class_id))
      : kuiz.owner_id === callerId || adminAktif;
    if (!dibenarkan) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    idKuizTapis = [quizId];
  } else if (classId) {
    if (!(await bolehUrusKelas(classId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { data: kuizKelas, error: errKuizKelas } = await svc
      .from('qm_live_quizzes')
      .select('id')
      .eq('class_id', classId);
    if (errKuizKelas) {
      console.error('live sessions quiz list failed', errKuizKelas);
      return NextResponse.json({ error: 'Failed to load sessions.' }, { status: 500 });
    }
    idKuizTapis = (kuizKelas || []).map((k: { id: string }) => String(k.id));
  } else if (!adminAktif) {
    // Semua kuiz milik pemanggil: kuiz peribadi miliknya dan kuiz kelas
    // yang dia pemilik atau pendidik diterima.
    const { data: kelasDimiliki } = await supa
      .from('qm_classes')
      .select('id')
      .eq('owner_id', callerId);
    const { data: kelasDididik } = await supa
      .from('qm_class_educators')
      .select('class_id')
      .eq('educator_id', callerId)
      .not('accepted_at', 'is', null);
    const idsKelas = new Set<string>([
      ...(kelasDimiliki || []).map((k: { id: string }) => String(k.id)),
      ...(kelasDididik || []).map((k: { class_id: string }) => String(k.class_id)),
    ]);
    const { data: kuizSendiri, error: errKuizSendiri } = await svc
      .from('qm_live_quizzes')
      .select('id')
      .eq('owner_id', callerId);
    if (errKuizSendiri) {
      console.error('live sessions own quiz list failed', errKuizSendiri);
      return NextResponse.json({ error: 'Failed to load sessions.' }, { status: 500 });
    }
    const senaraiId = new Set<string>((kuizSendiri || []).map((k: { id: string }) => String(k.id)));
    if (idsKelas.size > 0) {
      const { data: kuizKelas, error: errKelas } = await svc
        .from('qm_live_quizzes')
        .select('id')
        .in('class_id', Array.from(idsKelas));
      if (errKelas) {
        console.error('live sessions class quiz list failed', errKelas);
        return NextResponse.json({ error: 'Failed to load sessions.' }, { status: 500 });
      }
      for (const k of kuizKelas || []) senaraiId.add(String(k.id));
    }
    idKuizTapis = Array.from(senaraiId);
  }

  if (idKuizTapis !== null && idKuizTapis.length === 0) {
    return NextResponse.json({ data: [], limit, truncated: false });
  }

  // Baca limit+1 untuk mengesan pemotongan tanpa pertanyaan kiraan tambahan.
  let pertanyaan = svc
    .from('qm_live_sessions')
    .select('id, quiz_id, code, status, created_at, ended_at')
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  if (idKuizTapis !== null) pertanyaan = pertanyaan.in('quiz_id', idKuizTapis);
  if (status) pertanyaan = pertanyaan.eq('status', status);
  const { data: sesiData, error: errSesi } = await pertanyaan;
  if (errSesi) {
    console.error('live sessions list failed', errSesi);
    return NextResponse.json({ error: 'Failed to load sessions.' }, { status: 500 });
  }
  const semuaSesi = (sesiData || []) as BarisSesi[];
  const truncated = semuaSesi.length > limit;
  const sesi = semuaSesi.slice(0, limit);

  const idsSesi = sesi.map((s) => s.id);
  const idsKuiz = Array.from(new Set(sesi.map((s) => s.quiz_id)));

  const { data: kuizBaris, error: errKuizBaris } = await svc
    .from('qm_live_quizzes')
    .select('id, title, class_id')
    .in('id', idsKuiz.length > 0 ? idsKuiz : [TIADA_UUID]);
  if (errKuizBaris) {
    console.error('live sessions quiz read failed', errKuizBaris);
    return NextResponse.json({ error: 'Failed to load sessions.' }, { status: 500 });
  }
  const petaKuiz = new Map<string, { title: string | null; class_id: string | null }>();
  for (const k of (kuizBaris || []) as Array<{ id: string; title: string | null; class_id: string | null }>) {
    petaKuiz.set(String(k.id), { title: k.title, class_id: k.class_id });
  }

  const idsKelas = Array.from(
    new Set(
      sesi
        .map((s) => petaKuiz.get(s.quiz_id)?.class_id ?? null)
        .filter((c): c is string => !!c),
    ),
  );
  const petaKelas = new Map<string, string>();
  if (idsKelas.length > 0) {
    const { data: kelasBaris } = await svc
      .from('qm_classes')
      .select('id, name')
      .in('id', idsKelas);
    for (const k of (kelasBaris || []) as Array<{ id: string; name: string }>) {
      petaKelas.set(String(k.id), String(k.name ?? ''));
    }
  }

  // Pemain dan jawapan bagi semua sesi dalam satu pertanyaan setiap satu.
  const { data: pemainData, error: errPemain } = await svc
    .from('qm_live_players')
    .select('id, session_id, nickname, user_id, score, total_ms')
    .in('session_id', idsSesi.length > 0 ? idsSesi : [TIADA_UUID]);
  if (errPemain) {
    console.error('live sessions players read failed', errPemain);
    return NextResponse.json({ error: 'Failed to load sessions.' }, { status: 500 });
  }
  const pemain = (pemainData || []) as BarisPemain[];

  const { data: jawapanData, error: errJawapan } = await svc
    .from('qm_live_answers')
    .select('session_id, player_id')
    .in('session_id', idsSesi.length > 0 ? idsSesi : [TIADA_UUID]);
  if (errJawapan) {
    console.error('live sessions answers read failed', errJawapan);
    return NextResponse.json({ error: 'Failed to load sessions.' }, { status: 500 });
  }
  const jawapan = (jawapanData || []) as BarisJawapanRingkas[];

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

  const namaPemain = (p: BarisPemain): string =>
    p.user_id ? petaNama.get(p.user_id) || p.nickname : p.nickname;

  // Agregat per sesi.
  const pemainPerSesi = new Map<string, BarisPemain[]>();
  for (const p of pemain) {
    const senarai = pemainPerSesi.get(p.session_id) ?? [];
    senarai.push(p);
    pemainPerSesi.set(p.session_id, senarai);
  }
  const menjawapPerSesi = new Map<string, Set<string>>();
  for (const a of jawapan) {
    const set = menjawapPerSesi.get(a.session_id) ?? new Set<string>();
    set.add(a.player_id);
    menjawapPerSesi.set(a.session_id, set);
  }

  const baris = sesi.map((s) => {
    const senaraiPemain = pemainPerSesi.get(s.id) ?? [];
    const jumlah = senaraiPemain.reduce((j, p) => j + (Number(p.score) || 0), 0);
    const purata =
      senaraiPemain.length === 0
        ? 0
        : Math.round((jumlah / senaraiPemain.length) * 10) / 10;
    const teratas: PemainTeratas[] = senaraiPemain.map((p) => ({
      name: namaPemain(p),
      score: Number(p.score) || 0,
    }));
    const infoKuiz = petaKuiz.get(s.quiz_id);
    return {
      session_id: s.id,
      quiz_id: s.quiz_id,
      quiz_title: infoKuiz?.title ?? null,
      class_id: infoKuiz?.class_id ?? null,
      class_name: infoKuiz?.class_id ? petaKelas.get(infoKuiz.class_id) ?? null : null,
      code: s.code,
      status: s.status,
      created_at: s.created_at,
      ended_at: s.ended_at,
      players: senaraiPemain.length,
      answered_players: menjawapPerSesi.get(s.id)?.size ?? 0,
      avg_score: purata,
      top3: tigaTeratas(teratas),
    };
  });

  return NextResponse.json({ data: baris, limit, truncated });
}
