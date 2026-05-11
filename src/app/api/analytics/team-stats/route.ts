import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

export const dynamic = 'force-dynamic';

type TeamRow = { id: string; name: string; score: number; max_members: number; hunt_id: string };
type HuntRow = { id: string; title: string; class_id: string };
type MemberRow = { team_id: string; user_id: string };
type ProfileRow = { id: string; display_name: string | null; username: string | null };
type SubmissionRow = { team_id: string | null; user_id: string; status: string; challenge_id: string };
type ChallengeRow = { id: string; hunt_id: string };
type CompletionRow = { team_id: string; hunt_id: string; awarded_points: number };

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const classId = url.searchParams.get('classId');
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 });

  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: huntsData, error: huntsErr } = await supa
    .from('qm_hunts')
    .select('id,title,class_id')
    .eq('class_id', classId);
  if (huntsErr) return NextResponse.json({ error: huntsErr.message }, { status: 500 });
  const hunts: HuntRow[] = (huntsData ?? []) as HuntRow[];
  if (hunts.length === 0) return NextResponse.json({ hunts: [] });

  const huntIds = hunts.map(h => h.id);

  const { data: teamsData } = await supa
    .from('qm_teams')
    .select('id,name,score,max_members,hunt_id')
    .in('hunt_id', huntIds);
  const teams: TeamRow[] = (teamsData ?? []) as TeamRow[];

  if (teams.length === 0) {
    return NextResponse.json({ hunts: hunts.map(h => ({ huntId: h.id, huntTitle: h.title, teams: [] })) });
  }

  const teamIds = teams.map(t => t.id);

  const { data: membersData } = await supa
    .from('qm_team_members')
    .select('team_id,user_id')
    .in('team_id', teamIds);
  const members: MemberRow[] = (membersData ?? []) as MemberRow[];
  const userIds = Array.from(new Set(members.map(m => m.user_id)));

  let profiles: ProfileRow[] = [];
  if (userIds.length > 0) {
    const { data: profilesData } = await supa.from('qm_profiles').select('id,display_name,username').in('id', userIds);
    profiles = (profilesData ?? []) as ProfileRow[];
  }
  const profileMap = new Map<string, ProfileRow>(profiles.map(p => [p.id, p]));

  const { data: chData } = await supa
    .from('qm_challenges')
    .select('id,hunt_id')
    .in('hunt_id', huntIds);
  const challenges: ChallengeRow[] = (chData ?? []) as ChallengeRow[];
  const challengeIds = challenges.map(c => c.id);

  let submissions: SubmissionRow[] = [];
  if (challengeIds.length > 0) {
    const { data: subData } = await supa
      .from('qm_submissions')
      .select('team_id,user_id,status,challenge_id')
      .in('challenge_id', challengeIds);
    submissions = (subData ?? []) as SubmissionRow[];
  }

  const { data: comps } = await supa
    .from('qm_team_quest_completions')
    .select('team_id,hunt_id,awarded_points')
    .in('hunt_id', huntIds);
  const completions: CompletionRow[] = (comps ?? []) as CompletionRow[];

  const membersByTeam = new Map<string, MemberRow[]>();
  for (const m of members) {
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
    membersByTeam.get(m.team_id)!.push(m);
  }
  const contribByTeamUser = new Map<string, Map<string, number>>();
  for (const s of submissions) {
    if (!s.team_id || s.status !== 'approved') continue;
    if (!contribByTeamUser.has(s.team_id)) contribByTeamUser.set(s.team_id, new Map());
    const inner = contribByTeamUser.get(s.team_id)!;
    inner.set(s.user_id, (inner.get(s.user_id) ?? 0) + 1);
  }
  const awardedByTeam = new Map<string, number>();
  for (const c of completions) awardedByTeam.set(c.team_id, (awardedByTeam.get(c.team_id) ?? 0) + (c.awarded_points ?? 0));

  function balance(contribs: number[]): number {
    const n = contribs.length;
    if (n === 0) return 0;
    const total = contribs.reduce((s, x) => s + x, 0);
    if (total === 0) return 1;
    const sorted = [...contribs].sort((a, b) => a - b);
    let cum = 0;
    for (let i = 0; i < n; i++) cum += sorted[i] * (i + 1);
    const gini = (2 * cum) / (n * total) - (n + 1) / n;
    return Math.max(0, Math.min(1, 1 - gini));
  }

  const huntsOut = hunts.map(h => {
    const teamRows = teams.filter(t => t.hunt_id === h.id);
    const teamsOut = teamRows.map(t => {
      const ms = membersByTeam.get(t.id) ?? [];
      const contribMap = contribByTeamUser.get(t.id) ?? new Map<string, number>();
      const memberOut = ms.map(m => {
        const p = profileMap.get(m.user_id);
        return {
          userId: m.user_id,
          name: p?.display_name ?? p?.username ?? 'Member',
          approvedSubmissions: contribMap.get(m.user_id) ?? 0,
        };
      }).sort((a, b) => b.approvedSubmissions - a.approvedSubmissions);
      const contribs = memberOut.map(m => m.approvedSubmissions);
      const totalContrib = contribs.reduce((s, x) => s + x, 0);
      const top = memberOut[0]?.approvedSubmissions ?? 0;
      const topShare = totalContrib > 0 ? Math.round((top / totalContrib) * 1000) / 10 : 0;
      return {
        id: t.id,
        name: t.name,
        score: t.score,
        maxMembers: t.max_members,
        memberCount: ms.length,
        awardedPoints: awardedByTeam.get(t.id) ?? 0,
        totalApprovedContributions: totalContrib,
        topContributorShare: topShare,
        balanceScore: Math.round(balance(contribs) * 1000) / 10,
        members: memberOut,
      };
    }).sort((a, b) => b.score - a.score);
    return { huntId: h.id, huntTitle: h.title, teams: teamsOut };
  });

  return NextResponse.json({ hunts: huntsOut });
}
