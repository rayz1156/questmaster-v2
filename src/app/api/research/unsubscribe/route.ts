import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import { hashToken, tokenBerbentukSah } from '@/lib/sijil/namaPenuh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * KZ-UTT Fasa 4: berhenti langganan e-mel kajian dan tarik diri, tanpa log
 * masuk, melalui token dalam e-mel susulan (hash sahaja disimpan dalam
 * qm_research_followups.unsub_token_hash).
 *
 * GET ?token=...   : { quiz, unsubscribed, withdrawn }
 * POST { token, withdraw? } : berhenti langganan; withdraw=true juga
 *   menarik diri daripada kajian (data tidak dieksport). Akses kelas tidak
 *   disentuh langsung.
 */
async function cari(token: unknown) {
  if (typeof token !== 'string' || !tokenBerbentukSah(token)) return null;
  const svc = getServiceSupabase();
  const { data: f } = await svc
    .from('qm_research_followups')
    .select('quiz_id, user_id')
    .eq('unsub_token_hash', hashToken(token))
    .maybeSingle();
  if (!f) return null;
  return { svc, quizId: f.quiz_id as string, userId: f.user_id as string };
}

export async function GET(req: NextRequest) {
  const c = await cari(req.nextUrl.searchParams.get('token'));
  if (!c) return ralatJson('This link is not valid.', 404);
  const { data: kuiz } = await c.svc.from('qm_live_quizzes').select('title').eq('id', c.quizId).maybeSingle();
  const { data: p } = await c.svc
    .from('qm_research_consents')
    .select('unsubscribed_at, withdrawn_at')
    .eq('quiz_id', c.quizId)
    .eq('user_id', c.userId)
    .maybeSingle();
  return NextResponse.json({
    quiz: kuiz?.title ?? '',
    unsubscribed: !!p?.unsubscribed_at,
    withdrawn: !!p?.withdrawn_at,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const c = await cari(body.token);
  if (!c) return ralatJson('This link is not valid.', 404);
  const sekarang = new Date().toISOString();
  const kemas: Record<string, string> = { unsubscribed_at: sekarang };
  if (body.withdraw === true) kemas.withdrawn_at = sekarang;
  const { data, error } = await c.svc
    .from('qm_research_consents')
    .update(kemas)
    .eq('quiz_id', c.quizId)
    .eq('user_id', c.userId)
    .is('unsubscribed_at', null)
    .select('quiz_id');
  if (error) return ralatJson(error.message, 500);
  // Sudah berhenti langganan sebelum ini: tarik diri masih boleh direkodkan.
  if ((data ?? []).length === 0 && body.withdraw === true) {
    const { error: wErr } = await c.svc
      .from('qm_research_consents')
      .update({ withdrawn_at: sekarang })
      .eq('quiz_id', c.quizId)
      .eq('user_id', c.userId)
      .is('withdrawn_at', null);
    if (wErr) return ralatJson(wErr.message, 500);
  }
  // Batalkan e-mel kajian yang masih menunggu untuk peserta ini.
  await c.svc
    .from('qm_research_followups')
    .update({ status: 'cancelled', cancel_reason: 'unsubscribed', updated_at: sekarang })
    .eq('quiz_id', c.quizId)
    .eq('user_id', c.userId)
    .eq('status', 'queued');
  return NextResponse.json({ ok: true, withdrawn: body.withdraw === true });
}
