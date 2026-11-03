/**
 * POST /api/lna/rounds/[roundId]/respond: pelajar menghantar atau
 * mengemas kini jawapan satu pusingan terbuka.
 *
 * KZ-035. Badan: { answers: [{ itemId, importance, currentLevel }] }.
 * KZ-038: kunci item ialah itemId (id qm_lna_items); keserasian klien
 * lama: jika itemId tiada tetapi outcomeId ada, padankan kepada item
 * Outcome LNA itu. Jawapan mesti meliputi SEMUA item LNA dengan nilai
 * integer 1 hingga 5; item yang bukan milik LNA ini ditolak 400 (kzsec:
 * pelajar tidak boleh menyuntik item kelas lain). Jawapan selepas
 * pusingan ditutup ditolak 409. Had kadar 10 seminit bagi setiap
 * pelajar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaJsonKecil } from '@/lib/bilikAi';
import { aksesRound, ralatLna } from '@/lib/lnaAkses';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Item LNA seperti yang dimuat untuk semakan jawapan. */
interface ItemUntukJawap {
  id: string;
  outcome_id: string | null;
}

interface JawapanMasuk {
  itemId: string;
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
    return ralatJson('Too many requests. Please try again shortly.', 429);
  }

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  const body = hasil.body;

  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return ralatJson('answers must be a non-empty list.', 400);
  }

  // Muat item LNA dahulu supaya keserasian outcomeId (klien lama dalam
  // cache) boleh dipadankan kepada itemId (KZ-038).
  const { data: itemsData } = await supa
    .from('qm_lna_items')
    .select('id, outcome_id')
    .eq('lna_id', lna.id);
  const items = (itemsData ?? []) as ItemUntukJawap[];
  const itemById = new Map<string, ItemUntukJawap>(items.map((i) => [i.id, i]));
  // Peta keserasian: outcome_id -> item (hanya item Outcome).
  const itemByOutcome = new Map<string, ItemUntukJawap>();
  for (const i of items) {
    if (i.outcome_id != null) itemByOutcome.set(i.outcome_id, i);
  }

  const jawapan: JawapanMasuk[] = [];
  for (const a of body.answers) {
    if (!a || typeof a !== 'object') {
      return ralatJson('The answer format is invalid.', 400);
    }
    const o = a as Record<string, unknown>;
    // Pembetulan CTO (kzsec #3): mesti nombor JSON sebenar; boole,
    // rentetan atau tatasusunan ditolak sebelum dipaksa.
    if (typeof o.importance !== 'number' || typeof o.currentLevel !== 'number') {
      return ralatJson('Importance and current level must be integers from 1 to 5.', 400);
    }
    const importance = o.importance;
    const currentLevel = o.currentLevel;
    if (
      !Number.isInteger(importance) || importance < 1 || importance > 5
      || !Number.isInteger(currentLevel) || currentLevel < 1 || currentLevel > 5
    ) {
      return ralatJson('Importance and current level must be integers from 1 to 5.', 400);
    }
    if (typeof o.itemId === 'string') {
      jawapan.push({ itemId: o.itemId, importance, currentLevel });
      continue;
    }
    // Keserasian klien lama: outcomeId dipadankan kepada item Outcome
    // LNA ini (KZ-038).
    if (typeof o.outcomeId === 'string') {
      const item = itemByOutcome.get(o.outcomeId);
      if (!item) {
        return ralatJson('The Outcome is not an item of this LNA.', 400);
      }
      jawapan.push({ itemId: item.id, importance, currentLevel });
      continue;
    }
    return ralatJson('itemId must be text.', 400);
  }

  // Jawapan selepas pusingan ditutup ditolak 409.
  if (round.status !== 'open') {
    return ralatJson('This round is already closed.', 409);
  }

  // Jawapan mesti meliputi SEMUA item LNA ini, tanpa item asing dan
  // tanpa duplikat (kzsec: itemId daripada LNA kelas lain ditolak).
  if (items.length === 0) {
    return ralatJson('This LNA has no items.', 400);
  }
  const dilihat = new Set<string>();
  for (const j of jawapan) {
    if (!itemById.has(j.itemId)) {
      return ralatJson('The item is not an item of this LNA.', 400);
    }
    if (dilihat.has(j.itemId)) {
      return ralatJson('Some items were answered more than once.', 400);
    }
    dilihat.add(j.itemId);
  }
  if (dilihat.size !== items.length) {
    return ralatJson('The answers must cover every item.', 400);
  }

  // Upsert: pelajar boleh mengemas kini selagi pusingan dibuka.
  // outcome_id diisi bagi item Outcome, null bagi item bebas (KZ-038).
  const sekarang = new Date().toISOString();
  const baris = jawapan.map((j) => ({
    round_id: round.id,
    user_id: user.id,
    item_id: j.itemId,
    outcome_id: itemById.get(j.itemId)?.outcome_id ?? null,
    importance: j.importance,
    current_level: j.currentLevel,
    submitted_at: sekarang,
  }));
  const { error } = await supa
    .from('qm_lna_responses')
    .upsert(baris, { onConflict: 'round_id,user_id,item_id' });
  if (error) {
    console.error('[lna] simpan jawapan gagal:', error.message);
    return ralatJson('The answers could not be saved.', 500);
  }

  return NextResponse.json({ ok: true, count: baris.length });
}
