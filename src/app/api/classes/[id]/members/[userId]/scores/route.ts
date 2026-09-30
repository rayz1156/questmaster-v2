import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { kiraKedudukan } from '@/lib/markahPeserta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/classes/[id]/members/[userId]/scores (V2-013)
 *
 * Markah terkumpul seorang peserta untuk pendidik: pecahan jumlah, senarai
 * aktiviti (mata diluluskan dan bilangan jawapan), sesi Live Quiz dan
 * pelarasan manual. Kebenaran: pemilik kelas, educator kelas yang sudah
 * menerima jemputan, atau pentadbir aktif; peserta lain tiada akses.
 *
 * Semua bacaan data berat melalui service role HANYA selepas semakan
 * kebenaran, dengan senarai lajur eksplisit: tiada emel dan tiada kunci
 * jawapan (qm_challenges.answer / qm_live_questions.correct_key tidak
 * pernah disentuh). View qm_class_individual_scores sudah berpagar oleh
 * penapis migrasi 0050, jadi klien service_role dibenarkan membacanya.
 */

/** Baris view qm_class_individual_scores yang laluan ini perlukan. */
type BarisView = {
  user_id: string;
  task_score: number | null;
  live_score: number | null;
  adjustment_score: number | null;
  total_score: number | null;
  live_sessions: number | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } },
) {
  // Tolak parameter bukan UUID awal (kzsec V2-013 R4).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(String(params.id)) || !UUID.test(String(params.userId))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;
  const callerId = user!.id;

  // Kelas tidak wujud: 404 generik, sama corak dengan laluan export.
  const { data: klass } = await supa
    .from('qm_classes')
    .select('id, name, owner_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!klass) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Pemanggil MESTI pemilik kelas, educator kelas (jemputan diterima) atau
  // pentadbir. semakPendidikKelas sudah merangkumi admin tidak digantung.
  const isOwner = klass.owner_id === callerId;
  const ok = isOwner || (await semakPendidikKelas(supa, params.id, callerId));
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Had kadar 60 permintaan seminit bagi setiap pemanggil.
  if (!dalamHad(`member-scores:${callerId}`, 60)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  // Sasaran mesti ahli kelas itu; 404 generik supaya ID bukan ahli tidak
  // boleh dibezakan daripada kelas yang tidak wujud.
  const { data: ahli } = await supa
    .from('qm_class_members')
    .select('user_id')
    .eq('class_id', params.id)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (!ahli) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ----- Data melalui service role (selepas semakan kebenaran) -----
  const svc = getServiceSupabase();

  // Nama paparan sahaja; qm_profiles tiada emel dan kita tidak membaca
  // auth.users di sini.
  const { data: profil, error: profilErr } = await svc
    .from('qm_profiles')
    .select('display_name')
    .eq('id', params.userId)
    .maybeSingle();
  if (profilErr) {
    return NextResponse.json({ error: profilErr.message }, { status: 500 });
  }

  // Baris view kelas: jumlah, pecahan, dan kedudukan. Kedudukan dikira di
  // sini (seri berkongsi kedudukan yang sama) supaya halaman dan CSV tidak
  // menyalin formula.
  // Klien pemanggil, bukan service role (kzsec V2-013 P1): penapis view 0050
  // guna auth.uid() pemanggil, jadi hanya kelas yang dia berhak lihat terbuka.
  const { data: barisView, error: viewErr } = await supa
    .from('qm_class_individual_scores')
    .select(
      'user_id, task_score, live_score, adjustment_score, total_score, live_sessions',
    )
    .eq('class_id', params.id);
  if (viewErr) {
    return NextResponse.json({ error: viewErr.message }, { status: 500 });
  }
  const senarai = (barisView || []) as BarisView[];
  const kedudukan = kiraKedudukan(senarai.map((b) => Number(b.total_score) || 0));
  const idx = senarai.findIndex((b) => b.user_id === params.userId);
  const baris = idx >= 0 ? senarai[idx] : null;

  // ----- Aktiviti: submission peserta dalam hunt kelas ini -----
  // Tiga pertanyaan bersambung (submissions, challenges, hunts) dengan lajur
  // eksplisit; qm_challenges.answer TIDAK diambil.
  const { data: hantar, error: hantarErr } = await svc
    .from('qm_submissions')
    .select('challenge_id, status')
    .eq('user_id', params.userId);
  if (hantarErr) {
    return NextResponse.json({ error: hantarErr.message }, { status: 500 });
  }
  const idCabaran = Array.from(new Set((hantar || []).map((s: { challenge_id: string }) => s.challenge_id)));

  const { data: cabaran, error: cabaranErr } = await svc
    .from('qm_challenges')
    .select('id, hunt_id, points')
    .in('id', idCabaran.length > 0 ? idCabaran : ['00000000-0000-0000-0000-000000000000']);
  if (cabaranErr) {
    return NextResponse.json({ error: cabaranErr.message }, { status: 500 });
  }
  const petaCabaran = new Map<string, { hunt_id: string; points: number }>();
  for (const c of cabaran || []) {
    petaCabaran.set(String(c.id), { hunt_id: String(c.hunt_id), points: Number(c.points) || 0 });
  }

  const idHunt = Array.from(new Set(Array.from(petaCabaran.values()).map((c) => c.hunt_id)));
  const { data: hunt, error: huntErr } = await svc
    .from('qm_hunts')
    .select('id, title, class_id')
    .in('id', idHunt.length > 0 ? idHunt : ['00000000-0000-0000-0000-000000000000'])
    .eq('class_id', params.id);
  if (huntErr) {
    return NextResponse.json({ error: huntErr.message }, { status: 500 });
  }

  // Agregat per hunt: mata diluluskan dan bilangan jawapan diluluskan serta
  // tertunda. Hunt dengan submission ditolak sahaja tidak dipaparkan
  // kerana tiada lagi untuk pendidik tindak lanjut.
  type Agregat = { huntId: string; title: string; approvedPoints: number; approvedCount: number; pendingCount: number };
  const agregat = new Map<string, Agregat>();
  for (const h of hunt || []) {
    agregat.set(String(h.id), {
      huntId: String(h.id),
      title: String(h.title ?? ''),
      approvedPoints: 0,
      approvedCount: 0,
      pendingCount: 0,
    });
  }
  for (const s of hantar || []) {
    const c = petaCabaran.get(String(s.challenge_id));
    if (!c) continue;
    const a = agregat.get(c.hunt_id);
    if (!a) continue;
    if (s.status === 'approved') {
      a.approvedPoints += c.points;
      a.approvedCount += 1;
    } else if (s.status === 'pending') {
      a.pendingCount += 1;
    }
  }
  const activities = Array.from(agregat.values())
    .filter((a) => a.approvedCount > 0 || a.pendingCount > 0)
    .sort((x, y) => (x.title < y.title ? -1 : x.title > y.title ? 1 : 0));

  // ----- Live Quiz: sesi kuiz kelas yang dimainkan peserta -----
  // Sesi 'lobby' dikecualikan supaya jumlah senarai sepadan dengan
  // live_score view (sesi ditetapkan semula ke lobby masih menyimpan skor
  // lama tetapi tidak masuk kedudukan kelas).
  const { data: pemain, error: pemainErr } = await svc
    .from('qm_live_players')
    .select('id, session_id, score, joined_at')
    .eq('user_id', params.userId);
  if (pemainErr) {
    return NextResponse.json({ error: pemainErr.message }, { status: 500 });
  }
  const idSesi = Array.from(new Set((pemain || []).map((p: { session_id: string }) => p.session_id)));

  const { data: sesi, error: sesiErr } = await svc
    .from('qm_live_sessions')
    .select('id, quiz_id, status')
    .in('id', idSesi.length > 0 ? idSesi : ['00000000-0000-0000-0000-000000000000']);
  if (sesiErr) {
    return NextResponse.json({ error: sesiErr.message }, { status: 500 });
  }
  const idKuiz = Array.from(new Set((sesi || []).map((s: { quiz_id: string }) => s.quiz_id)));

  const { data: kuiz, error: kuizErr } = await svc
    .from('qm_live_quizzes')
    .select('id, title, class_id')
    .in('id', idKuiz.length > 0 ? idKuiz : ['00000000-0000-0000-0000-000000000000'])
    .eq('class_id', params.id);
  if (kuizErr) {
    return NextResponse.json({ error: kuizErr.message }, { status: 500 });
  }
  const kelasKuiz = new Set((kuiz || []).map((k: { id: string }) => String(k.id)));
  const tajukKuiz = new Map<string, string>();
  for (const k of kuiz || []) tajukKuiz.set(String(k.id), String(k.title ?? ''));

  const idPemain = Array.from(new Set((pemain || []).map((p: { id: string }) => p.id)));
  const { data: jawapan, error: jawapanErr } = await svc
    .from('qm_live_answers')
    .select('session_id, player_id, is_correct')
    .in('player_id', idPemain.length > 0 ? idPemain : ['00000000-0000-0000-0000-000000000000']);
  if (jawapanErr) {
    return NextResponse.json({ error: jawapanErr.message }, { status: 500 });
  }

  type SesiKuiz = { sessionId: string; quizTitle: string; playedAt: string; score: number; correct: number; answered: number };
  const senaraiSesi: SesiKuiz[] = [];
  for (const p of pemain || []) {
    const s = (sesi || []).find((x: { id: string }) => String(x.id) === String(p.session_id));
    if (!s || s.status === 'lobby') continue;
    if (!kelasKuiz.has(String(s.quiz_id))) continue;
    const jw = (jawapan || []).filter(
      (a: { session_id: string; player_id: string }) =>
        String(a.player_id) === String(p.id) && String(a.session_id) === String(p.session_id),
    );
    senaraiSesi.push({
      sessionId: String(p.session_id),
      quizTitle: tajukKuiz.get(String(s.quiz_id)) ?? '',
      playedAt: String(p.joined_at ?? ''),
      score: Number(p.score) || 0,
      correct: jw.filter((a: { is_correct: boolean }) => a.is_correct === true).length,
      answered: jw.length,
    });
  }
  senaraiSesi.sort((x, y) => (x.playedAt < y.playedAt ? 1 : x.playedAt > y.playedAt ? -1 : 0));

  // ----- Pelarasan manual -----
  const { data: pelarasan, error: pelarasanErr } = await svc
    .from('qm_student_score_adjustments')
    .select('delta, reason, created_at')
    .eq('class_id', params.id)
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false });
  if (pelarasanErr) {
    return NextResponse.json({ error: pelarasanErr.message }, { status: 500 });
  }
  const adjustments = (pelarasan || []).map((a: { delta: number; reason: string | null; created_at: string }) => ({
    delta: Number(a.delta) || 0,
    reason: a.reason ?? '',
    createdAt: String(a.created_at ?? ''),
  }));

  return NextResponse.json({
    name: String(profil?.display_name ?? ''),
    totals: {
      task: Number(baris?.task_score) || 0,
      live: Number(baris?.live_score) || 0,
      adjustment: Number(baris?.adjustment_score) || 0,
      total: Number(baris?.total_score) || 0,
      rank: idx >= 0 ? kedudukan[idx] : 0,
      liveSessions: Number(baris?.live_sessions) || 0,
    },
    activities,
    liveQuizzes: senaraiSesi,
    adjustments,
  });
}
