"use client";
import ParticipantShell from "@/components/ParticipantShell";
import Link from 'next/link';
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Users, RefreshCw, Trophy, User as UserIcon, ChevronDown, ChevronRight, Activity, ClipboardList, Crown, Medal, Home, Compass, BookOpen } from "lucide-react";
import { LeaderboardPodium, LB_TILE, LB_TILE_REST, LB_MEDAL, LB_MEDAL_REST, LB_PTS, LB_PTS_REST } from "@/components/LiveLeaderboard";
import { listMyHunts, listMyHuntsByClass, listTeamScores, listClassTeamScores, listClassIndividualScores, addScoreAdjustment, listScoreAdjustments, deleteScoreAdjustment, listEnrolledClasses, listTeamMembers, type Hunt, type TeamScore, type ScoreAdjustment, type ClassIndividualScore, type Klass } from "@/lib/data";


type AggScore = { team_id: string; team_name: string; total_score: number; quest_count: number };

function LeaderboardInner() {
  const [classes, setClasses] = useState<Klass[]>([]);
  const sp = useSearchParams();
  const [classId, setClassId] = useState(sp.get('classId') || "");
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [activeId, setActiveId] = useState(""); // "" means all quests, or a specific hunt id
  const [scores, setScores] = useState<TeamScore[]>([]);
  const [aggScores, setAggScores] = useState<AggScore[]>([]);
  const [indivScores, setIndivScores] = useState<ClassIndividualScore[]>([]);
  const [viewMode, setViewMode] = useState<'team' | 'individual'>('team');
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
      // Hanya kelas yang educatornya membenarkan leaderboard.
      const visible = cs.filter(c => c.leaderboard_visible !== false);
      setClasses(visible);
      // URL boleh membawa ?classId= kelas yang disembunyikan; jangan hormatinya.
      setClassId(prev => (visible.some(c => c.id === prev) ? prev : (visible[0]?.id ?? "")));
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
  }, [activeId, hunts, classId, viewMode]);

  async function loadScores() {
    try {
      setErr(null);
      // Individual view: rank students by their own total (view qm_class_individual_scores).
      if (viewMode === 'individual' && !activeId) {
        try {
          const is = await listClassIndividualScores(classId);
          setIndivScores(is);
          setScores([]); setAggScores([]); setAdj([]);
          return;
        } catch (e:any) { setErr(e.message); return; }
      } else {
        setIndivScores([]);
      }
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


  const isIndividual = viewMode === 'individual';
  const leaderboard = activeId ? scores.sort((a, b) => b.total_score - a.total_score) : aggScores;
  // Tangga hanya bermakna bila ada sekurang-kurangnya dua nama. Di bawah itu,
  // senarai biasa lebih jujur daripada podium yang separuh kosong.
  const indivRest = indivScores.length >= 2 ? 3 : 0;
  const teamRest = leaderboard.length >= 2 ? 3 : 0;

  return (
    <ParticipantShell>
      {classId && (
        <Link href={`/participant/classes/${classId}`} className="btn-quiet mb-6">← Back to class dashboard</Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="min-w-0">
          <div className="eyebrow mb-1">Rankings</div>
          <h1 className="page-title">Who is ahead right now.</h1>
          <p className="page-subtitle">Scores update as groups complete activities.</p>
        </div>
        <button onClick={loadScores} className="btn-secondary shrink-0"><RefreshCw className="w-4 h-4"/>Refresh</button>
      </div>

      {/* Class & Activity selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 max-w-3xl">
        <div>
          <div className="text-sm font-medium text-ink mb-1.5">Class</div>
          {classes.length === 0 ? <p className="text-sm text-ink-muted">No leaderboard is available yet.</p> : (
            <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div>
          <div className="text-sm font-medium text-ink mb-1.5">Activity</div>
          {classId && hunts.length > 0 ? (
            <select className="input" value={activeId} onChange={e => setActiveId(e.target.value)}>
              <option value="">All activities</option>
              {hunts.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
            </select>
          ) : (
            <p className="text-sm text-ink-faint py-2.5">Select a class with activities.</p>
          )}
        </div>
      </div>

      {err && <div className="text-sm text-[#C0392B] mb-4">{err}</div>}

      {/* Leaderboard */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-hairline p-5 mb-3">
        <Crown className="absolute -top-2 -right-2 w-16 h-16 text-[#EFEBFB] pointer-events-none"/>
        <div className="mb-4">
          <div className="section-title">{isIndividual && !activeId ? `Individuals` : activeId ? `Activity leaderboard` : `Class leaderboard`}</div>
          <div className="text-sm text-ink-muted mt-0.5">{isIndividual && !activeId ? "Students ranked by their own approved work." : "Rankings update automatically as groups complete activities."}</div>
        </div>
        {!activeId && (
          <div className="inline-flex rounded-xl border border-hairline overflow-hidden mb-4 text-sm">
            <button onClick={() => setViewMode('team')} className={`px-3.5 py-1.5 font-medium transition ${viewMode === 'team' ? 'bg-[#F4F2FD] text-brand-purple' : 'text-ink-muted hover:text-ink'}`}>Teams</button>
            <button onClick={() => setViewMode('individual')} className={`px-3.5 py-1.5 font-medium transition border-l border-hairline ${viewMode === 'individual' ? 'bg-[#F4F2FD] text-brand-purple' : 'text-ink-muted hover:text-ink'}`}>Individuals</button>
          </div>
        )}
        {isIndividual && !activeId ? (
          indivScores.length === 0 ? <p className="text-sm text-ink-muted">No students ranked yet.</p> : (
          <>
          {indivRest > 0 && (
            <LeaderboardPodium
              className="mb-5"
              rows={indivScores.slice(0, 3).map((s, i) => ({ rank: i + 1, name: s.display_name || 'Student', score: s.total_score }))}
            />
          )}
          <div className="space-y-2">
          {indivScores.slice(indivRest).map((s, j) => {
            const i = j + indivRest;
            const tileBg = i < 3 ? LB_TILE[i] : LB_TILE_REST;
            const medalBg = i < 3 ? LB_MEDAL[i] : LB_MEDAL_REST;
            const ptsBg = i < 3 ? LB_PTS[i] : LB_PTS_REST;
            return (
              <div key={s.user_id} className={`relative flex items-center gap-3 p-3 sm:p-4 rounded-2xl border transition ${tileBg}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold tabular-nums shrink-0 ${medalBg}`}>{i + 1}</div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-ink-faint shrink-0"/>
                  <div className="text-[15px] font-medium text-ink truncate">{s.display_name || 'Student'}</div>
                </div>
                <div className={`shrink-0 flex items-center justify-center min-w-[64px] px-3 py-1.5 rounded-xl ${ptsBg}`}>
                  <div className="text-center">
                    <div className="text-lg font-semibold leading-none tabular-nums">{s.total_score}</div>
                    <div className="text-[10px] uppercase tracking-wide opacity-80 leading-none mt-0.5">pts</div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          </>
          )
        ) : leaderboard.length === 0 ? <p className="text-sm text-ink-muted">No teams yet.</p> : (
          <>
          {teamRest > 0 && (
            <LeaderboardPodium
              className="mb-5"
              rows={leaderboard.slice(0, 3).map((s, i) => ({ rank: i + 1, name: s.team_name, score: s.total_score }))}
            />
          )}
          <div className="space-y-2">
          {leaderboard.slice(teamRest).map((s, j) => {
            const i = j + teamRest;
            const isExpanded = expandedTeam === s.team_id;
            const tileBg = i < 3 ? LB_TILE[i] : LB_TILE_REST;
            const medalBg = i < 3 ? LB_MEDAL[i] : LB_MEDAL_REST;
            const ptsBg = i < 3 ? LB_PTS[i] : LB_PTS_REST;
            return (
              <div key={s.team_id}>
                <div
                  className={`relative flex items-center gap-3 p-3 sm:p-4 rounded-2xl border transition cursor-pointer ${tileBg}`}
                  onClick={() => toggleTeam(s.team_id)}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0"/> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0"/>}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold tabular-nums shrink-0 ${medalBg}`}>
                    {i < 3 ? (i + 1) : (i + 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-ink truncate">{s.team_name}</div>
                    {'quest_count' in s && <div className="text-xs text-gray-500">{(s as AggScore).quest_count} activity(s)</div>}
                  </div>
                  <div className={`shrink-0 flex items-center justify-center min-w-[64px] px-3 py-1.5 rounded-xl ${ptsBg}`}>
                    <div className="text-center">
                      <div className="text-lg font-semibold leading-none tabular-nums">{s.total_score}</div>
                      <div className="text-[10px] uppercase tracking-wide opacity-80 leading-none mt-0.5">pts</div>
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div className="ml-14 mt-1 mb-1 pl-3 border-l-2 border-hairline space-y-1">
                    {!teamMembers[s.team_id] ? <p className="text-xs text-gray-400 py-1">Loading members...</p> :
                     teamMembers[s.team_id].length === 0 ? <p className="text-xs text-gray-400 py-1">No members</p> :
                     teamMembers[s.team_id].map((m: any) => (
                      <div key={m.user_id} className="text-xs text-gray-600 flex items-center gap-2 py-0.5">
                        <UserIcon className="w-3 h-3 text-ink-faint"/>
                        <span>{m.profile?.display_name || m.profile?.email || m.user_id.slice(0,8)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          </div>
          </>
        )}
      </div>
      </ParticipantShell>
  );
}


export default function ParticipantLeaderboard() { return <Suspense fallback={<p>Loading...</p>}><LeaderboardInner /></Suspense>; }
