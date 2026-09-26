import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';
import { balasRalatPeer, pusinganPendidik } from '@/lib/peer-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/classes/[id]/peer-rounds/[roundId]/results
 * Papan pemuka pendidik: satu baris bagi setiap pelajar (nama, kumpulan,
 * P, F, Fmod, bendera, SEMAK, KUMPULAN BERISIKO), senarai justifikasi
 * dikumpulkan mengikut pelajar yang dinilai, dan senarai ahli yang TIDAK
 * menghantar borang.
 *
 * KERAHSIAAN: nama penilai TIDAK PERNAH dipilih, jadi identiti penilai
 * tidak pernah sampai ke pelayar (bukan sekadar disembunyikan dalam CSS).
 * RLS membenarkan pendidik kelas sahaja membaca jadual keputusan.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string; roundId: string } }) {
  const cek = await pusinganPendidik(req, params.roundId);
  if (cek.response) return cek.response;
  const round = cek.round!;

  const supa = getRouteSupabase(req);
  const [resRes, rateRes, teamRes] = await Promise.all([
    supa
      .from('qm_peer_results')
      .select(
        'user_id, team_id, t_total, r_count, valid, p, pbar, f, f_mod, flag, needs_review, team_at_risk',
      )
      .eq('round_id', params.roundId),
    supa
      .from('qm_peer_ratings')
      .select('rater_id, ratee_id, k1, k2, k3, k4, k5, justification')
      .eq('round_id', params.roundId),
    supa
      .from('qm_teams')
      .select('id, name')
      .eq('class_id', round.class_id)
      .is('hunt_id', null),
  ]);
  if (resRes.error) return balasRalatPeer(resRes.error);
  if (rateRes.error) return balasRalatPeer(rateRes.error);
  if (teamRes.error) return balasRalatPeer(teamRes.error);

  const teams = teamRes.data ?? [];
  const teamName = new Map(teams.map((t: any) => [t.id, t.name]));

  // Kumpul semua user_id yang dirujuk untuk satu pertanyaan nama.
  const results = resRes.data ?? [];
  const ratings = rateRes.data ?? [];
  const teamIds = teams.map((t: any) => t.id);
  const uidSet = new Set<string>([
    ...results.map((r: any) => r.user_id),
    ...ratings.map((r: any) => r.ratee_id),
  ]);

  let members: any[] = [];
  let profiles: any[] = [];
  if (teamIds.length > 0) {
    const m = await supa.from('qm_team_members').select('team_id, user_id').in('team_id', teamIds);
    if (!m.error) members = m.data ?? [];
    for (const mm of members) uidSet.add(mm.user_id);
  }
  const uidList = Array.from(uidSet);
  if (uidList.length > 0) {
    const p = await supa.from('qm_profiles').select('id, display_name').in('id', uidList);
    if (!p.error) profiles = p.data ?? [];
  }
  const nameOf = new Map(profiles.map((p: any) => [p.id, p.display_name || '']));

  // Senarai ahli yang belum menghantar: ahli kumpulan tanpa rekod penilaian
  // dalam pusingan ini (ketidakhadiran borang dilaporkan, bukan dihukum).
  // rater_id diguna di sini tetapi TIDAK PERNAH masuk ke dalam balasan.
  const penghantar = new Set(ratings.map((r: any) => r.rater_id));
  const belumHantar = members
    .filter((m: any) => !penghantar.has(m.user_id))
    .map((m: any) => ({
      user_id: m.user_id,
      name: nameOf.get(m.user_id) || '',
      team_id: m.team_id,
      team_name: teamName.get(m.team_id) || '',
    }));

  return NextResponse.json({
    round: {
      id: round.id,
      name: round.name,
      kind: round.kind,
      week: round.week,
      opens_at: round.opens_at,
      closes_at: round.closes_at,
      computed_at: round.computed_at,
    },
    results: results.map((r: any) => ({
      user_id: r.user_id,
      name: nameOf.get(r.user_id) || '',
      team_id: r.team_id,
      team_name: teamName.get(r.team_id) || '',
      t_total: r.t_total,
      r_count: r.r_count,
      valid: r.valid,
      p: r.p,
      pbar: r.pbar,
      f: r.f,
      f_mod: r.f_mod,
      flag: r.flag,
      needs_review: r.needs_review,
      team_at_risk: r.team_at_risk,
    })),
    // Justifikasi mengikut pelajar yang dinilai, TANPA nama penilai.
    justifications: ratings.map((r: any) => ({
      ratee_id: r.ratee_id,
      ratee_name: nameOf.get(r.ratee_id) || '',
      k1: r.k1,
      k2: r.k2,
      k3: r.k3,
      k4: r.k4,
      k5: r.k5,
      justification: r.justification,
    })),
    not_submitted: belumHantar,
  });
}