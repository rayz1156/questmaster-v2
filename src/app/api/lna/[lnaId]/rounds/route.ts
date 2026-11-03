/**
 * POST /api/lna/[lnaId]/rounds: buka pusingan PRA atau PASCA (guru).
 *
 * KZ-035. Satu pusingan bagi setiap jenis (unique lna_id + kind,
 * migrasi 0070): 409 jika sudah wujud. Pusingan PASCA hanya boleh
 * dibuka selepas pusingan PRA ditutup, supaya urutan pra -> ajar ->
 * pasca -> banding sentiasa jelas.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bacaJsonKecil } from '@/lib/bilikAi';
import { aksesLna, ralatLna } from '@/lib/lnaAkses';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(
  req: NextRequest,
  { params }: { params: { lnaId: string } },
) {
  const akses = await aksesLna(req, String(params.lnaId ?? ''));
  if (akses.response) return akses.response;
  if (akses.role !== 'teacher') {
    return ralatLna(403, 'TEACHER_ONLY', 'Hanya guru boleh membuka pusingan.');
  }
  const supa = akses.supa!;
  const lna = akses.lna!;

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  const body = hasil.body;

  const kind = String(body.kind ?? '');
  if (kind !== 'pre' && kind !== 'post') {
    return ralatJson('kind mesti pre atau post.', 400);
  }

  const { data: sedia } = await supa
    .from('qm_lna_rounds')
    .select('id, kind, status')
    .eq('lna_id', lna.id);
  const pusingan = (sedia ?? []) as { id: string; kind: string; status: string }[];

  if (pusingan.some((r) => r.kind === kind)) {
    return ralatJson('Pusingan ini sudah wujud untuk LNA.', 409);
  }

  if (kind === 'post') {
    const pra = pusingan.find((r) => r.kind === 'pre');
    if (!pra || pra.status !== 'closed') {
      return ralatJson('Pusingan PASCA hanya boleh dibuka selepas pusingan PRA ditutup.', 409);
    }
  }

  const { data: round, error } = await supa
    .from('qm_lna_rounds')
    .insert({ lna_id: lna.id, kind })
    .select('id, lna_id, kind, status, opened_at, closed_at, mastery_snapshot')
    .single();
  if (error || !round) {
    console.error('[lna] buka pusingan gagal:', error?.message);
    return ralatJson('Pusingan tidak dapat dibuka.', 500);
  }

  return NextResponse.json({ round }, { status: 201 });
}
