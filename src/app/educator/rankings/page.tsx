"use client";
import Shell from "@/components/Shell";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ListChecks, Users, BarChart3, GraduationCap, Plus, Minus, Trash2, RefreshCw, Trophy, User as UserIcon, ChevronDown, ChevronRight } from "lucide-react";
import { listMyHunts, listMyHuntsByClass, listTeamScores, listClassTeamScores, addScoreAdjustment, listScoreAdjustments, deleteScoreAdjustment, listMyClasses, listTeamMembers, type Hunt, type TeamScore, type ScoreAdjustment, type Klass } from "@/lib/data";

const tabs = [
  { href: "/educator/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
];

type AggScore = { team_id: string; team_name: string; total_score: number; quest_count: number };

function RankingsInner() {
  const [classes, setClasses] = useState<Klass[]>([]);
  const sp = useSearchParams();
  const [classId, setClassId] = useState(sp.get('classId') || "");
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [activeId, setActiveId] = useState(""); // "" means all quests, or a specific hunt id
  const [scores, setScores] = useState<TeamScore[]>([]);
  const [aggScores, setAggScores] = useState<AggScore[]>([]);
  const [adj, setAdj] = useState<ScoreAdjustment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [delta, setDelta] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<Record<string, any[]>>({});

  const toggleTeam = async (teamId: string) => {
    if (expandedTeam === teamId) { setExpandedTeam(null); return; }
    setExpandedTeam(teamId);
    if (!teamMembers[teamId]) {
      try {
        const members = await listTeamMembers(teamId);
        setTeamMembers(prev => ({ ...prev, [teamId]: members }));
      } catch (e) { console.error(e); }
    }
  };

  // Load classes on mount
  useEffect(() => {
    (async () => {
      const cs = await listMyClasses();
      setClasses(cs);
      if (cs[0]) { setClassId(prev => prev || cs[0].id); }
    })();
  }, []);

  // Load hunts when class changes
  useEffect(() => {
    if (!classId) { setHunts([]); setActiveId(""); return; }
    (async () => {
      const hs = await listMyHuntsByClass(classId);
      setHunts(hs);
      setActiveId(""); // default to "All Quests"
    })();
  }, [classId]);

  // Load scores when activeId or hunts change
  useEffect(() => {
    if (!classId) return;
    loadScores();
    const t = setInterval(loadScores, 8000);
    return () => clearInterval(t);
  }, [activeId, hunts, classId]);

  async function loadScores() {
    try {
      setErr(null);
      if (activeId) {
        // Individual quest
        const s = await listTeamScores(activeId);
        setScores(s);
        setAggScores([]);
        const a = await listScoreAdjustments(activeId);
        setAdj(a);
      } else {
      // Try class-level team scores first (handles class-scoped teams)
      try {
        const cts = await listClassTeamScores(classId);
        if (cts && cts.length > 0) {
          const aggCls = cts.map(r => ({ team_id: r.team_id, team_name: r.team_name, total_score: Number(r.total_score)||0, quest_count: hunts.length }))
            .sort((a,b)=>b.total_score-a.total_score);
          setScores([]);
          setAggScores(aggCls);
          setAdj([]);
          return;
        }
      } catch (e) { /* fall through to legacy per-hunt aggregation */ }
        // All quests in class - aggregate
        const allScores: TeamScore[] = [];
        const allAdj: ScoreAdjustment[] = [];
        for (const h of hunts) {
          try {
            const s = await listTeamScores(h.id);
            allScores.push(...s);
            const a = await listScoreAdjustments(h.id);
            allAdj.push(...a);
          } catch(e) {}
        }
        // Aggregate by team
        const map = new Map<string, AggScore>();
        for (const s of allScores) {
          const existing = map.get(s.team_id);
          if (existing) {
            existing.total_score += s.total_score;
            existing.quest_count++;
          } else {
            map.set(s.team_id, { team_id: s.team_id, team_name: s.team_name, total_score: s.total_score, quest_count: 1 });
          }
        }
        const agg = Array.from(map.values()).sort((a, b) => b.total_score - a.total_score);
        setAggScores(agg);
        setScores([]);
        setAdj(allAdj.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      }
    } catch (e: any) { setErr(e.message); }
  }

  const adjust = async (teamId: string, sign: 1 | -1) => {
    if (!activeId) { setErr("Select a specific quest to adjust scores"); return; }
    const d = delta[teamId];
    if (!d || d <= 0) { setErr("Enter a positive number first"); return; }
    setBusy(true); setErr(null);
    try {
      await addScoreAdjustment(activeId, teamId, sign * d, reason[teamId] || null as any);
      setDelta(s => ({...s, [teamId]: 0}));
      setReason(s => ({...s, [teamId]: ""}));
      await loadScores();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const selectedClass = classes.find(c => c.id === classId);
  const leaderboard = activeId ? scores.sort((a, b) => b.total_score - a.total_score) : aggScores;

  return (
    <Shell tabs={tabs}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-lg">Live Rankings</h2>
        <button onClick={loadScores} className="text-xs text-gray-500 flex items-center gap-1"><RefreshCw className="w-3 h-3"/>refresh</button>
      </div>

      {/* Class selector */}
      <div className="mb-3">
        <label className="text-xs text-gray-500 mb-1 block">Class</label>
        {classes.length === 0 ? <p className="text-sm text-gray-500">No classes yet.</p> : (
          <select className="input w-full" value={classId} onChange={e => setClassId(e.target.value)}>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Quest selector */}
      {classId && hunts.length > 0 && (
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">Quest</label>
          <select className="input w-full" value={activeId} onChange={e => setActiveId(e.target.value)}>
            <option value="">All Quests (Class Leaderboard)</option>
            {hunts.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
          </select>
        </div>
      )}

      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      {/* Leaderboard */}
      <div className="card mb-3">
        <div className="font-semibold text-sm mb-2 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500"/>
          {activeId ? `Quest Leaderboard` : `Class Leaderboard`}
        </div>
        {leaderboard.length === 0 ? <p className="text-xs text-gray-500">No teams yet.</p> : (
          <div className="space-y-2">
          {leaderboard.map((s, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
            const isExpanded = expandedTeam === s.team_id;
            return (
              <div key={s.team_id}>
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer ${i < 3 ? 'bg-gradient-to-r from-purple-50 to-white border-purple-200' : 'bg-white border-gray-100'}`}
                  onClick={() => toggleTeam(s.team_id)}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0"/> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0"/>}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i < 3 ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {medal || (i + 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{s.team_name}</div>
                    {'quest_count' in s && <div className="text-xs text-gray-400">{(s as AggScore).quest_count} quest(s)</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-purple-700">{s.total_score}</div>
                    <div className="text-xs text-gray-400">pts</div>
                  </div>
                </div>
                {isExpanded && (
                  <div className="ml-14 mt-1 mb-1 pl-3 border-l-2 border-purple-200 space-y-1">
                    {!teamMembers[s.team_id] ? <p className="text-xs text-gray-400 py-1">Loading members...</p> :
                     teamMembers[s.team_id].length === 0 ? <p className="text-xs text-gray-400 py-1">No members</p> :
                     teamMembers[s.team_id].map((m: any) => (
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
      </div>
      </Shell>
  );
}


export default function Rankings() { return <Suspense fallback={<p>Loading...</p>}><RankingsInner /></Suspense>; }
