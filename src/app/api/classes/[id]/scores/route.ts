import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { kedudukanSeri } from '@/lib/laporanMarkah';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai. Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * GET /api/classes/[id]/scores (V2-017)
 *
 * Markah terkumpul seluruh kelas untuk pendidik: pelajar (task, live,
 * pelarasan, jumlah, bilangan sesi Live Quiz) dan pasukan. Kedudukan pelajar
 * dikira ikut jumlah dengan seri berkongsi nombor yang sama.
 *
 * Kebenaran: pemilik kelas, pendidik kelas yang sudah menerima jemputan
 * (semakPendidikKelas) atau admin aktif. View qm_class_individual_scores
 * dibaca dengan KLIEN PEMANGGIL kerana penapis migrasi 0050 guna
 * auth.uid(); bacaan lain (kiraan ahli pasukan) melalui service role hanya
 * selepas semakan kebenaran. Tiada emel dalam hasil.
 *
 * Parameter: sort=total|task|live|name (lalai total), limit (lalai 200,
 * maksimum 500). `truncated: true` bila senarai pelajar dipotong.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUSUN_SAH = ['total', 'task', 'live', 'name'] as const;
const LIMIT_LALAI = 200;
const LIMIT_MAKS = 500;
const TIADA_UUID = '00000000-0000-0000-0000-000000000000';

interface BarisView {
  user_id: string;
  display_name: string | null;
  task_score: number | null;
  live_score: number | null;
  adjustment_score: number | null;
  total_score: number | null;
  live_sessions: number | null;
}

interface BarisPasukan {
  team_id: string;
  team_name: string;
  base_score: number;
  task_score: number;
  adjustment_score: number;
  total_score: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!UUID.test(String(params.id))) {
    return NextResponse.json({ error: 'Not a valid class id.' }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const sort = sp.get('sort') ?? 'total';
  if (!(SUSUN_SAH as readonly string[]).includes(sort)) {
    return NextResponse.json(
      { error: 'Invalid sort. Use total, task, live or name.' },
      { status: 400 },
    );
  }
  const limitRaw = Number(sp.get('limit'));
  const limit =
    Number.isFinite(limitRaw) && limitRaw >= 1
      ? Math.min(Math.floor(limitRaw), LIMIT_MAKS)
      : LIMIT_LALAI;

  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;
  const callerId = user!.id;

  // Had kadar 30 permintaan seminit bagi setiap pengguna.
  if (!dalamHad(`class-scores:${callerId}`, 30)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  // Kelas tidak wujud: 404 generik, sama corak dengan laluan export.
  const { data: kelas } = await supa
    .from('qm_classes')
    .select('id, owner_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!kelas) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Pemanggil MESTI pemilik kelas, pendidik kelas (jemputan diterima) atau
  // pentadbir. semakPendidikKelas merangkumi pendidik dan admin; pemilik
  // kelas disemak berasingan.
  const ok = kelas.owner_id === callerId || (await semakPendidikKelas(supa, params.id, callerId));
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // View markah melalui klien pemanggil (polisi 0050 guna auth.uid()).
  const { data: barisView, error: errView } = await supa
    .from('qm_class_individual_scores')
    .select(
      'user_id, display_name, task_score, live_score, adjustment_score, total_score, live_sessions',
    )
    .eq('class_id', params.id);
  if (errView) {
    console.error('class scores view failed', errView);
    return NextResponse.json({ error: 'Failed to load scores.' }, { status: 500 });
  }
  const semuaPelajar = (barisView || []) as BarisView[];

  // Kedudukan sentiasa ikut jumlah (seri berkongsi), walau apa pun susunan.
  const kedudukan = kedudukanSeri(semuaPelajar.map((b) => Number(b.total_score) || 0));
  const berKedudukan = semuaPelajar.map((b, i) => ({ baris: b, rank: kedudukan[i] }));

  const atur = (a: { baris: BarisView }, b: { baris: BarisView }): number => {
    const nama = (x: BarisView) => String(x.display_name ?? '');
    switch (sort) {
      case 'task':
        return (Number(b.baris.task_score) || 0) - (Number(a.baris.task_score) || 0);
      case 'live':
        return (Number(b.baris.live_score) || 0) - (Number(a.baris.live_score) || 0);
      case 'name':
        return nama(a.baris) < nama(b.baris) ? -1 : nama(a.baris) > nama(b.baris) ? 1 : 0;
      default:
        return (Number(b.baris.total_score) || 0) - (Number(a.baris.total_score) || 0);
    }
  };
  berKedudukan.sort(atur);

  const truncated = berKedudukan.length > limit;
  const students = berKedudukan.slice(0, limit).map((p) => ({
    rank: p.rank,
    user_id: p.baris.user_id,
    name: String(p.baris.display_name ?? ''),
    task: Number(p.baris.task_score) || 0,
    live: Number(p.baris.live_score) || 0,
    adjustment: Number(p.baris.adjustment_score) || 0,
    total: Number(p.baris.total_score) || 0,
    live_sessions: Number(p.baris.live_sessions) || 0,
  }));

  // Pasukan: view qm_class_team_scores tidak membawa kiraan ahli, jadi
  // ahli dikira melalui service role selepas kebenaran lulus.
  const { data: barisPasukan, error: errPasukan } = await supa
    .from('qm_class_team_scores')
    .select('team_id, team_name, base_score, task_score, adjustment_score, total_score')
    .eq('class_id', params.id);
  if (errPasukan) {
    console.error('class scores teams failed', errPasukan);
    return NextResponse.json({ error: 'Failed to load scores.' }, { status: 500 });
  }
  const pasukan = ((barisPasukan || []) as BarisPasukan[]).slice().sort(
    (a, b) => (Number(b.total_score) || 0) - (Number(a.total_score) || 0),
  );

  let teams: Array<{
    team_id: string;
    name: string;
    members: number;
    base: number;
    task: number;
    adjustment: number;
    total: number;
  }> = [];
  if (pasukan.length > 0) {
    const svc = getServiceSupabase();
    const idsPasukan = pasukan.map((t) => t.team_id);
    const { data: ahliPasukan, error: errAhli } = await svc
      .from('qm_team_members')
      .select('team_id, user_id')
      .in('team_id', idsPasukan.length > 0 ? idsPasukan : [TIADA_UUID]);
    if (errAhli) {
      console.error('class scores team members failed', errAhli);
      return NextResponse.json({ error: 'Failed to load scores.' }, { status: 500 });
    }
    const kiraan = new Map<string, number>();
    for (const m of (ahliPasukan || []) as Array<{ team_id: string }>) {
      kiraan.set(m.team_id, (kiraan.get(m.team_id) ?? 0) + 1);
    }
    teams = pasukan.map((t) => ({
      team_id: t.team_id,
      name: String(t.team_name ?? ''),
      members: kiraan.get(t.team_id) ?? 0,
      base: Number(t.base_score) || 0,
      task: Number(t.task_score) || 0,
      adjustment: Number(t.adjustment_score) || 0,
      total: Number(t.total_score) || 0,
    }));
  }

  return NextResponse.json({
    data: {
      students,
      teams,
    },
    sort,
    limit,
    truncated,
  });
}
