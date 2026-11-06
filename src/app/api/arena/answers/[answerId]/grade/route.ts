// Gred manual satu jawapan (esei) oleh hos / pemilik set; kira semula jumlah markah pemain.
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { requireSessionHost } from '@/lib/arena/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function PATCH(req: NextRequest, { params }: { params: { answerId: string } }) {
  const { data: ans } = await getServiceSupabase()
    .from('qm_arena_answers')
    .select('id, session_id, player_id, question_id')
    .eq('id', params.answerId)
    .maybeSingle();
  if (!ans) return ralatJson('Not found', 404);
  const row = ans as { id: string; session_id: string; player_id: string; question_id: string };
  const host = await requireSessionHost(req, row.session_id);
  if (host.response || !host.session || !host.user) return host.response ?? ralatJson('Not found', 404);
  const svc = host.svc;

  const body = (await req.json().catch(() => null)) as { isCorrect?: unknown; score?: unknown } | null;
  if (!body || typeof body.isCorrect !== 'boolean') return ralatJson('isCorrect must be a boolean', 400);
  const { data: q } = await svc.from('qm_arena_questions').select('points').eq('id', row.question_id).maybeSingle();
  const points = Number((q as { points?: number } | null)?.points) || 0;
  let score = body.isCorrect ? points : 0;
  if (body.score !== undefined && body.score !== null) {
    const n = Number(body.score);
    if (!Number.isFinite(n)) return ralatJson('score must be a number', 400);
    score = Math.min(10000, Math.max(0, Math.round(n)));
  }

  const { error } = await svc
    .from('qm_arena_answers')
    .update({ is_correct: body.isCorrect, score, graded_by: host.user.id, graded_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) return ralatJson(error.message, 500);

  // jumlah markah pemain = hasil tambah markah jawapan
  const { data: all } = await svc.from('qm_arena_answers').select('score').eq('player_id', row.player_id);
  const total = ((all ?? []) as { score: number }[]).reduce((s, a) => s + (Number(a.score) || 0), 0);
  const { error: pErr } = await svc.from('qm_arena_players').update({ score: total }).eq('id', row.player_id);
  if (pErr) return ralatJson(pErr.message, 500);
  return NextResponse.json({ ok: true });
}
