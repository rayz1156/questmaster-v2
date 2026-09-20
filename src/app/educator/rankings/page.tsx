"use client";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from '@/lib/eduTabs';
import Link from 'next/link';
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ListChecks, Users, BarChart3, GraduationCap, Plus, Minus, Trash2, RefreshCw, Trophy, User as UserIcon, ChevronDown, ChevronRight, Activity, ClipboardList, Crown, Medal } from "lucide-react";
import { listMyHunts, listMyHuntsByClass, listTeamScores, listClassTeamScores, addScoreAdjustment, listScoreAdjustments, deleteScoreAdjustment, listMyClasses, listTeamMembers, type Hunt, type TeamScore, type ScoreAdjustment, type Klass } from "@/lib/data";

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
  // Markah sama berkongsi pangkat yang sama, dan pangkat seterusnya melompat.
  const withRank = (rows: { team_id: string; team_name: string; total_score: number }[]) => {
    let lastScore: number | null = null;
    let lastRank = 0;
    return rows.map((r, i) => {
      const rank = lastScore !== null && r.total_score === lastScore ? lastRank : i + 1;
      lastScore = r.total_score; lastRank = rank;
      return { ...r, rank };
    });
  };
  const leaderboard = activeId ? scores.sort((a, b) => b.total_score - a.total_score) : aggScores;

  const ranked = withRank(leaderboard as { team_id: string; team_name: string; total_score: number }[]);
  const top = ranked.length > 0 ? Math.max(1, ...ranked.map(r => r.total_score)) : 1;
  const semuaSifar = ranked.length > 0 && ranked.every(r => r.total_score === 0);

  const board = (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="section-title">
            {semuaSifar ? "Class rankings" : "A little competition. A lot of progress."}
          </h2>
          <p className="text-sm text-ink-muted mt-0.5">
            Teams earn points through class activities. Rankings update in real time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {classId && hunts.length > 0 && (
            <select className="input w-auto" value={activeId} onChange={e => setActiveId(e.target.value)}>
              <option value="">All activities</option>
              {hunts.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
            </select>
          )}
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4BA972]" /> Live
          </span>
        </div>
      </div>

      {err && <div className="text-sm text-red-600 mb-3">{err}</div>}

      {semuaSifar && (
        <div className="flex items-start gap-3 rounded-2xl bg-[#F5F3FE] px-4 py-3.5 mb-5">
          <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-brand-purple" />
          </span>
          <div>
            <div className="font-semibold text-ink text-sm">A fresh start.</div>
            <div className="text-sm text-ink-muted">Rankings begin when teams earn points.</div>
          </div>
        </div>
      )}

      {ranked.length === 0 ? (
        <div className="surface py-16 text-center">
          <div className="section-title mb-1">No teams yet.</div>
          <p className="text-sm text-ink-muted">Create teams in this class and rankings will appear here.</p>
        </div>
      ) : (
        <div className="surface">
          <div className="grid grid-cols-[52px,1fr,90px] sm:grid-cols-[52px,1fr,110px,1fr,80px] gap-4 px-5 py-3 bg-[#FAFAFB]">
            <div className="t-head">Rank</div>
            <div className="t-head">Team</div>
            <div className="t-head hidden sm:block text-right">Activities</div>
            <div className="t-head hidden sm:block">Points</div>
            <div className="t-head text-right sm:hidden">Points</div>
            <div className="t-head hidden sm:block text-right">&nbsp;</div>
          </div>
          {ranked.map((r, i) => (
            <div key={r.team_id}>
              <div
                onClick={() => toggleTeam(r.team_id)}
                className={`t-row grid grid-cols-[52px,1fr,90px] sm:grid-cols-[52px,1fr,110px,1fr,80px] gap-4 px-5 py-3.5 items-center cursor-pointer ${i === 0 && !semuaSifar ? "bg-[#F8F6FE]" : ""}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-semibold text-ink tabular-nums">
                    {semuaSifar ? "–" : r.rank}
                  </span>
                  {i === 0 && !semuaSifar && <span className="w-1.5 h-1.5 rounded-full bg-[#E3B341]" />}
                </div>
                <div className="text-[15px] text-ink truncate">{r.team_name}</div>
                <div className="hidden sm:block text-sm text-ink-muted tabular-nums text-right">
                  {"quest_count" in r ? (r as unknown as AggScore).quest_count : hunts.length}
                </div>
                <div className="hidden sm:flex items-center">
                  <span className="h-2 rounded-full bg-[#EFEFF2] w-full overflow-hidden">
                    <span
                      className="block h-2 rounded-full bg-[#B9ABF1]"
                      style={{ width: `${Math.round((r.total_score / top) * 100)}%` }}
                    />
                  </span>
                </div>
                <div className="text-[15px] text-ink tabular-nums text-right">{r.total_score}</div>
              </div>
              {expandedTeam === r.team_id && (
                <div className="px-5 pb-3 -mt-1">
                  <div className="ml-[52px] pl-3 border-l-2 border-[#EAE6FC] space-y-1">
                    {!teamMembers[r.team_id] ? <p className="text-xs text-ink-faint py-1">Loading members…</p> :
                     teamMembers[r.team_id].length === 0 ? <p className="text-xs text-ink-faint py-1">No members</p> :
                     teamMembers[r.team_id].map((m: any) => (
                      <div key={m.user_id} className="text-xs text-ink-muted flex items-center gap-2 py-0.5">
                        <UserIcon className="w-3 h-3 text-ink-faint"/>
                        <span>{m.profile?.display_name || m.profile?.email || m.user_id.slice(0,8)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="px-5 py-3 border-t border-hairline flex items-center justify-between">
            <span className="text-xs text-ink-faint">Updates automatically · Equal scores share a rank</span>
            <button onClick={loadScores} className="btn-quiet text-brand-purple"><RefreshCw className="w-3.5 h-3.5"/> Refresh</button>
          </div>
        </div>
      )}
    </>
  );

  if (classId) {
    return (
      <Shell tabs={EDU_TABS}>
        <ClassShell classId={classId} current="rankings">{board}</ClassShell>
      </Shell>
    );
  }

  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="page-title">Rankings</h1>
          <p className="page-subtitle">Choose a class to see how its teams are doing.</p>
        </div>
        {classes.length > 0 && (
          <select className="input w-auto" value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">Select a class</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div className="surface py-20 text-center">
        <div className="w-14 h-14 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-6 h-6 text-brand-purple" />
        </div>
        <div className="section-title mb-1">Pick a class.</div>
        <p className="text-sm text-ink-muted">Rankings belong to a class, so choose one above.</p>
      </div>
    </Shell>
  );
}

export default function Rankings() { return <Suspense fallback={<p>Loading...</p>}><RankingsInner /></Suspense>; }
