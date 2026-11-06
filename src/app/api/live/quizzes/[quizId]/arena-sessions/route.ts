/**
 * POST /api/live/quizzes/[quizId]/arena-sessions (KZ-045)
 *
 * Cipta sesi Arena yang memakan soalan daripada bank Kuiz tunggal
 * (qm_live_questions) melalui qm_arena_sessions.quiz_id; set_id kekal null.
 * Arena memainkan SEMUA 6 jenis soalan, jadi semakan "kuiz tiada soalan"
 * mengira semua soalan, tidak seperti laluan sesi Live yang menapis
 * soalan serasi Live.
 *
 * Kebenaran: requireQuizHost (pemilik kuiz, pendidik kelas atau admin).
 * Badan: {mode, view, mapId?, teamCount?}; view menerima
 * list|map|pulau|hantu (pulau = Pulau Harta Karun KZ-047, hantu =
 * Kejar Hantu KZ-048).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { requireQuizHost } from '@/lib/live-quiz';
import { makeSessionCode } from '@/lib/arena/public';
import { ARENA_MAPS } from '@/lib/arena/maps';
import { ARENA_MODES, type ArenaMode, type ArenaSession, type ArenaView } from '@/lib/arena/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan Supabase di dalam route handler secara lalai;
// paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

const PAPARAN_SAHAH: readonly string[] = ['list', 'map', 'pulau', 'hantu'];

export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response || !host.quiz || !host.user) {
    return host.response || ralatJson('Quiz not found.', 404);
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return ralatJson('Invalid body', 400);
  const mode = String(body.mode ?? '') as ArenaMode;
  if (!(ARENA_MODES as readonly string[]).includes(mode)) return ralatJson('Invalid mode', 400);
  const paparan = String(body.view ?? 'list');
  if (!PAPARAN_SAHAH.includes(paparan)) return ralatJson('Invalid view', 400);
  const view = paparan as ArenaView;
  const mapIdRaw = typeof body.mapId === 'string' ? body.mapId : '';
  const mapId = ARENA_MAPS.some((m) => m.id === mapIdRaw) ? mapIdRaw : (ARENA_MAPS[0]?.id ?? 'kampus');
  const tcRaw = Number(body.teamCount ?? 2);
  const teamCount = Number.isFinite(tcRaw) ? Math.min(4, Math.max(2, Math.round(tcRaw))) : 2;

  // Arena memainkan keenam-enam jenis; semak kewujudan soalan secara umum.
  const { count } = await host.supa
    .from('qm_live_questions')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', params.quizId);
  if (!count) return ralatJson('This quiz has no questions.', 400);

  // cuba kod unik sehingga 5 kali (corak laluan sesi set Arena)
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await host.supa
      .from('qm_arena_sessions')
      .insert({
        quiz_id: params.quizId,
        set_id: null,
        host_id: host.user.id,
        code: makeSessionCode(),
        mode,
        view,
        map_id: mapId,
        team_count: teamCount,
      })
      .select('*')
      .single();
    if (!error && data) return NextResponse.json({ session: data as ArenaSession });
    if (error && error.code !== '23505') return ralatJson(error.message, 500);
  }
  return ralatJson('Could not generate a unique session code', 500);
}
