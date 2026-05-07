"use client";
import { useEffect, useState } from "react";
import { Home, Compass, Trophy, User as UserIcon, Users, ChevronDown, ChevronRight } from "lucide-react";
import Shell from "@/components/Shell";
import { useSession } from "@/lib/session";
import { listEnrolledClasses, listClassTeamScores, listTeamMembers, type Klass } from "@/lib/data";

const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/teams', label: 'Teams', icon: <Users className="w-5 h-5" /> },
  { href: '/participant/leaderboard', label: 'Ranking', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];

export default function Page() {
  const { session, loading: authLoading } = useSession('participant');
  const [classes, setClasses] = useState<Klass[]>([]);
  const [activeClassId, setActiveClassId] = useState('');
  const [rankings, setRankings] = useState<any[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        const cs = await listEnrolledClasses();
        setClasses(cs);
        if (cs.length > 0) setActiveClassId(cs[0].id);
      } catch {} finally { setLoading(false); }
    })();
  }, [authLoading]);

  useEffect(() => {
    if (!activeClassId) { setRankings([]); return; }
    setLoading(true);
    listClassTeamScores(activeClassId).then(scores => {
      const sorted = (scores as any[]).sort((a, b) => (Number(b.total_score)||0) - (Number(a.total_score)||0));
      setRankings(sorted);
    }).catch(() => setRankings([])).finally(() => setLoading(false));
  }, [activeClassId]);

  // BUG-B fix: fetch user's team for current class on load
  useEffect(() => {
    if (!activeClassId || !session?.id) { setMyTeamId(null); return; }
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data } = await supabase
          .from('qm_team_members')
          .select('team_id, qm_teams!inner(class_id)')
          .eq('user_id', session.id)
          .eq('qm_teams.class_id', activeClassId)
          .maybeSingle();
        setMyTeamId((data as any)?.team_id ?? null);
      } catch { setMyTeamId(null); }
    })();
  }, [activeClassId, session?.id]);

  const toggleTeam = async (teamId: string) => {
    if (expandedTeam === teamId) { setExpandedTeam(null); return; }
    setExpandedTeam(teamId);
    if (!teamMembers[teamId]) {
      try {
        const members = await listTeamMembers(teamId);
        if (members.some((m:any)=>m.user_id===session?.id)) setMyTeamId(teamId);
        setTeamMembers(prev => ({ ...prev, [teamId]: members }));
      } catch (e) { console.error(e); setTeamMembers(prev => ({ ...prev, [teamId]: [] })); }
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;

  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3 flex items-center gap-2"><Trophy className="w-5 h-5"/>Leaderboard</h2>

      {classes.length > 1 && <select className="border rounded-lg px-3 py-2 text-sm bg-white mb-4" value={activeClassId} onChange={e=>setActiveClassId(e.target.value)}>
        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>}

      {loading ? <p className="text-gray-400 text-sm text-center py-8">Loading rankings...</p> :
       classes.length === 0 ? <p className="text-sm text-gray-500">Join a class to see rankings.</p> :
       rankings.length === 0 ? <p className="text-sm text-gray-400">No team scores yet.</p> : (
        <div className="space-y-2">
          {rankings.map((r: any, i: number) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
            return (
              <div key={r.team_id}>
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer ${i < 3 ? 'bg-gradient-to-r from-purple-50 to-white border-purple-200' : 'bg-white border-gray-100'} ${myTeamId===r.team_id ? 'ring-2 ring-purple-400' : ''}`}
                  onClick={() => toggleTeam(r.team_id)}
                >
                  {expandedTeam === r.team_id ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0"/> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0"/>}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i < 3 ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {medal || (i + 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate flex items-center gap-2">{r.team_name || ('Team ' + String(r.team_id).slice(0,8))}{myTeamId===r.team_id && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Your team</span>}</div>
                  {r.adjustment_score > 0 && <div className="text-xs text-amber-600">+{Number(r.adjustment_score)} bonus</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-purple-700">{Number(r.total_score) || 0}</div>
                  <div className="text-xs text-gray-400">pts</div>
                </div>
              </div>
                {expandedTeam === r.team_id && (
                  <div className="ml-14 mt-1 mb-1 pl-3 border-l-2 border-purple-200 space-y-1">
                    {!teamMembers[r.team_id] ? <p className="text-xs text-gray-400 py-1">Loading members...</p> :
                     teamMembers[r.team_id].length === 0 ? <p className="text-xs text-gray-400 py-1">No members</p> :
                     teamMembers[r.team_id].map((m: any) => (
                      <div key={m.user_id} className="text-xs text-gray-600 flex items-center gap-2 py-0.5">
                        <UserIcon className="w-3 h-3 text-purple-400"/>
                        <span>{m.profile?.display_name || m.profile?.email || m.user_id.slice(0,8)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
