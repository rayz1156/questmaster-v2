import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { parseTeamCsv, TEAMS_CSV_MAX_BYTES } from '@/lib/team-import';

// Mesej had pelan, disalin kecil di sini. JANGAN import '@/lib/pelan':
// ia membina klien Supabase pelayar pada skop modul dan laluan API tidak
// patut bergantung padanya (build tanpa env akan gagal di sini).
const MESEJ_HAD: Record<string, string> = {
  QM_PLAN_FREE:
    'This feature is not part of the free plan. The free plan covers quizzes only.',
  QM_LIMIT_CLASSES: 'You have reached your class limit.',
  QM_LIMIT_QUIZZES: 'You have reached your quiz limit.',
  QM_LIMIT_PLAYERS: 'This session is full.',
  QM_FORBIDDEN: 'Only an administrator can do this.',
  QM_BAD_PLAN: 'Invalid plan.',
};
function mesejHadError(e: { message?: string }): string {
  const teks = e.message ?? '';
  for (const kod of Object.keys(MESEJ_HAD)) if (teks.includes(kod)) return MESEJ_HAD[kod];
  return teks || 'Something went wrong.';
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai. Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * POST /api/classes/[id]/teams/import-csv
 * Badan: {content, replace}. Parameter ?dryRun=1 pulangkan pratonton tanpa
 * menulis apa apa. Balas: ringkasan import/pratonton, atau 400 dengan
 * {errors:[{row,message}]}.
 *
 * Auth: Bearer token (bukan kuki), lihat src/lib/supabase-route.ts.
 * Semakan pemanggil (pemilik atau pendidik kelas) berlaku di dalam fungsi
 * pangkalan data qm_import_class_teams, yang juga menjalankan seluruh
 * import dalam SATU transaksi: kalau mana mana baris gagal, semua
 * digulung semula, jadi tiada kumpulan separuh jadi.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  const body = await req.json().catch(() => ({}));
  if (typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json({ error: 'A CSV file is required.' }, { status: 400 });
  }
  if (body.content.length > TEAMS_CSV_MAX_BYTES) {
    return NextResponse.json(
      { error: 'That file is too large. The limit is about 500 KB.' },
      { status: 400 },
    );
  }

  const { rows, errors } = parseTeamCsv(body.content);
  if (errors.length > 0) {
    return NextResponse.json(
      { ok: false, error: 'Nothing was imported. Fix the rows below and upload again.', errors },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supa.rpc('qm_import_class_teams', {
    p_class_id: params.id,
    p_rows: rows,
    p_replace: body.replace === true,
    p_dry_run: dryRun,
  });
  if (error) {
    const teks = error.message || '';
    if (Object.keys(MESEJ_HAD).some((kod) => teks.includes(kod))) {
      // Mesej pelan yang betul, bukan ralat Postgres mentah.
      return NextResponse.json({ error: mesejHadError(error) }, { status: 403 });
    }
    if (teks.includes('QM_FORBIDDEN')) {
      return NextResponse.json({ error: 'Only an educator of this class can import teams.' }, { status: 403 });
    }
    if (teks.includes('QM_NOT_FOUND')) {
      return NextResponse.json({ error: 'Class not found.' }, { status: 404 });
    }
    if (teks.includes('QM_LEADER_CONFLICT')) {
      return NextResponse.json(
        { ok: false, error: teks.replace(/^QM_LEADER_CONFLICT:\s*/, ''), errors: [] },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: teks || 'Something went wrong.' }, { status: 400 });
  }

  return NextResponse.json(data);
}