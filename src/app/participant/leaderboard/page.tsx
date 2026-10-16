"use client";

/**
 * Leaderboard peserta, rupa v3 KZ-023.
 *
 * Jadual guna DataTable kit (avatar inisial, kedudukan, penomboran
 * pelanggan, baris kembang ahli pasukan). Podium LeaderboardPodium,
 * fungsi kira markah, kitaran segar 8 saat, togol Teams/Individuals,
 * penapisan kelas yang disembunyikan educatornya (leaderboard_visible)
 * dan pemilih aktiviti kekal seperti sebelum KZ-023.
 *
 * Pautan "Back to class dashboard" dahulu menuju /participant/classes/<id>
 * yang tiada halaman indeksnya; kini ia memaut ke Intro Board kelas
 * (laluan /participant/classes/<id>/board yang benar-benar wujud).
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw, User as UserIcon, Users } from "lucide-react";
import ParticipantShell from "@/components/ParticipantShell";
import { LeaderboardPodium } from "@/components/LiveLeaderboard";
import {
  listMyHuntsByClass,
  listTeamScores,
  listClassTeamScores,
  listClassIndividualScores,
  listScoreAdjustments,
  listEnrolledClasses,
  listTeamMembers,
  type Hunt,
  type TeamScore,
  type ScoreAdjustment,
  type ClassIndividualScore,
  type Klass,
} from "@/lib/data";
import {
  Alert,
  Avatar,
  Button,
  DataTable,
  EmptyState,
  InitialTile,
  PageHead,
  Select,
  Tabs,
  type DataColumn,
} from "@/components/ui";

type AggScore = { team_id: string; team_name: string; total_score: number; quest_count: number };

/** Baris pasukan siap dipapar dalam DataTable. */
type BarisPasukan = { team_id: string; team_name: string; total_score: number; quest_count?: number; kedudukan: number };
type BarisIndividu = ClassIndividualScore & { kedudukan: number };

/** Ahli pasukan seperti yang dikembalikan listTeamMembers. */
type Ahli = { user_id: string; profile?: { display_name?: string | null; email?: string | null } | null };

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
  // Penyesuaian markah terus dimuat (panggilan data tidak berubah) walaupun
  // halaman ini belum memaparnya; tiada UI memanggilnya lagi.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [adj, setAdj] = useState<ScoreAdjustment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<Record<string, Ahli[]>>({});
  const [halaman, setHalaman] = useState(1);

  const toggleTeam = async (teamId: string) => {
    if (expandedTeam === teamId) { setExpandedTeam(null); return; }
    setExpandedTeam(teamId);
    if (!teamMembers[teamId]) {
      try {
        const members = (await listTeamMembers(teamId)) as Ahli[];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        } catch (e) { setErr((e as Error).message); return; }
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
    } catch (e) { setErr((e as Error).message); }
  }

  const isIndividual = viewMode === 'individual';
  const leaderboard = activeId ? scores.sort((a, b) => b.total_score - a.total_score) : aggScores;
  // Tangga hanya bermakna bila ada sekurang-kurangnya dua nama. Di bawah itu,
  // senarai biasa lebih jujur daripada podium yang separuh kosong.
  const indivRest = indivScores.length >= 2 ? 3 : 0;
  const teamRest = leaderboard.length >= 2 ? 3 : 0;

  // Baris pasukan ternormalizasi untuk DataTable (quest_count hanya bila ada).
  const barisPasukan: BarisPasukan[] = leaderboard.map((s, idx) => ({
    kedudukan: idx + 1,
    team_id: s.team_id,
    team_name: s.team_name,
    total_score: s.total_score,
    ...('quest_count' in s ? { quest_count: (s as AggScore).quest_count } : {}),
  }));

  const lajurPasukan: DataColumn<BarisPasukan>[] = [
    {
      key: "rank",
      header: "Rank",
      render: (r) => (
        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink tabular-nums">
          {r.kedudukan}
          {r.kedudukan === 1 && <span className="w-1.5 h-1.5 rounded-full bg-[#E3B341]" aria-hidden="true" />}
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
        r.quest_count != null
          ? <span className="text-[13px] text-ink-faint tabular-nums">{r.quest_count}</span>
          : null
      ),
    },
    {
      key: "points",
      header: "Points",
      className: "text-right",
      render: (r) => <span className="text-[13px] font-medium text-ink tabular-nums">{r.total_score}</span>,
    },
  ];

  // Kedudukan sebenar dikira sebelum podium dipisahkan daripada jadual.
  const barisIndividu: BarisIndividu[] = indivScores.map((s, idx) => ({ ...s, kedudukan: idx + 1 }));

  const lajurIndividu: DataColumn<BarisIndividu>[] = [
    {
      key: "rank",
      header: "Rank",
      render: (r) => (
        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink tabular-nums">
          {r.kedudukan}
          {r.kedudukan === 1 && <span className="w-1.5 h-1.5 rounded-full bg-[#E3B341]" aria-hidden="true" />}
        </span>
      ),
    },
    {
      key: "student",
      header: "Student",
      render: (r, i) => (
        <span className="flex items-center gap-3 py-3">
          <Avatar name={r.display_name || "Student"} size="md" index={i} />
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-ink truncate">{r.display_name || "Student"}</span>
            {/* Pecahan markah individu daripada view qm_class_individual_scores. */}
            <span className="block text-[12px] text-ink-faint truncate">
              Activities {r.task_score ?? 0} · Live Quiz {r.live_score ?? 0} · Adjustments {r.adjustment_score ?? 0}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "points",
      header: "Points",
      className: "text-right",
      render: (r) => <span className="text-[13px] font-medium text-ink tabular-nums">{r.total_score}</span>,
    },
  ];

  return (
    <ParticipantShell>
      {classId && (
        <Button variant="ghost" href={`/participant/classes/${classId}/board`} className="mb-2">
          <ArrowLeft className="w-4 h-4" /> Back to class dashboard
        </Button>
      )}
      <PageHead
        title="Who is ahead right now."
        description="Scores update as groups complete activities."
        secondaryActions={[{ label: "Refresh", icon: <RefreshCw className="w-4 h-4" />, onSelect: loadScores }]}
      />

      {/* Class & Activity selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 max-w-3xl">
        <div>
          <div className="text-sm font-medium text-ink mb-1.5">Class</div>
          {classes.length === 0 ? <p className="text-sm text-ink-muted">No leaderboard is available yet.</p> : (
            <Select className="w-auto" value={classId} onChange={e => setClassId(e.target.value)} aria-label="Select class">
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </div>
        <div>
          <div className="text-sm font-medium text-ink mb-1.5">Activity</div>
          {classId && hunts.length > 0 ? (
            <Select className="w-auto" value={activeId} onChange={e => setActiveId(e.target.value)} aria-label="Filter by activity">
              <option value="">All activities</option>
              {hunts.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
            </Select>
          ) : (
            <p className="text-sm text-ink-faint py-2.5">Select a class with activities.</p>
          )}
        </div>
      </div>

      {err && <Alert tone="danger" className="mb-4">{err}</Alert>}

      {/* Leaderboard */}
      <div className="mb-4">
        <h2 className="section-title">
          {isIndividual && !activeId ? "Individuals" : activeId ? "Activity leaderboard" : "Class leaderboard"}
        </h2>
        <p className="text-sm text-ink-muted mt-0.5">
          {isIndividual && !activeId ? "Students ranked by their own approved work." : "Rankings update automatically as groups complete activities."}
        </p>
      </div>

      {!activeId && (
        <Tabs
          className="mb-5"
          items={[
            { label: "Teams", onSelect: () => setViewMode('team'), aktif: viewMode === 'team' },
            { label: "Individuals", onSelect: () => setViewMode('individual'), aktif: viewMode === 'individual' },
          ]}
        />
      )}

      {isIndividual && !activeId ? (
        <>
          {indivRest > 0 && (
            <LeaderboardPodium
              className="mb-6"
              rows={indivScores.slice(0, 3).map((s, i) => ({ rank: i + 1, name: s.display_name || 'Student', score: s.total_score }))}
            />
          )}
          <DataTable
            label="Individual leaderboard"
            columns={lajurIndividu}
            rows={barisIndividu.slice(indivRest)}
            rowKey={(s) => s.user_id}
            halaman={halaman}
            saizHalaman={10}
            onHalaman={setHalaman}
            empty={
              <EmptyState icon={<UserIcon className="w-6 h-6" />} title="No students ranked yet." />
            }
          />
        </>
      ) : (
        <>
          {teamRest > 0 && (
            <LeaderboardPodium
              className="mb-6"
              rows={leaderboard.slice(0, 3).map((s, i) => ({ rank: i + 1, name: s.team_name, score: s.total_score }))}
            />
          )}
          <DataTable
            label="Team leaderboard"
            columns={lajurPasukan}
            rows={barisPasukan.slice(teamRest)}
            rowKey={(r) => r.team_id}
            onRowClick={(r) => toggleTeam(r.team_id)}
            renderRowExtra={(r) =>
              expandedTeam === r.team_id ? (
                <div className="py-2">
                  <div className="pl-4 sm:pl-[68px] border-l-2 border-[#ebe2ff] space-y-1">
                    {!teamMembers[r.team_id] ? <p className="text-xs text-ink-faint py-1">Loading members...</p> :
                     teamMembers[r.team_id].length === 0 ? <p className="text-xs text-ink-faint py-1">No members</p> :
                     teamMembers[r.team_id].map((m: Ahli) => (
                      <div key={m.user_id} className="text-xs text-ink-muted flex items-center gap-2 py-0.5">
                        <UserIcon className="w-3 h-3 text-ink-faint" />
                        <span>{m.profile?.display_name || m.profile?.email || m.user_id.slice(0, 8)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            }
            halaman={halaman}
            saizHalaman={10}
            onHalaman={setHalaman}
            empty={
              <EmptyState icon={<Users className="w-6 h-6" />} title="No teams yet." />
            }
          />
        </>
      )}

      {barisPasukan.length > 0 && (
        <p className="text-xs text-ink-faint mt-3">Click a team to see its members</p>
      )}
    </ParticipantShell>
  );
}

export default function ParticipantLeaderboard() { return <Suspense fallback={<p>Loading...</p>}><LeaderboardInner /></Suspense>; }
