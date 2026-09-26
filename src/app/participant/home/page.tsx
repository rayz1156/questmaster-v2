"use client";
import ParticipantShell from "@/components/ParticipantShell";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Home, Compass, Trophy, User as UserIcon, Users, GraduationCap, Zap, ClipboardList, BarChart3, ArrowRight, Megaphone, CheckCircle2, Clock, Star, KeyRound, BookOpen } from "lucide-react";
import { useSession } from "@/lib/session";
import { listQuestsForParticipant, listEnrolledClasses, getMyProfile, listClassTeamScores, joinClassByCode, leaveClassAsStudent, type Hunt } from "@/lib/data";
import { supabase } from "@/lib/supabaseClient";
import PeerReviewBanner from "@/components/PeerReviewBanner";


function initials(s: string) {
  const parts = (s || '').trim().split(/\s+/).slice(0,2);
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?';
}

export default function Page() {
  const { user } = useSession('participant');
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [name, setName] = useState<string>("");
  const [dataReady, setDataReady] = useState(false);
  const [activeClassId, setActiveClassId] = useState<string>("");
  const [scores, setScores] = useState<any[]>([]);
  const [joinCode, setJoinCode] = useState<string>("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joinOk, setJoinOk] = useState<string | null>(null);
  const onJoinClass = async (e: any) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinErr(null); setJoinOk(null); setJoinBusy(true);
    try {
      await joinClassByCode(joinCode.trim().toUpperCase());
      setJoinOk("Joined! Reloading…");
      setTimeout(() => { window.location.reload(); }, 700);
    } catch (err: any) {
      const msg = String(err?.message || "Failed");
      setJoinErr(/Invalid class code/i.test(msg) ? `Invalid code "${joinCode.trim().toUpperCase()}". Please check with your educator.` : msg);
    } finally {
      setJoinBusy(false);
    }
  };
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [scoresLoading, setScoresLoading] = useState(false);

  useEffect(() => { if (!user) return; (async () => {
    const [h, c, p] = await Promise.all([
      listQuestsForParticipant(),
      listEnrolledClasses(),
      getMyProfile(),
    ]);
    setHunts(h);
    setClasses(c);
    setName(p?.display_name || "");
    if (c && c.length > 0) setActiveClassId((c[0] as any).id);
    setDataReady(true);
  })(); }, [user]);

  // Fetch class leaderboard + my team for active class
  useEffect(() => {
    if (!activeClassId || !user) { setScores([]); setMyTeamId(null); return; }
    setScoresLoading(true);
    (async () => {
      try {
        const list = await listClassTeamScores(activeClassId);
        const sorted = (list as any[]).slice().sort((a, b) => (Number(b.total_score)||0) - (Number(a.total_score)||0));
        setScores(sorted);
      } catch { setScores([]); }
      try {
        const { data } = await supabase
          .from('qm_team_members')
          .select('team_id, qm_teams!inner(class_id)')
          .eq('user_id', (user as any).id)
          .eq('qm_teams.class_id', activeClassId)
          .maybeSingle();
        setMyTeamId((data as any)?.team_id ?? null);
      } catch { setMyTeamId(null); }
      setScoresLoading(false);
    })();
  }, [activeClassId, user]);

  const activeClass = useMemo(() => classes.find((c: any) => c.id === activeClassId), [classes, activeClassId]);
  const activeQuests = useMemo(() => hunts.filter((h: any) => activeClassId ? h.class_id === activeClassId : true), [hunts, activeClassId]);
  const activeQuestCount = activeQuests.length;
  const myTeamRow = useMemo(() => scores.find((s: any) => s.team_id === myTeamId), [scores, myTeamId]);
  const myRank = useMemo(() => myTeamId ? (scores.findIndex((s: any) => s.team_id === myTeamId) + 1) : 0, [scores, myTeamId]);
  const totalPoints = Number(myTeamRow?.total_score) || 0;
  const top4 = scores.slice(0, 4);

  const medalBg = ['bg-gradient-to-br from-amber-300 to-yellow-500', 'bg-gradient-to-br from-slate-300 to-slate-400', 'bg-gradient-to-br from-orange-400 to-amber-700'];
  const teamPalette = ['bg-emerald-100 text-emerald-700','bg-purple-100 text-purple-700','bg-pink-100 text-pink-700','bg-sky-100 text-sky-700','bg-amber-100 text-amber-700'];

  return (
    <ParticipantShell>
      <div className="max-w-shell mx-auto px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Welcome back</div>
            <h1 className="page-title truncate">{dataReady ? (name || "Participant") : " "}</h1>
            <p className="page-subtitle">
              {activeClass ? activeClass.name : dataReady ? "You have not joined a class yet." : " "}
            </p>
          </div>
          {classes.length > 1 && (
            <select
              value={activeClassId}
              onChange={e => setActiveClassId(e.target.value)}
              aria-label="Active class"
              className="input w-auto min-w-[220px]"
            >
              {classes.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          )}
        </div>

        {activeClass?.ended_at && (
          <div data-class-banner="ended" className="mt-6 rounded-xl bg-[#FEF6E7] px-4 py-3 text-sm text-[#8A6100]">
            <span className="font-medium">This class has ended.</span> You can still review the Intro Board, Learning Board, Activities and the final ranking. New submissions are closed.
          </div>
        )}

        <PeerReviewBanner />

        {dataReady && classes.length === 0 ? (
          <div className="mt-10 max-w-md">
            <div className="section-title">Join your first class</div>
            <p className="text-sm text-ink-muted mt-1">Enter the class code your educator gave you.</p>
            <form onSubmit={onJoinClass} className="mt-4 space-y-3">
              <input
                type="text"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(null); }}
                placeholder="ABCD1234"
                maxLength={16}
                required
                className="input font-mono text-center text-lg uppercase tracking-[0.2em]"
              />
              <button type="submit" disabled={joinBusy || !joinCode.trim()} className="btn-primary w-full">
                {joinBusy ? "Joining…" : "Join class"}
              </button>
            </form>
            {joinErr && <p className="mt-2 text-sm text-[#C0392B]">{joinErr}</p>}
            {joinOk && <p className="mt-2 text-sm text-[#2E7D4F]">{joinOk}</p>}
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="card">
                <div className="text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">{dataReady ? activeQuestCount : 0}</div>
                <div className="text-sm text-ink-muted mt-1.5">Active activities</div>
                <Link href="/participant/activities" className="btn-quiet text-brand-purple mt-2">Go to activities</Link>
              </div>
              <div className="card">
                <div className="text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">{totalPoints.toLocaleString()}</div>
                <div className="text-sm text-ink-muted mt-1.5">Total points</div>
                <div className="text-xs text-ink-faint mt-2">{totalPoints > 0 ? "Earned with your team." : "Join a team to start earning."}</div>
              </div>
              <div className="card">
                <div className="text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">{myRank > 0 ? `#${myRank}` : ","}</div>
                <div className="text-sm text-ink-muted mt-1.5">Leaderboard rank</div>
                <div className="text-xs text-ink-faint mt-2">{myRank > 0 && myRank <= 3 ? "Top three. Keep it up." : myRank > 0 ? "Climb higher." : "Join a team to be ranked."}</div>
              </div>
            </div>

            <div className="mt-12">
              <div className="section-title mb-1">Your class</div>
              <div className="surface">
                <Link
                  href={activeClassId ? `/participant/classes/${activeClassId}/board` : "#"}
                  aria-disabled={!activeClassId}
                  className={`flex items-center gap-4 px-5 py-4 ${activeClassId ? "hover:bg-[#FAFAFB]" : "pointer-events-none opacity-50"}`}
                >
                  <span className="w-10 h-10 rounded-full bg-[#EAE6FC] text-brand-purple flex items-center justify-center shrink-0"><ClipboardList className="w-5 h-5" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-medium text-ink">Intro Board</span>
                    <span className="block text-sm text-ink-muted mt-0.5">Class information, announcements and guidelines.</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-ink-faint shrink-0" />
                </Link>
                <Link
                  href={activeClassId ? `/participant/classes/${activeClassId}/learning-board` : "#"}
                  aria-disabled={!activeClassId}
                  className={`t-row flex items-center gap-4 px-5 py-4 ${activeClassId ? "hover:bg-[#FAFAFB]" : "pointer-events-none opacity-50"}`}
                >
                  <span className="w-10 h-10 rounded-full bg-[#EAE6FC] text-brand-purple flex items-center justify-center shrink-0"><BookOpen className="w-5 h-5" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-medium text-ink">Learning Board</span>
                    <span className="block text-sm text-ink-muted mt-0.5">Modules, lessons and materials, session by session.</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-ink-faint shrink-0" />
                </Link>
              </div>
            </div>

            <div className="mt-12">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <div className="section-title">Leaderboard</div>
                <Link href="/participant/leaderboard" className="btn-quiet text-brand-purple">View all</Link>
              </div>
              {scoresLoading ? (
                <div className="space-y-2 mt-3">{[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-[#F4F4F6] animate-pulse" />)}</div>
              ) : top4.length === 0 ? (
                <p className="text-sm text-ink-muted py-6">No team scores yet for this class.</p>
              ) : (
                <div className="surface mt-3">
                  {top4.map((r: any, idx: number) => {
                    const isMine = r.team_id === myTeamId;
                    return (
                      <div key={r.team_id} className={`flex items-center gap-3 px-5 py-3.5 ${idx > 0 ? "t-row" : ""} ${isMine ? "bg-[#F7F6FD]" : ""}`}>
                        <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${idx < 3 ? `${medalBg[idx]} text-white` : "bg-[#F4F4F6] text-ink-muted"}`}>{idx + 1}</span>
                        <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs ${teamPalette[idx % teamPalette.length]}`}>
                          {initials(r.team_name || ("Team " + String(r.team_id).slice(0, 2)))}
                        </span>
                        <span className="flex-1 min-w-0 text-[15px] text-ink truncate">
                          {r.team_name || ("Team " + String(r.team_id).slice(0, 8))}
                          {isMine && <span className="ml-2 text-xs text-brand-purple">Your team</span>}
                        </span>
                        <span className="text-sm font-semibold text-ink tabular-nums whitespace-nowrap">{(Number(r.total_score) || 0).toLocaleString()} pts</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-16 mb-4 border-t border-hairline pt-6 flex flex-wrap items-start justify-between gap-4">
              <details className="min-w-0">
                <summary className="btn-quiet cursor-pointer list-none text-brand-purple">Join another class</summary>
                <form onSubmit={onJoinClass} className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(null); }}
                    placeholder="ABCD1234"
                    maxLength={16}
                    required
                    className="input w-[200px] font-mono uppercase tracking-[0.2em]"
                  />
                  <button type="submit" disabled={joinBusy || !joinCode.trim()} className="btn-secondary">
                    {joinBusy ? "Joining…" : "Join"}
                  </button>
                </form>
                {joinErr && <p className="mt-2 text-sm text-[#C0392B]">{joinErr}</p>}
                {joinOk && <p className="mt-2 text-sm text-[#2E7D4F]">{joinOk}</p>}
              </details>

              {activeClassId && (
                <button
                  type="button"
                  onClick={async () => {
                    const target = classes.find((c: any) => c.id === activeClassId);
                    if (!target) return;
                    if (!confirm(`Leave "${target.name}"? You will lose access to its activities and rankings.`)) return;
                    try {
                      await leaveClassAsStudent(activeClassId);
                      const remaining = classes.filter((c: any) => c.id !== activeClassId);
                      setClasses(remaining);
                      setActiveClassId(remaining[0]?.id || "");
                    } catch (err: any) {
                      alert(err?.message || "Failed to leave class");
                    }
                  }}
                  className="btn-quiet text-[#C0392B]"
                >
                  Leave this class
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </ParticipantShell>
  );
}
