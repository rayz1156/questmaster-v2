"use client";
import Shell from "@/components/Shell";
import { useEffect, useState } from "react";
import { ListChecks, Users, BarChart3, GraduationCap, Plus, Minus, Trash2, RefreshCw, Trophy , User as UserIcon } from "lucide-react";
import { listMyHunts, listMyHuntsByClass, listTeamScores, addScoreAdjustment, listScoreAdjustments, deleteScoreAdjustment, listMyClasses, type Hunt, type TeamScore, type ScoreAdjustment, type Klass } from "@/lib/data";

const tabs = [
  { href: "/educator/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
];

type AggScore = { team_id: string; team_name: string; total_score: number; quest_count: number };

export default function Rankings() {
  const [classes, setClasses] = useState<Klass[]>([]);
  const [classId, setClassId] = useState("");
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [activeId, setActiveId] = useState(""); // "" means all quests, or a specific hunt id
  const [scores, setScores] = useState<TeamScore[]>([]);
  const [aggScores, setAggScores] = useState<AggScore[]>([]);
  const [adj, setAdj] = useState<ScoreAdjustment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [delta, setDelta] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Load classes on mount
  useEffect(() => {
    (async () => {
      const cs = await listMyClasses();
      setClasses(cs);
      if (cs[0]) { setClassId(cs[0].id); }
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
            {leaderboard.map((s, i) => (
              <div key={s.team_id} className="py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-xs w-6 ${i === 0 ? 'text-yellow-500 font-bold' : i === 1 ? 'text-gray-400 font-bold' : i === 2 ? 'text-orange-400 font-bold' : 'text-gray-500'}`}>{i + 1}.</span>
                  <span className="font-medium flex-1 truncate">{s.team_name}</span>
                  <span className="font-mono font-bold text-brand-purple">{s.total_score}</span>
                </div>
                    {'quest_count' in s && (
                  <div className="text-[10px] text-gray-400 ml-8">{(s as AggScore).quest_count} quest(s)</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </Shell>
  );
}
