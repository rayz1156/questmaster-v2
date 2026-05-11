import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

export const dynamic = 'force-dynamic';

// Tier 2: Quest/Activity Performance Analytics for an educator's class
// Returns per-quest stats: approved submissions, total submissions, points earned, member count, completion %

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const classId = url.searchParams.get('classId');
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 });

  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RLS will enforce the educator can only read their own classes; if zero rows return, surface as forbidden
  const { data: hunts, error: huntsErr } = await supa
    .from('qm_hunts')
    .select('id,title,points,status,start_at,end_at,created_at')
    .eq('class_id', classId)
    .order('created_at', { ascending: true });
  if (huntsErr) return NextResponse.json({ error: huntsErr.message }, { status: 500 });

  const { count: memberCount } = await supa
    .from('qm_class_members')
    .select('*', { count: 'exact', head: true })
    .eq('class_id', classId);

  const huntIds = (hunts ?? []).map(h => h.id);
  if (huntIds.length === 0) {
    return NextResponse.json({ memberCount: memberCount ?? 0, quests: [] });
  }

  const { data: challenges } = await supa
    .from('qm_challenges')
    .select('id,hunt_id,points')
    .in('hunt_id', huntIds);

  const challengeIds = (challenges ?? []).map(c => c.id);
  const huntByChallenge = new Map<string, string>();
  const challengePoints = new Map<string, number>();
  (challenges ?? []).forEach(c => {
    huntByChallenge.set(c.id, c.hunt_id);
    challengePoints.set(c.id, c.points ?? 0);
  });

  let submissions: { challenge_id: string; user_id: string; status: string; created_at: string }[] = [];
  if (challengeIds.length > 0) {
    const { data: subs } = await supa
      .from('qm_submissions')
      .select('challenge_id,user_id,status,created_at')
      .in('challenge_id', challengeIds);
    submissions = subs ?? [];
  }

  // Aggregate per hunt
  type Agg = {
    totalSubs: number;
    approvedSubs: number;
    pendingSubs: number;
    rejectedSubs: number;
    pointsEarned: number;
    uniqueParticipants: Set<string>;
  };
  const agg = new Map<string, Agg>();
  for (const h of hunts ?? []) agg.set(h.id, { totalSubs: 0, approvedSubs: 0, pendingSubs: 0, rejectedSubs: 0, pointsEarned: 0, uniqueParticipants: new Set() });

  for (const s of submissions) {
    const huntId = huntByChallenge.get(s.challenge_id);
    if (!huntId) continue;
    const a = agg.get(huntId);
    if (!a) continue;
    a.totalSubs += 1;
    if (s.status === 'approved') {
      a.approvedSubs += 1;
      a.pointsEarned += challengePoints.get(s.challenge_id) ?? 0;
      if (s.user_id) a.uniqueParticipants.add(s.user_id);
    } else if (s.status === 'pending') a.pendingSubs += 1;
    else if (s.status === 'rejected') a.rejectedSubs += 1;
  }

  const members = memberCount ?? 0;
  const quests = (hunts ?? []).map(h => {
    const a = agg.get(h.id)!;
    const participants = a.uniqueParticipants.size;
    const completionPct = members > 0 ? Math.round((participants / members) * 1000) / 10 : 0;
    return {
      id: h.id,
      title: h.title,
      status: h.status,
      maxPoints: h.points ?? 0,
      pointsEarned: a.pointsEarned,
      totalSubmissions: a.totalSubs,
      approvedSubmissions: a.approvedSubs,
      pendingSubmissions: a.pendingSubs,
      rejectedSubmissions: a.rejectedSubs,
      participants,
      completionPct,
    };
  });

  return NextResponse.json({ memberCount: members, quests });
}
