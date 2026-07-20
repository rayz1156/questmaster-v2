"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListAllClasses, listClassTeamScores, listClassIndividualScores, listTeamMembers, type ClassTeamScore, type ClassIndividualScore } from "@/lib/data";
import { ChevronDown, ChevronRight, UserIcon } from "lucide-react";

export default function Page() {
  const [classes, setClasses] = useState<any[]>([]);
  const [activeClassId, setActiveClassId] = useState("");
  const [rankings, setRankings] = useState<ClassTeamScore[]>([]);
  const [indivRankings, setIndivRankings] = useState<ClassIndividualScore[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const cs = await adminListAllClasses();
        setClasses(cs);
        if (cs.length > 0) setActiveClassId(cs[0].id);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const [viewMode, setViewMode] = useState<'team' | 'individual'>('team');
  const isIndividual = viewMode === 'individual';

  useEffect(() => {
    if (!activeClassId) { setRankings([]); setIndivRankings([]); return; }
    setLoading(true);
    if (viewMode === 'individual') {
      listClassIndividualScores(activeClassId).then(scores => {
        setIndivRankings(scores);
        setRankings([]);
      }).catch(() => setIndivRankings([])).finally(() => setLoading(false));
    } else {
      listClassTeamScores(activeClassId).then(scores => {
        const sorted = (scores as any[]).sort((a, b) => (Number(b.total_score)||0) - (Number(a.total_score)||0));
        setRankings(sorted);
        setIndivRankings([]);
      }).catch(() => setRankings([])).finally(() => setLoading(false));
    }
  }, [activeClassId, viewMode]);

  const toggleTeam = async (teamId: string) => {
    if (expandedTeam === teamId) { setExpandedTeam(null); return; }
    setExpandedTeam(teamId);
    if (!teamMembers[teamId]) {
      try {
        const members = await listTeamMembers(teamId);
        setTeamMembers(prev => ({ ...prev, [teamId]: members }));
      } catch { setTeamMembers(prev => ({ ...prev, [teamId]: [] })); }
    }
  };

  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">Leaderboard</h2>
      {classes.length > 1 && (
        <select className="input mb-3" value={activeClassId} onChange={e => setActiveClassId(e.target.value)}>
          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <div className="flex items-center gap-1 p-1 mb-3 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setViewMode('team')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${viewMode === 'team' ? 'bg-white shadow text-violet-700' : 'text-gray-500 hover:text-gray-700'}`}
        >Teams</button>
        <button
          onClick={() => setViewMode('individual')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${viewMode === 'individual' ? 'bg-white shadow text-violet-700' : 'text-gray-500 hover:text-gray-700'}`}
        >Individuals</button>
      </div>
      {isIndividual && <p className="text-xs text-gray-500 mb-3 -mt-1">Students ranked by their own approved work.</p>}
      {loading ? <p className="text-gray-400 text-sm text-center py-8">Loading rankings...</p> :
       isIndividual ? (
        indivRankings.length === 0 ? <p className="text-sm text-gray-400">No students ranked yet.</p> : (
        <div className="space-y-2">
          {indivRankings.map((r, i) => {
            const medal = i === 0 ? '\ud83e\uddc0' : i === 1 ? '\ud83e\udd48' : i === 2 ? '\ud83e\udd49' : null;
            return (
              <div key={r.user_id} className={`flex items-center gap-3 p-3 rounded-xl border ${i < 3 ? 'bg-gradient-to-r from-purple-50 to-white border-purple-200' : 'bg-white border-gray-100'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i < 3 ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{medal || (i + 1)}</div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-purple-400 shrink-0"/>
                  <div className="font-semibold text-sm truncate">{r.display_name || 'Student'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-purple-700">{Number(r.total_score) || 0}</div>
                  <div className="text-xs text-gray-400">pts</div>
                </div>
              </div>
            );
          })}
        </div>
        )
       ) :
       rankings.length === 0 ? <p className="text-sm text-gray-400">No team scores yet.</p> : (
        <div className="space-y-2">
          {rankings.map((r: any, i: number) => {
            const medal = i === 0 ? '\ud83e\uddc0' : i === 1 ? '\ud83e\udd48' : i === 2 ? '\ud83e\udd49' : null;
            return (
              <div key={r.team_id}>
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer ${i < 3 ? 'bg-gradient-to-r from-purple-50 to-white border-purple-200' : 'bg-white border-gray-100'}`}
                  onClick={() => toggleTeam(r.team_id)}
                >
                  {expandedTeam === r.team_id ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0"/> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0"/>}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i < 3 ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {medal || (i + 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{r.team_name || ('Team ' + String(r.team_id).slice(0,8))}</div>
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
