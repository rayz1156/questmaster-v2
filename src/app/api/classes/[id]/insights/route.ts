import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/classes/[id]/insights (V2-014a)
 *
 * Data Insights markah kelas untuk tab Insights (UI ialah V2-014b):
 * pulse, students (markah, trend, flags), distribution, hard_questions,
 * hard_challenges dan teams, semuanya dikira oleh RPC qm_insights_kelas
 * (migrasi 0051).
 *
 * Kebenaran dijalankan DALAM fungsi SQL (qm_boleh_urus_insights: pemilik,
 * educator diterima, admin aktif atau service_role; ahli biasa ditolak),
 * jadi RPC dipanggil dengan klien Bearer PEMANGGIL, bukan service role.
 * Forbidden dipetakan kepada 403; ralat lain 500 generik tanpa mesej
 * dalaman supaya butiran pangkalan data tidak bocor.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Tolak parameter bukan UUID (kzsec: IDOR pada [id]).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(String(params.id))) {
    return ralatJson('Not a valid class id.', 400);
  }

  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;

  // Had kadar 30 permintaan seminit bagi setiap pengguna.
  if (!dalamHad(`insights:${user!.id}`, 30)) {
    return ralatJson('Too many requests. Please try again in a minute.', 429);
  }

  // Klien pemanggil: penapis kebenaran 0051 guna auth.uid() pemanggil.
  const { data, error } = await supa.rpc('qm_insights_kelas', {
    p_class_id: params.id,
  });
  if (error) {
    if (error.message === 'Forbidden') {
      return ralatJson('Forbidden', 403);
    }
    console.error('insights rpc failed', error);
    return ralatJson('Failed to load insights.', 500);
  }
  if (!data) {
    return ralatJson('Failed to load insights.', 500);
  }

  return NextResponse.json({ data });
}
