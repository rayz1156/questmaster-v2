import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai. Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * GET /api/classes/[id]/hunts/[huntId]/results (V2-017)
 *
 * Keputusan satu aktiviti (hunt) untuk pendidik: bilangan hantaran setiap
 * cabaran (disahkan, tertunda, ditolak) dan markah setiap ahli kelas
 * (mata diluluskan, bilangan hantaran, hantaran terakhir). Ahli tanpa
 * hantaran dipaparkan dengan sifar.
 *
 * Kebenaran: pemilik kelas, pendidik kelas yang sudah menerima jemputan
 * (semakPendidikKelas) atau admin aktif. Hunt mesti milik kelas; jika tidak,
 * 404 generik. Bacaan data melalui service role HANYA selepas semakan
 * kebenaran, dengan senarai lajur eksplisit: qm_challenges.answer tidak
 * pernah diambil dan tiada emel dalam hasil.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIADA_UUID = '00000000-0000-0000-0000-000000000000';

interface BarisCabaran {
  id: string;
  title: string;
  points: number;
}

interface BarisHantaran {
  challenge_id: string;
  user_id: string;
  status: string;
  created_at: string;
}

interface BarisProfil {
  id: string;
  display_name: string | null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; huntId: string } },
) {
  if (!UUID.test(String(params.id)) || !UUID.test(String(params.huntId))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;
  const callerId = user!.id;

  // Had kadar 30 permintaan seminit bagi setiap pengguna.
  if (!dalamHad(`hunt-results:${callerId}`, 30)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  // Kelas tidak wujud: 404 generik.
  const { data: kelas } = await supa
    .from('qm_classes')
    .select('id, owner_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!kelas) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ok = kelas.owner_id === callerId || (await semakPendidikKelas(supa, params.id, callerId));
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const svc = getServiceSupabase();

  // Hunt mesti milik kelas ini; 404 generik meliputi hunt kelas lain.
  const { data: hunt } = await svc
    .from('qm_hunts')
    .select('id, title')
    .eq('id', params.huntId)
    .eq('class_id', params.id)
    .maybeSingle();
  if (!hunt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Cabaran hunt; lajur answer tidak diambil.
  const { data: cabaranData, error: errCabaran } = await svc
    .from('qm_challenges')
    .select('id, title, points')
    .eq('hunt_id', params.huntId)
    .order('order_idx');
  if (errCabaran) {
    console.error('hunt results challenges failed');
    return NextResponse.json({ error: 'Failed to load results.' }, { status: 500 });
  }
  const cabaran = (cabaranData || []) as BarisCabaran[];
  const idsCabaran = cabaran.map((c) => c.id);

  // Semua hantaran kepada cabaran hunt ini.
  const { data: hantaranData, error: errHantaran } = await svc
    .from('qm_submissions')
    .select('challenge_id, user_id, status, created_at')
    .in('challenge_id', idsCabaran.length > 0 ? idsCabaran : [TIADA_UUID]);
  if (errHantaran) {
    console.error('hunt results submissions failed');
    return NextResponse.json({ error: 'Failed to load results.' }, { status: 500 });
  }
  const hantaran = (hantaranData || []) as BarisHantaran[];

  const petaMata = new Map<string, number>();
  for (const c of cabaran) petaMata.set(c.id, Number(c.points) || 0);

  // Cabaran: bilangan hantaran mengikut status.
  const challenges = cabaran.map((c) => {
    const milik = hantaran.filter((h) => h.challenge_id === c.id);
    const kira = (status: string) => milik.filter((h) => h.status === status).length;
    return {
      challenge_id: c.id,
      title: String(c.title ?? ''),
      points: Number(c.points) || 0,
      approved: kira('approved'),
      pending: kira('pending'),
      rejected: kira('rejected'),
    };
  });

  // Pelajar: semua ahli kelas, ahli tanpa hantaran = sifar.
  const { data: ahliData, error: errAhli } = await svc
    .from('qm_class_members')
    .select('user_id')
    .eq('class_id', params.id);
  if (errAhli) {
    console.error('hunt results members failed');
    return NextResponse.json({ error: 'Failed to load results.' }, { status: 500 });
  }
  const idsAhli = (ahliData || []).map((a: { user_id: string }) => String(a.user_id));

  const { data: profilData, error: errProfil } = await svc
    .from('qm_profiles')
    .select('id, display_name')
    .in('id', idsAhli.length > 0 ? idsAhli : [TIADA_UUID]);
  if (errProfil) {
    console.error('hunt results profiles failed');
    return NextResponse.json({ error: 'Failed to load results.' }, { status: 500 });
  }
  const petaNama = new Map<string, string>();
  for (const p of (profilData || []) as BarisProfil[]) {
    petaNama.set(String(p.id), String(p.display_name ?? ''));
  }

  interface StatistikAhli {
    approved_points: number;
    approved: number;
    pending: number;
    rejected: number;
    last_submitted_at: string | null;
  }
  const statAhli = new Map<string, StatistikAhli>();
  for (const h of hantaran) {
    const s =
      statAhli.get(h.user_id) ??
      { approved_points: 0, approved: 0, pending: 0, rejected: 0, last_submitted_at: null };
    if (h.status === 'approved') {
      s.approved_points += petaMata.get(h.challenge_id) ?? 0;
      s.approved += 1;
    } else if (h.status === 'pending') {
      s.pending += 1;
    } else if (h.status === 'rejected') {
      s.rejected += 1;
    }
    if (!s.last_submitted_at || h.created_at > s.last_submitted_at) {
      s.last_submitted_at = h.created_at;
    }
    statAhli.set(h.user_id, s);
  }

  const students = idsAhli.map((uid) => {
    const s =
      statAhli.get(uid) ??
      { approved_points: 0, approved: 0, pending: 0, rejected: 0, last_submitted_at: null };
    return {
      user_id: uid,
      name: petaNama.get(uid) ?? '',
      approved_points: s.approved_points,
      approved: s.approved,
      pending: s.pending,
      rejected: s.rejected,
      last_submitted_at: s.last_submitted_at,
    };
  });

  return NextResponse.json({
    data: {
      hunt_id: String(hunt.id),
      title: String(hunt.title ?? ''),
      challenges,
      students,
    },
  });
}
