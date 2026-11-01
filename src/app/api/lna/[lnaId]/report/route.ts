/**
 * GET /api/lna/[lnaId]/report: laporan keutamaan LNA (guru sahaja).
 *
 * KZ-035. Menggunakan enjin skor tulen src/lib/lna.ts: Borich MWDS,
 * RDM RDS, kuadran IPA, Spearman rho dan bendera keyakinan lawan
 * penguasaan. Laporan setiap pusingan menggunakan mastery SNAPSHOT
 * pusingan itu jika ada (disimpan semasa ditutup), jika tidak mastery
 * semasa; delta pra/pasca hanya daripada snapshot (null jika tiada).
 * Pelajar tidak pernah dibenarkan membaca laporan (403).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';
import { namaPaparanProfil } from '@/lib/bilikAi';
import { aksesLna, ralatLna, type RoundRow } from '@/lib/lnaAkses';
import {
  binaLaporanLna,
  binaPerbandinganLna,
  senaraiMasteryDaripadaSummary,
  type ItemLna,
  type JawapanLna,
  type LaporanLna,
  type MasteryLna,
  type PerbandinganLna,
} from '@/lib/lna';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(
  req: NextRequest,
  { params }: { params: { lnaId: string } },
) {
  const akses = await aksesLna(req, String(params.lnaId ?? ''));
  if (akses.response) return akses.response;
  if (akses.role !== 'teacher') {
    return ralatLna(403, 'TEACHER_ONLY', 'Hanya guru boleh membaca laporan LNA.');
  }
  const supa = akses.supa!;
  const lna = akses.lna!;

  // Item LNA ikut susunan.
  const { data: itemsData, error: errItems } = await supa
    .from('qm_lna_items')
    .select('outcome_id, position, qm_learning_outcomes(label)')
    .eq('lna_id', lna.id)
    .order('position', { ascending: true });
  if (errItems) {
    console.error('[lna] baca item gagal:', errItems.message);
    return NextResponse.json({ error: 'Laporan tidak dapat dibina.' }, { status: 500 });
  }
  const items: ItemLna[] = ((itemsData ?? []) as unknown as {
    outcome_id: string;
    qm_learning_outcomes: { label: string | null }[] | null;
  }[]).map((i) => ({
    outcomeId: i.outcome_id,
    label: (i.qm_learning_outcomes?.[0]?.label ?? '') as string,
  }));

  // Semua jawapan LNA ini melalui pusingannya.
  const { data: roundsData, error: errRounds } = await supa
    .from('qm_lna_rounds')
    .select('id, lna_id, kind, status, opened_at, closed_at, mastery_snapshot')
    .eq('lna_id', lna.id)
    .order('opened_at', { ascending: true });
  if (errRounds) {
    console.error('[lna] baca pusingan gagal:', errRounds.message);
    return NextResponse.json({ error: 'Laporan tidak dapat dibina.' }, { status: 500 });
  }
  const rounds = (roundsData ?? []) as RoundRow[];

  const { data: responsesData, error: errResp } = await supa
    .from('qm_lna_responses')
    .select('round_id, user_id, outcome_id, importance, current_level, submitted_at')
    .in('round_id', rounds.length > 0 ? rounds.map((r) => r.id) : ['00000000-0000-0000-0000-000000000000']);
  if (errResp) {
    console.error('[lna] baca jawapan gagal:', errResp.message);
    return NextResponse.json({ error: 'Laporan tidak dapat dibina.' }, { status: 500 });
  }
  const semuaJawapan = (responsesData ?? []) as {
    round_id: string;
    user_id: string;
    outcome_id: string;
    importance: number;
    current_level: number;
    submitted_at: string;
  }[];

  const jawapanRound = (roundId: string): JawapanLna[] =>
    semuaJawapan
      .filter((r) => r.round_id === roundId)
      .map((r) => ({
        userId: r.user_id,
        outcomeId: r.outcome_id,
        importance: r.importance,
        currentLevel: r.current_level,
      }));

  // Mastery semasa dengan klien Bearer guru (kebenaran dalam RPC).
  const supaBearer = getRouteSupabase(req);
  const { data: masteryKini, error: errRpc } = await supaBearer.rpc(
    'qm_mastery_summary',
    { p_class_id: lna.class_id },
  );
  if (errRpc || !masteryKini) {
    console.error('[lna] mastery rpc gagal:', errRpc?.message);
    return NextResponse.json({ error: 'Laporan tidak dapat dibina.' }, { status: 500 });
  }
  const masterySemasa = senaraiMasteryDaripadaSummary(masteryKini);

  // Laporan setiap pusingan: snapshot pusingan jika ada, jika tidak
  // mastery semasa.
  const roundPra = rounds.find((r) => r.kind === 'pre') ?? null;
  const roundPasca = rounds.find((r) => r.kind === 'post') ?? null;

  const masteryRound = (round: RoundRow | null): MasteryLna[] => {
    if (!round) return [];
    if (round.mastery_snapshot != null) {
      return senaraiMasteryDaripadaSummary(round.mastery_snapshot);
    }
    return masterySemasa;
  };

  let pra: LaporanLna | null = null;
  let pasca: LaporanLna | null = null;
  if (roundPra && jawapanRound(roundPra.id).length > 0) {
    pra = binaLaporanLna({
      items,
      jawapan: jawapanRound(roundPra.id),
      mastery: masteryRound(roundPra),
    });
  }
  if (roundPasca && jawapanRound(roundPasca.id).length > 0) {
    pasca = binaLaporanLna({
      items,
      jawapan: jawapanRound(roundPasca.id),
      mastery: masteryRound(roundPasca),
    });
  }

  // Perbandingan pra/pasca hanya jika kedua-dua pusingan ada jawapan;
  // delta mastery hanya daripada snapshot (null jika tiada).
  let perbandingan: PerbandinganLna | null = null;
  if (pra && pasca && roundPra && roundPasca) {
    perbandingan = binaPerbandinganLna({
      items,
      jawapanPra: jawapanRound(roundPra.id),
      jawapanPasca: jawapanRound(roundPasca.id),
      masteryPra:
        roundPra.mastery_snapshot != null
          ? senaraiMasteryDaripadaSummary(roundPra.mastery_snapshot)
          : null,
      masteryPasca:
        roundPasca.mastery_snapshot != null
          ? senaraiMasteryDaripadaSummary(roundPasca.mastery_snapshot)
          : null,
    });
  }

  // Nama paparan semua pelajar yang menjawab (corak namaPaparanProfil).
  const ids: string[] = [];
  for (const r of semuaJawapan) {
    if (ids.indexOf(r.user_id) < 0) ids.push(r.user_id);
  }
  const nama = await namaPaparanProfil(supa, ids);

  const metaRound = (r: RoundRow) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    jawapan: jawapanRound(r.id).length,
  });

  return NextResponse.json({
    lna: { id: lna.id, title: lna.title, classId: lna.class_id },
    rounds: rounds.map(metaRound),
    pra,
    pasca,
    perbandingan,
    pelajar: ids.map((id) => ({ userId: id, nama: nama.get(id) ?? `User ${id.slice(0, 8)}` })),
  });
}
