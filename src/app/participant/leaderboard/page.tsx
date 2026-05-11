"use client";
import Shell from "@/components/Shell";
import Link from 'next/link';
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Users, RefreshCw, Trophy, User as UserIcon, ChevronDown, ChevronRight, Activity, ClipboardList, Crown, Medal, Home, Compass, BookOpen } from "lucide-react";
import { listMyHunts, listMyHuntsByClass, listTeamScores, listClassTeamScores, addScoreAdjustment, listScoreAdjustments, deleteScoreAdjustment, listEnrolledClasses, listTeamMembers, type Hunt, type TeamScore, type ScoreAdjustment, type Klass } from "@/lib/data";

const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5"/> },
  { href: '/participant/learning', label: 'Learning', icon: <BookOpen className="w-5 h-5"/> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5"/> },
  { href: '/participant/teams', label: 'Teams', icon: <Users className="w-5 h-5"/> },
  { href: '/participant/leaderboard', label: 'Ranking', icon: <Trophy className="w-5 h-5"/> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5"/> },
];

type AggScore = { team_id: string; team_name: string; total_score: number; quest_count: number };

function LeaderboardInner() {
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
      const cs = await listEnrolledClasses();
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


  const selectedClass = classes.find(c => c.id === classId);
  const leaderboard = activeId ? scores.sort((a, b) => b.total_score - a.total_score) : aggScores;

  return (
    <Shell tabs={tabs}>
      {classId && (
        <Link href={`/participant/classes/${classId}`} className="inline-flex items-center gap-1 mb-4 text-sm text-purple-700 hover:text-purple-900 hover:underline">← Back to class dashboard</Link>
      )}
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-50 via-white to-purple-50 border border-purple-100 p-5 sm:p-6 mb-5">
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-yellow-100 via-yellow-50 to-purple-100 flex items-center justify-center text-4xl sm:text-5xl shrink-0 shadow-inner">🏆</div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-purple-700 to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
                Live Rankings
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-600"><Activity className="w-3.5 h-3.5"/></span>
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">See how each group is performing in real time.</p>
            </div>
          </div>
          <button onClick={loadScores} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-purple-200 text-sm font-semibold text-purple-700 hover:bg-purple-50 shadow-sm shrink-0"><RefreshCw className="w-4 h-4"/>Refresh</button>
        </div>
      </div>

      {/* Class & Activity selectors */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Class</label>
            {classes.length === 0 ? <p className="text-sm text-gray-500">No classes yet.</p> : (
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-purple-100 text-purple-600 inline-flex items-center justify-center pointer-events-none"><Users className="w-4 h-4"/></span>
                <select className="w-full pl-12 pr-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-300" value={classId} onChange={e => setClassId(e.target.value)}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Activity</label>
            {classId && hunts.length > 0 ? (
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-purple-100 text-purple-600 inline-flex items-center justify-center pointer-events-none"><ClipboardList className="w-4 h-4"/></span>
                <select className="w-full pl-12 pr-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-300" value={activeId} onChange={e => setActiveId(e.target.value)}>
                  <option value="">All Activities (Class Leaderboard)</option>
                  {hunts.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic py-2.5">Select a class with activities</p>
            )}
          </div>
        </div>
      </div>

      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      {/* Leaderboard */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-5 mb-3">
        <Crown className="absolute -top-2 -right-2 w-16 h-16 text-purple-100 opacity-70 pointer-events-none"/>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 text-white flex items-center justify-center shrink-0 shadow-md"><Trophy className="w-5 h-5"/></div>
          <div className="min-w-0">
            <div className="font-bold text-base sm:text-lg">{activeId ? `Activity Leaderboard` : `Class Leaderboard`}</div>
            <div className="text-xs text-gray-500">Rankings update automatically as groups complete quests.</div>
          </div>
        </div>
        {leaderboard.length === 0 ? <p className="text-xs text-gray-500">No teams yet.</p> : (
          <div className="space-y-2">
          {leaderboard.map((s, i) => {
            const isExpanded = expandedTeam === s.team_id;
            const tileBg = i === 0 ? 'bg-gradient-to-r from-yellow-50 via-amber-50 to-yellow-50 border-yellow-200'
                         : i === 1 ? 'bg-gradient-to-r from-slate-50 via-gray-50 to-slate-50 border-gray-200'
                         : i === 2 ? 'bg-gradient-to-r from-orange-50 via-rose-50 to-orange-50 border-orange-200'
                         : 'bg-white border-gray-100 hover:bg-gray-50';
            const medalBg = i === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-yellow-200'
                          : i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-slate-200'
                          : i === 2 ? 'bg-gradient-to-br from-orange-400 to-amber-700 text-white shadow-orange-200'
                          : 'bg-gray-200 text-gray-600';
            const ptsBg = i === 0 ? 'bg-yellow-100 text-amber-700'
                        : i === 1 ? 'bg-slate-100 text-slate-700'
                        : i === 2 ? 'bg-orange-100 text-orange-700'
                        : 'bg-purple-50 text-purple-700';
            const sideMark = i === 0 ? '★' : i === 1 ? '★' : i === 2 ? '★' : '';
            const sideColor = i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-300' : '';
            return (
              <div key={s.team_id}>
                <div
                  className={`relative flex items-center gap-3 p-3 sm:p-4 rounded-2xl border transition cursor-pointer ${tileBg}`}
                  onClick={() => toggleTeam(s.team_id)}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0"/> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0"/>}
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-lg font-extrabold shadow ${medalBg}`}>
                    {i < 3 ? (i + 1) : (i + 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm sm:text-base truncate">{s.team_name}</div>
                    {'quest_count' in s && <div className="text-xs text-gray-500">{(s as AggScore).quest_count} activity(s)</div>}
                  </div>
                  <div className={`shrink-0 flex items-center justify-center min-w-[64px] px-3 py-1.5 rounded-xl ${ptsBg}`}>
                    <div className="text-center">
                      <div className="font-extrabold text-lg leading-none">{s.total_score}</div>
                      <div className="text-[10px] uppercase tracking-wide opacity-80 leading-none mt-0.5">pts</div>
                    </div>
                  </div>
                  {sideMark && <span className={`shrink-0 text-lg ${sideColor}`}>{sideMark}</span>}
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


export default function ParticipantLeaderboard() { return <Suspense fallback={<p>Loading...</p>}><LeaderboardInner /></Suspense>; }
