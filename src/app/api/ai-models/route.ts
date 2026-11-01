/**
 * GET /api/ai-models: senarai model AI yang didayakan untuk pemilih
 * Bilik AI (KZ-033).
 *
 `model_id` OpenRouter ialah id awam (cth 'deepseek/deepseek-v4-flash'),
 * bukan rahsia; kunci API tidak pernah dikirim dari sini.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan Supabase dalam route handler; semua
// keadaan bilik mesti dibaca segar dari pangkalan data.
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const supa = getServiceSupabase();
  const { data, error } = await supa
    .from('qm_ai_models')
    .select('id, label, is_default, model_id, sort_order')
    .eq('enabled', true)
    .order('sort_order', { ascending: true });
  if (error) {
    return NextResponse.json({ error: 'Senarai model tidak dapat dibaca.' }, { status: 500 });
  }
  return NextResponse.json({ models: data ?? [] });
}