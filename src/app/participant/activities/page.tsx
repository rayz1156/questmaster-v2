"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Home, Compass, Trophy, User as UserIcon, Users, Target, ClipboardList, Calendar, ExternalLink, Info, Star, Drama, BookOpen } from "lucide-react";
import Shell from "@/components/Shell";
import { useSession } from "@/lib/session";
import { listQuestsForParticipant, listQuestCompletions, listEnrolledClasses, type Hunt } from "@/lib/data";
import { supabase } from "@/lib/supabaseClient";

const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
      { href: '/participant/learning', label: 'Learning', icon: <BookOpen className="w-5 h-5" /> },
      { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/teams', label: 'Teams', icon: <Users className="w-5 h-5" /> },
  { href: '/participant/leaderboard', label: 'Ranking', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];

function questIcon(title: string) {
  const t = (title || '').toLowerCase();
  if (t.includes('week')) return <Calendar className="w-4 h-4" />;
  if (t.includes('villain') || t.includes('hero') || t.includes('drama') || t.includes('aktiviti')) return <Drama className="w-4 h-4" />;
  return <ClipboardList className="w-4 h-4" />;
}

function Inner() {
  const { user } = useSession('participant');
  const sp = useSearchParams();
  const huntId = sp.get('hunt') || '';
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [active, setActive] = useState<Hunt | null>(null);
  const [completedTeamIds, setCompletedTeamIds] = useState<string[]>([]);
  const [myTeamIds, setMyTeamIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [filterClass, setFilterClass] = useState<string>("");

  useEffect(() => { if (!user) return; (async () => {
    setBusy(true);
    try {
      const [list, cls] = await Promise.all([listQuestsForParticipant(), listEnrolledClasses()]);
      setHunts(list);
      setClasses(cls);
      const sel = huntId ? (list.find(h => h.id === huntId) || null) : (list[0] || null);
      setActive(sel);
      const { data: tm } = await supabase.from('qm_team_members').select('team_id').eq('user_id', user.id);
      setMyTeamIds((((tm as any[]) || [])).map((r) => r.team_id).filter(Boolean));
      if (sel) {
        const cs = await listQuestCompletions(sel.id);
        setCompletedTeamIds(cs.map(c => c.team_id));
      } else { setCompletedTeamIds([]); }
    } finally { setBusy(false); }
  })(); }, [user, huntId]);

  // Re-fetch completions if active changes via tab click
  useEffect(() => {
    if (!active) { setCompletedTeamIds([]); return; }
    (async () => {
      try { const cs = await listQuestCompletions(active.id); setCompletedTeamIds(cs.map(c => c.team_id)); } catch { setCompletedTeamIds([]); }
    })();
  }, [active?.id]);

  const filteredHunts = useMemo(() => filterClass ? hunts.filter((h: any) => h.class_id === filterClass) : hunts, [hunts, filterClass]);
  const myDone = active ? myTeamIds.some(id => completedTeamIds.includes(id)) : false;
  const status = (active as any)?.status || 'active';
  const statusLower = String(status).toLowerCase();

  return (
    <Shell tabs={tabs}>
      <div className="space-y-5">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-50 via-white to-purple-50 border border-purple-100 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-100 text-purple-600 shrink-0"><Target className="w-7 h-7" /></span>
              <div className="min-w-0">
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">My Activities</div>
                <div className="text-sm text-slate-600 mt-0.5">Complete activities to earn points and climb the leaderboard!</div>
              </div>
            </div>
            <div className="md:w-80 shrink-0">
              <label className="block text-xs text-slate-500 mb-1">Filter by class</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-purple-100 text-purple-600"><Users className="w-4 h-4" /></span>
                <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className="w-full pl-12 pr-3 py-3 rounded-xl border border-purple-200 bg-white text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-300">
                  <option value="">All classes</option>
                  {classes.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Activity tabs row */}
        {busy && hunts.length === 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-2">{[1,2,3,4].map(i => <div key={i} className="shrink-0 h-10 w-32 bg-gray-100 rounded-full animate-pulse" />)}</div>
        ) : filteredHunts.length === 0 ? (
          <div className="text-sm text-slate-500">No activities yet. Activities appear here once your educator creates them in your classes.</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {filteredHunts.map(h => {
              const isActive = active?.id === h.id;
              return (
                <Link key={h.id} href={`/participant/activities?hunt=${h.id}`} onClick={() => setActive(h)} className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition border ${isActive ? 'bg-purple-600 text-white border-purple-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50'}`}>
                  {!isActive && (<span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-50 text-emerald-600">{questIcon(h.title)}</span>)}
                  <span className="font-medium whitespace-nowrap">{h.title}</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Active quest detail card */}
        {active && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-start gap-4">
              <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 shrink-0">
                <ClipboardList className="w-8 h-8" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-2xl font-extrabold text-slate-900">{active.title}</div>
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusLower === 'active' ? 'bg-emerald-50 text-emerald-700' : statusLower === 'draft' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusLower === 'active' ? 'bg-emerald-500' : statusLower === 'draft' ? 'bg-sky-500' : 'bg-slate-400'}`} />
                    {status}
                  </span>
                </div>
                {active.description && <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">{active.description}</p>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-slate-500">Reward</div>
                <div className="flex items-center gap-1 justify-end">
                  <span className="text-2xl font-extrabold text-purple-700">{(active as any).points ?? 0} pts</span>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-500 text-xs"><Star className="w-3 h-3 fill-amber-400" /></span>
                </div>
              </div>
            </div>

            {(active as any).instructions && (
              <div className="mt-5">
                <div className="text-xs font-semibold text-slate-500 tracking-widest mb-2">INSTRUCTIONS</div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{(active as any).instructions}</p>
              </div>
            )}

            {((active as any).submission_link) && (
              <div className="mt-5">
                <div className="text-xs font-semibold text-slate-500 tracking-widest mb-2">SUBMISSION LINK</div>
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-purple-200 bg-purple-50/40">
                  <a href={(active as any).submission_link} target="_blank" rel="noreferrer" className="text-sm text-purple-700 underline truncate min-w-0">{(active as any).submission_link_label || (active as any).submission_link}</a>
                  <a href={(active as any).submission_link} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition">
                    <ExternalLink className="w-4 h-4" /> Open submission
                  </a>
                </div>
              </div>
            )}

            {(active as any) && (
          <div className="mt-5">
            <div className="text-xs font-semibold text-slate-500 tracking-widest mb-2">SUBMISSION BOARD</div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-purple-200 bg-purple-50/40">
              <div className="text-sm text-slate-700 min-w-0 truncate">Share your work and see your classmates' submissions.</div>
              <Link href={`/participant/activities/${(active as any).id}/submissions`} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition">
                <ClipboardList className="w-4 h-4" /> Open board
              </Link>
            </div>
          </div>
        )}

        {((active as any).link1 || (active as any).link2) && (
              <div className="mt-5">
                <div className="text-xs font-semibold text-slate-500 tracking-widest mb-2">RESOURCES</div>
                <div className="space-y-2">
                  {[((active as any).link1) as string, ((active as any).link2) as string].filter(Boolean).map((lnk, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200">
                      <a href={lnk} target="_blank" rel="noreferrer" className="text-sm text-purple-700 underline truncate min-w-0">{lnk}</a>
                      <a href={lnk} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-sm font-medium transition">
                        <ExternalLink className="w-4 h-4" /> Open
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={`mt-5 flex items-start gap-3 p-3.5 rounded-xl ${myDone ? 'bg-emerald-50 border border-emerald-100' : 'bg-purple-50 border border-purple-100'}`}>
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${myDone ? 'bg-emerald-500 text-white' : 'bg-purple-600 text-white'}`}>
                <Info className="w-4 h-4" />
              </span>
              <div className={`text-sm ${myDone ? 'text-emerald-800' : 'text-slate-700'}`}>
                {myDone
                  ? `✓ Your team has been awarded ${(active as any).points ?? 0} pts for this quest.`
                  : 'Your team has not been marked complete yet. Your educator will tick the team once the quest is done.'}
              </div>
            </div>
          </div>
        )}

        {!busy && hunts.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-50 text-purple-500 mb-3"><ClipboardList className="w-7 h-7" /></span>
            <div className="font-semibold text-slate-800">No activities yet</div>
            <p className="text-sm text-slate-500 mt-1">Activities appear here once your educator creates them in your classes.</p>
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-4 text-sm text-slate-500">Loading...</div>}><Inner /></Suspense>;
}
