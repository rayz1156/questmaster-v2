"use client";
/**
 * Rankings pendidik, rupa v3 KZ-022.
 *
 * Baris jadual guna DataTable kit (InitialTile, lencana, penomboran pelanggan,
 * baris kembang ahli kumpulan). Podium, fungsi kira markah, kitaran segar
 * 8 saat dan panggilan data tidak berubah. Kod mati penyesuaian markah
 * (tiada UI pemanggil sejak sebelum tiket ini) dibuang supaya fail lulus
 * lint; panggilan data penyesuaian kekal dimuat.
 */
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { LeaderboardPodium } from "@/components/LiveLeaderboard";
import { EDU_TABS } from '@/lib/eduTabs';
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, Users, RefreshCw, User as UserIcon } from "lucide-react";
import { listMyHuntsByClass, listTeamScores, listClassTeamScores, listScoreAdjustments, listMyClasses, listTeamMembers, type Hunt, type TeamScore, type ScoreAdjustment, type Klass } from "@/lib/data";
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  InitialTile,
  PageHead,
  ProgressBar,
  Select,
  type DataColumn,
} from "@/components/ui";

type AggScore = { team_id: string; team_name: string; total_score: number; quest_count: number };
type BarisRank = { team_id: string; team_name: string; total_score: number; rank: number; quest_count?: number };
type AhliKumpulan = { user_id: string; profile?: { display_name?: string | null; email?: string | null } | null };

function RankingsInner() {
  const [classes, setClasses] = useState<Klass[]>([]);
  const sp = useSearchParams();
  const [classId, setClassId] = useState(sp.get('classId') || "");
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [activeId, setActiveId] = useState(""); // "" means all quests, or a specific hunt id
  const [scores, setScores] = useState<TeamScore[]>([]);
  const [aggScores, setAggScores] = useState<AggScore[]>([]);
  // Penyesuaian markah terus dimuat (panggilan data tidak berubah) walaupun
  // halaman ini belum memaparnya; tiada UI memanggilnya lagi.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [adj, setAdj] = useState<ScoreAdjustment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<Record<string, AhliKumpulan[]>>({});
  const [halaman, setHalaman] = useState(1);

  const toggleTeam = async (teamId: string) => {
    if (expandedTeam === teamId) { setExpandedTeam(null); return; }
    setExpandedTeam(teamId);
    if (!teamMembers[teamId]) {
      try {
        const members = (await listTeamMembers(teamId)) as AhliKumpulan[];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      } catch { /* fall through to legacy per-hunt aggregation */ }
        // All quests in class - aggregate
        const allScores: TeamScore[] = [];
        const allAdj: ScoreAdjustment[] = [];
        for (const h of hunts) {
          try {
            const s = await listTeamScores(h.id);
            allScores.push(...s);
            const a = await listScoreAdjustments(h.id);
            allAdj.push(...a);
          } catch {}
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
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed to load rankings"); }
  }

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

  const ranked: BarisRank[] = withRank(leaderboard as { team_id: string; team_name: string; total_score: number }[]);
  const top = ranked.length > 0 ? Math.max(1, ...ranked.map(r => r.total_score)) : 1;
  const semuaSifar = ranked.length > 0 && ranked.every(r => r.total_score === 0);

  const lajur: DataColumn<BarisRank>[] = [
    {
      key: "rank",
      header: "Rank",
      render: (r) => (
        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink tabular-nums">
          {semuaSifar ? "–" : r.rank}
          {r.rank === 1 && !semuaSifar && <span className="w-1.5 h-1.5 rounded-full bg-[#E3B341]" aria-hidden="true" />}
        </span>
      ),
    },
    {
      key: "team",
      header: "Team",
      render: (r, i) => (
        <span className="flex items-center gap-3 py-3">
          <InitialTile name={r.team_name} index={i} />
          <span className="text-[14px] font-medium text-ink truncate">{r.team_name}</span>
        </span>
      ),
    },
    {
      key: "activities",
      header: "Activities",
      hideOnMobile: true,
      className: "text-right",
      render: (r) => (
        <span className="text-[13px] text-ink-faint tabular-nums">
          {r.quest_count != null ? r.quest_count : hunts.length}
        </span>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      hideOnMobile: true,
      render: (r) => (
        <ProgressBar value={r.total_score} max={top} label={`Progress for ${r.team_name}`} />
      ),
    },
    {
      key: "points",
      header: "Points",
      className: "text-right",
      render: (r) => <span className="text-[13px] font-medium text-ink tabular-nums">{r.total_score}</span>,
    },
  ];

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
            <Select className="w-auto" value={activeId} onChange={e => setActiveId(e.target.value)} aria-label="Filter by activity">
              <option value="">All activities</option>
              {hunts.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
            </Select>
          )}
          <Button variant="outline" onClick={loadScores}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-kz-up">
            <span className="w-1.5 h-1.5 rounded-full bg-kz-up" aria-hidden="true" /> Live
          </span>
        </div>
      </div>

      {err && <div className="text-sm text-kz-down mb-3">{err}</div>}

      {semuaSifar && (
        <Alert tone="info" icon={<BarChart3 className="w-4 h-4" />} className="mb-5">
          <span className="font-semibold text-ink">A fresh start.</span>{" "}
          Rankings begin when teams earn points.
        </Alert>
      )}

      {!semuaSifar && ranked.length >= 2 && (
        <LeaderboardPodium
          className="mb-6"
          rows={ranked.slice(0, 3).map(r => ({ rank: r.rank, name: r.team_name, score: r.total_score }))}
        />
      )}

      {ranked.length === 0 ? (
        <div className="bg-white rounded-[4px] shadow-card">
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="No teams yet."
            text="Create teams in this class and rankings will appear here."
          />
        </div>
      ) : (
        <DataTable
          label="Team rankings"
          columns={lajur}
          rows={ranked}
          rowKey={(r) => r.team_id}
          onRowClick={(r) => toggleTeam(r.team_id)}
          renderRowExtra={(r) =>
            expandedTeam === r.team_id ? (
              <div className="py-2">
                <div className="pl-4 sm:pl-[68px] border-l-2 border-[#ebe2ff] space-y-1">
                  {!teamMembers[r.team_id] ? <p className="text-xs text-ink-faint py-1">Loading members…</p> :
                   teamMembers[r.team_id].length === 0 ? <p className="text-xs text-ink-faint py-1">No members</p> :
                   teamMembers[r.team_id].map((m: AhliKumpulan) => (
                    <div key={m.user_id} className="text-xs text-ink-muted flex items-center gap-2 py-0.5">
                      <UserIcon className="w-3 h-3 text-ink-faint"/>
                      <span>{m.profile?.display_name || m.profile?.email || m.user_id.slice(0,8)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          }
          halaman={halaman}
          saizHalaman={10}
          onHalaman={setHalaman}
        />
      )}

      {ranked.length > 0 && (
        <p className="text-xs text-ink-faint mt-3">
          Updates automatically · Equal scores share a rank · Click a team to see its members
        </p>
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
      <PageHead
        title="Rankings"
        description="Choose a class to see how its teams are doing."
      />
      {classes.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mb-5">
          <Select className="w-auto" value={classId} onChange={e => setClassId(e.target.value)} aria-label="Select a class">
            <option value="">Select a class</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      )}
      <div className="bg-white rounded-[4px] shadow-card">
        <EmptyState
          icon={<BarChart3 className="w-6 h-6" />}
          title="Pick a class."
          text="Rankings belong to a class, so choose one above."
        />
      </div>
    </Shell>
  );
}

export default function Rankings() { return <Suspense fallback={<p>Loading...</p>}><RankingsInner /></Suspense>; }
