import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import { muatKuizSolo, semakLarian, soalanSelamat } from '@/lib/lumba-solo-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * POST /api/solo/[code]/next, pengepala x-run-token.
 *
 * Hidangkan soalan seterusnya: {questionId, prompt, options, index, total},
 * TANPA correct_key (lajur selamat sahaja). Soalan semasa yang belum
 * dijawab dipulangkan semula tanpa reset masa, jadi memanggil semula tidak
 * boleh melompat. Bila soalan habis: {done: true}.
 */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const svc = getServiceSupabase();
  const kuiz = await muatKuizSolo(svc, params.code);
  if (!kuiz) return ralatJson('Challenge not found.', 404);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const semakan = await semakLarian(req, svc, kuiz, body.runToken);
  if (semakan.response) return semakan.response;
  const larian = semakan.larian!;
  if (larian.status !== 'playing') {
    return ralatJson('This run has already finished.', 409);
  }

  const idx = larian.next_idx;
  const total = larian.question_ids.length;
  if (idx >= total) return NextResponse.json({ done: true });

  // Soalan semasa sudah dihidangkan: pulang semula (masa terus berjalan,
  // tidak boleh memanggil semula untuk memanjangkan masa).
  if (larian.served_at === null) {
    const dihidang = new Date().toISOString();
    const { data: upd } = await svc
      .from('qm_solo_runs')
      .update({ served_at: dihidang })
      .eq('id', larian.id)
      .eq('status', 'playing')
      .eq('next_idx', idx)
      .is('served_at', null)
      .select('id, served_at')
      .maybeSingle();
    if (!upd) {
      return ralatJson('This run has already finished.', 409);
    }
  }

  const soalanId = larian.question_ids[idx] as string;
  const soalan = await soalanSelamat(svc, soalanId);
  if (!soalan) return ralatJson('Could not read the question.', 500);

  return NextResponse.json({
    questionId: soalan.id,
    prompt: soalan.prompt,
    options: soalan.options,
    index: idx,
    total,
  });
}