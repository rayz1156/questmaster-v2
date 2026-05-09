"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Home, Compass, Trophy, User as UserIcon, Users, GraduationCap, Zap, ClipboardList, BarChart3, ArrowRight, Megaphone, CheckCircle2, Clock, Star, KeyRound, BookOpen } from "lucide-react";
import Shell from "@/components/Shell";
import { useSession } from "@/lib/session";
import { listQuestsForParticipant, listEnrolledClasses, getMyProfile, listClassTeamScores, joinClassByCode, type Hunt } from "@/lib/data";
import { supabase } from "@/lib/supabaseClient";

const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/teams', label: 'Teams', icon: <Users className="w-5 h-5" /> },
  { href: '/participant/learning', label: 'Learning', icon: <BookOpen className="w-5 h-5" /> },
  { href: '/participant/rankings', label: 'Ranking', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];

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
    <Shell tabs={tabs}>
      <div className="space-y-5">
        {/* Welcome hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-50 via-white to-purple-50 border border-purple-100 shadow-sm p-6 sm:p-8">
          <div className="relative z-10 max-w-[60%]">
            <div className="text-xs font-semibold text-purple-700 tracking-widest mb-1">✋ WELCOME</div>
            <div className="text-3xl sm:text-4xl font-extrabold text-slate-900">{dataReady ? (name || 'Participant') : ''}</div>
            <div className="mt-2 text-sm text-slate-600">Keep learning, keep growing! You&rsquo;re doing great! <span className="text-amber-500">⭐</span></div>
          </div>
          <div aria-hidden className="hidden sm:block absolute right-6 top-1/2 -translate-y-1/2 text-7xl select-none">
            <span className="inline-block">🏆</span>
          </div>
          <div aria-hidden className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-purple-200/40 blur-2xl" />
          <div aria-hidden className="absolute -right-16 bottom-0 w-56 h-24 rounded-full bg-yellow-200/40 blur-2xl" />
        </div>

        {/* Class selector + Quick actions (left)  Intro Board (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-5 lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-purple-100 text-purple-700"><Users className="w-5 h-5" /></span>
                <span className="font-semibold text-slate-800">Select your class</span>
              </div>
              {classes.length === 0 ? (
                <p className="text-sm text-slate-500">No class joined yet. <Link href="/participant/join" className="text-purple-700 underline">Join one</Link>.</p>
              ) : (
                <select value={activeClassId} onChange={e => setActiveClassId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
                  {classes.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              )}
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <span>Active class</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-purple-100 text-purple-700"><KeyRound className="w-5 h-5" /></span>
                <span className="font-semibold text-slate-800">Join a Class</span>
              </div>
              <form onSubmit={onJoinClass} className="space-y-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(null); }}
                  placeholder="ABCD1234"
                  maxLength={16}
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-center font-mono text-lg uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
                <button
                  type="submit"
                  disabled={joinBusy || !joinCode.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {joinBusy ? "Joining…" : (<><Compass className="w-4 h-4" /> Join class</>)}
                </button>
              </form>
              {joinErr && <p className="mt-2 text-xs text-red-600">{joinErr}</p>}
              {joinOk && <p className="mt-2 text-xs text-emerald-600">{joinOk}</p>}
              {!joinErr && !joinOk && <p className="mt-3 text-xs text-slate-500">Enter the class code given by your educator.</p>}
            </div>
          </div>

          {/* Intro Board */}
          <div className="relative overflow-hidden bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-purple-100 text-purple-700 shrink-0"><ClipboardList className="w-5 h-5" /></span>
              <div className="flex-1">
                <div className="text-xl font-bold text-slate-900">Intro Board</div>
                {activeClass && (<div className="mt-1 inline-block text-xs font-medium text-purple-700 bg-purple-100 px-3 py-1 rounded-full">{activeClass.name}</div>)}
                <p className="mt-3 text-sm text-slate-600 max-w-md">Everything you need to get started in your class. Find class info, announcements, and guidelines.</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  <li className="flex items-center gap-2"><Clock className="w-4 h-4 text-purple-600" /> Class information</li>
                  <li className="flex items-center gap-2"><Megaphone className="w-4 h-4 text-purple-600" /> Announcements</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-purple-600" /> Guidelines &amp; resources</li>
                </ul>
              </div>
              <div aria-hidden className="hidden sm:flex w-32 h-32 rounded-full bg-purple-50 items-center justify-center shrink-0"><ClipboardList className="w-16 h-16 text-purple-500" /></div>
            </div>
            {activeClassId ? (
              <Link href={`/participant/classes/${activeClassId}/board`} className="mt-5 flex items-center justify-center gap-2 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition">
                Open Intro Board <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <button disabled className="mt-5 flex items-center justify-center gap-2 w-full bg-slate-200 text-slate-500 font-semibold py-3 rounded-xl cursor-not-allowed">Select a class to open Intro Board</button>
            )}
          </div>

        {/* Learning Board */}
        <div className="relative overflow-hidden bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 shrink-0"><BookOpen className="w-5 h-5" /></span>
            <div className="flex-1">
              <div className="text-xl font-bold text-slate-900">Learning Board</div>
              {activeClass && (<div className="mt-1 inline-block text-xs font-medium text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">{activeClass.name}</div>)}
              <p className="mt-3 text-sm text-slate-600 max-w-md">Your daily learning hub. Access modules, lessons, and materials and track your progress.</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-emerald-600" /> Modules &amp; lessons</li>
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-emerald-600" /> Learning materials</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Track your progress</li>
              </ul>
            </div>
            <div aria-hidden className="hidden sm:flex w-32 h-32 rounded-full bg-emerald-50 items-center justify-center shrink-0"><BookOpen className="w-16 h-16 text-emerald-500" /></div>
          </div>
          {activeClassId ? (
            <Link href={`/participant/classes/${activeClassId}/learning-board`} className="mt-5 flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition">
              Continue Learning <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <button disabled className="mt-5 flex items-center justify-center gap-2 w-full bg-slate-200 text-slate-500 font-semibold py-3 rounded-xl cursor-not-allowed">Select a class to open Learning Board</button>
          )}
        </div>
        </div>

        {/* 3 stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-purple-50 rounded-2xl p-5 flex items-center gap-4">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-100 text-purple-700 shrink-0"><ClipboardList className="w-7 h-7" /></span>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold text-purple-700">{dataReady ? activeQuestCount : 0}</div>
              <div className="font-semibold text-slate-800">Active Quests</div>
              <div className="text-xs text-slate-500 mt-0.5">Keep going! Complete more to earn points.</div>
              <Link href="/participant/activities" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900">Go to Quests <ArrowRight className="w-3 h-3" /></Link>
            </div>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-5 flex items-center gap-4">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 shrink-0"><Trophy className="w-7 h-7" /></span>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold text-emerald-700">{totalPoints.toLocaleString()}</div>
              <div className="font-semibold text-slate-800">Total Points</div>
              <div className="text-xs text-slate-500 mt-0.5">{totalPoints > 0 ? 'Great job! Keep climbing the leaderboard.' : 'Join a team and earn points to see your score.'}</div>
            </div>
          </div>
          <div className="bg-orange-50 rounded-2xl p-5 flex items-center gap-4">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-100 text-orange-700 shrink-0"><BarChart3 className="w-7 h-7" /></span>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold text-orange-700">{myRank > 0 ? `#${myRank}` : '—'}</div>
              <div className="font-semibold text-slate-800">Leaderboard Rank</div>
              <div className="text-xs text-slate-500 mt-0.5">{myRank > 0 && myRank <= 3 ? "You're in the top 3. Keep it up!" : myRank > 0 ? 'Climb higher — you can do it!' : 'Join a team to be ranked.'}</div>
            </div>
          </div>
        </div>

        {/* Class Leaderboard */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-purple-100 text-purple-700 shrink-0"><BarChart3 className="w-5 h-5" /></span>
              <div>
                <div className="font-bold text-slate-900">Class Leaderboard</div>
                <div className="text-xs text-slate-500">Top performers{activeClass ? ` in ${activeClass.name}` : ''}</div>
              </div>
            </div>
            <Link href="/participant/leaderboard" className="text-sm font-semibold text-purple-700 hover:text-purple-900 inline-flex items-center gap-1">View full leaderboard <ArrowRight className="w-4 h-4" /></Link>
          </div>

          {scoresLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : top4.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No team scores yet for this class.</p>
          ) : (
            <div className="space-y-2">
              {top4.map((r: any, idx: number) => {
                const isMine = r.team_id === myTeamId;
                return (
                  <div key={r.team_id} className={`flex items-center gap-3 p-3 rounded-xl border transition ${isMine ? 'bg-purple-50 border-purple-200' : 'border-slate-100 hover:border-purple-200'}`}>
                    <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${idx < 3 ? `${medalBg[idx]} text-white` : 'bg-slate-100 text-slate-600'}`}>
                      {idx + 1}
                    </span>
                    <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${teamPalette[idx % teamPalette.length]}`}>
                      {initials(r.team_name || ('Team ' + String(r.team_id).slice(0,2)))}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-slate-900 truncate">{r.team_name || ('Team ' + String(r.team_id).slice(0,8))}</span>
                      {isMine && <span className="ml-2 text-xs text-purple-700 font-medium">(Your Team)</span>}
                    </div>
                    <div className="text-purple-700 font-bold text-sm whitespace-nowrap">{(Number(r.total_score)||0).toLocaleString()} pts</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer banner */}
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 text-amber-600 shrink-0"><Star className="w-5 h-5" /></span>
          <div className="flex-1 text-sm text-slate-700">Complete quests, earn points, and climb the leaderboard!</div>
          <Link href="/participant/activities" className="text-sm font-semibold text-amber-600 hover:text-amber-800 inline-flex items-center gap-1 whitespace-nowrap">Go to Quests <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </div>
    </Shell>
  );
}
