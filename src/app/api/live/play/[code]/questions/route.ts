/**
 * GET /api/live/play/[code]/questions?playerId= — muat turun soalan sekali.
 *
 * Laluan ini memulangkan SEMUA soalan sesi TANPA correct_key, beserta satu
 * tag `version` (hash pendek bagi senarai id soalan dan order_idx). Klien
 * pemain memanggilnya sekali semasa menyertai dan menyimpan balasan dalam
 * localStorage. Klien memanggil semula hanya apabila `version` daripada
 * laluan state berbeza.
 *
 * KESELAMATAN: correct_key TIDAK keluar dalam balasan ini. Senarai lajur
 * eksplisit tanpa correct_key; objek balasan dibina secara eksplisit — tiada
 * spread baris pangkalan data. Kunci jawapan hanya muncul dalam blok reveal
 * pada laluan state selepas status menjadi 'revealed'.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai. Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

interface SessionRow { id: string; quiz_id: string; }
interface PlayerRow { id: string; }
interface QuestionRow {
  id: string; order_idx: number; prompt: string;
  options: { key: string; text: string }[];
  points: number; time_limit_sec: number;
}

/** Hash pendek bagi senarai id soalan dan order_idx. */
function versionTag(rows: { id: string; order_idx: number }[]): string {
  const raw = rows.map((r) => `${r.id}|${r.order_idx}`).join(';');
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').toUpperCase();
  const playerId = req.nextUrl.searchParams.get('playerId') || '';
  if (!playerId) {
    return NextResponse.json({ error: 'playerId is required.' }, { status: 400 });
  }

  const supa = getServiceSupabase();

  const { data: session } = (await supa
    .from('qm_live_sessions')
    .select('id, quiz_id')
    .eq('code', code)
    .maybeSingle()) as { data: SessionRow | null };
  if (!session) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  // Sahkan playerId milik sesi itu sebelum memulangkan apa-apa.
  const { data: player } = (await supa
    .from('qm_live_players')
    .select('id')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .maybeSingle()) as { data: PlayerRow | null };
  if (!player) {
    return NextResponse.json({ error: 'Player not found in this session.' }, { status: 403 });
  }

  // Senarai lajur eksplisit TANPA correct_key.
  const { data: questions } = (await supa
    .from('qm_live_questions')
    .select('id, order_idx, prompt, options, points, time_limit_sec')
    .eq('quiz_id', session.quiz_id)
    .order('order_idx')) as { data: QuestionRow[] | null };

  const senarai = (questions || []).map((q) => ({
    id: q.id,
    orderIdx: q.order_idx,
    prompt: q.prompt,
    options: q.options,
    points: q.points,
    timeLimitSec: q.time_limit_sec,
  }));

  return NextResponse.json({
    version: versionTag(questions || []),
    questions: senarai,
  });
}
