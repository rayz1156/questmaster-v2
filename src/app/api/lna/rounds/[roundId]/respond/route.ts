/**
 * POST /api/lna/rounds/[roundId]/respond: pelajar menghantar atau
 * mengemas kini jawapan satu pusingan terbuka.
 *
 * KZ-035. Badan: { answers: [{ outcomeId, importance, currentLevel }] }.
 * Jawapan mesti meliputi SEMUA item LNA dengan nilai integer 1 hingga
 * 5; outcome yang bukan item LNA ini ditolak 400 (kzsec: pelajar tidak
 * boleh menyuntik outcome kelas lain). Jawapan selepas pusingan
 * ditutup ditolak 409. Had kadar 10 seminit bagi setiap pelajar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaJsonKecil } from '@/lib/bilikAi';
import { aksesRound, ralatLna } from '@/lib/lnaAkses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface JawapanMasuk {
  outcomeId: string;
  importance: number;
  currentLevel: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { roundId: string } },
) {
  const akses = await aksesRound(req, String(params.roundId ?? ''));
  if (akses.response) return akses.response;
  // Hanya pelajar menjawab; guru tidak mengisi borang keperluan.
  if (akses.role !== 'student') {
    return ralatLna(403, 'STUDENT_ONLY', 'Hanya pelajar boleh menjawab LNA.');
  }
  const supa = akses.supa!;
  const round = akses.round!;
  const lna = akses.lna!;
  const user = akses.user!;

  if (!dalamHad(`lna:${user.id}`, 10)) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Cuba lagi sebentar.' },
      { status: 429 },
    );
  }

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  const body = hasil.body;

  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return NextResponse.json(
      { error: 'answers mesti senarai tidak kosong.' },
      { status: 400 },
    );
  }

  const jawapan: JawapanMasuk[] = [];
  for (const a of body.answers) {
    if (!a || typeof a !== 'object') {
      return NextResponse.json({ error: 'Format jawapan tidak sah.' }, { status: 400 });
    }
    const o = a as Record<string, unknown>;
    if (typeof o.outcomeId !== 'string') {
      return NextResponse.json({ error: 'outcomeId mesti teks.' }, { status: 400 });
    }
    // Pembetulan CTO (kzsec #3): mesti nombor JSON sebenar; boole,
    // rentetan atau tatasusunan ditolak sebelum dipaksa.
    if (typeof o.importance !== 'number' || typeof o.currentLevel !== 'number') {
      return NextResponse.json(
        { error: 'Kepentingan dan tahap semasa mesti integer 1 hingga 5.' },
        { status: 400 },
      );
    }
    const importance = o.importance;
    const currentLevel = o.currentLevel;
    if (
      !Number.isInteger(importance) || importance < 1 || importance > 5
      || !Number.isInteger(currentLevel) || currentLevel < 1 || currentLevel > 5
    ) {
      return NextResponse.json(
        { error: 'Kepentingan dan tahap semasa mesti integer 1 hingga 5.' },
        { status: 400 },
      );
    }
    jawapan.push({ outcomeId: o.outcomeId, importance, currentLevel });
  }

  // Jawapan selepas pusingan ditutup ditolak 409.
  if (round.status !== 'open') {
    return NextResponse.json(
      { error: 'Pusingan ini sudah ditutup.' },
      { status: 409 },
    );
  }

  // Jawapan mesti meliputi SEMUA item LNA ini, tanpa item asing dan
  // tanpa duplikat.
  const { data: items } = await supa
    .from('qm_lna_items')
    .select('outcome_id')
    .eq('lna_id', lna.id);
  const idsItem = new Set(((items ?? []) as { outcome_id: string }[]).map((r) => r.outcome_id));
  if (idsItem.size === 0) {
    return NextResponse.json(
      { error: 'LNA ini tiada item.' },
      { status: 400 },
    );
  }
  const dilihat = new Set<string>();
  for (const j of jawapan) {
    if (!idsItem.has(j.outcomeId)) {
      return NextResponse.json(
        { error: 'Outcome bukan item LNA ini.' },
        { status: 400 },
      );
    }
    if (dilihat.has(j.outcomeId)) {
      return NextResponse.json(
        { error: 'Ada item dijawab lebih daripada sekali.' },
        { status: 400 },
      );
    }
    dilihat.add(j.outcomeId);
  }
  if (dilihat.size !== idsItem.size) {
    return NextResponse.json(
      { error: 'Jawapan mesti meliputi semua item.' },
      { status: 400 },
    );
  }

  // Upsert: pelajar boleh mengemas kini selagi pusingan dibuka.
  const sekarang = new Date().toISOString();
  const baris = jawapan.map((j) => ({
    round_id: round.id,
    user_id: user.id,
    outcome_id: j.outcomeId,
    importance: j.importance,
    current_level: j.currentLevel,
    submitted_at: sekarang,
  }));
  const { error } = await supa
    .from('qm_lna_responses')
    .upsert(baris, { onConflict: 'round_id,user_id,outcome_id' });
  if (error) {
    console.error('[lna] simpan jawapan gagal:', error.message);
    return NextResponse.json({ error: 'Jawapan tidak dapat disimpan.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: baris.length });
}
