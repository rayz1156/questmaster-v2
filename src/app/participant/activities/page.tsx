"use client";
import ParticipantShell from "@/components/ParticipantShell";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Home, Compass, Trophy, User as UserIcon, Users, Target, ClipboardList, Calendar, ExternalLink, Info, Star, Drama, BookOpen } from "lucide-react";
import { useSession } from "@/lib/session";
import { listQuestsForParticipant, listQuestCompletions, listEnrolledClasses, type Hunt } from "@/lib/data";
import { supabase } from "@/lib/supabaseClient";


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
    <ParticipantShell>
      <div className="max-w-shell mx-auto px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Activities</div>
            <h1 className="page-title">What is on your plate.</h1>
            <p className="page-subtitle">Complete activities to earn points for your team.</p>
          </div>
          {classes.length > 0 && (
            <select
              value={filterClass}
              onChange={e => setFilterClass(e.target.value)}
              aria-label="Filter by class"
              className="input w-auto min-w-[220px]"
            >
              <option value="">All classes</option>
              {classes.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          )}
        </div>

        {busy && hunts.length === 0 ? (
          <div className="mt-8 flex gap-2 overflow-x-auto pb-2">{[1, 2, 3, 4].map(i => <div key={i} className="shrink-0 h-9 w-32 bg-[#F4F4F6] rounded-full animate-pulse" />)}</div>
        ) : filteredHunts.length === 0 ? (
          <p className="mt-8 text-sm text-ink-muted">No activities yet. They appear here once your educator creates them in your classes.</p>
        ) : (
          <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
            {filteredHunts.map(h => {
              const isActive = active?.id === h.id;
              return (
                <Link
                  key={h.id}
                  href={`/participant/activities?hunt=${h.id}`}
                  onClick={() => setActive(h)}
                  className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                    isActive ? "border-brand-purple bg-[#F4F2FD] text-brand-purple" : "border-hairline text-ink-muted hover:text-ink"
                  }`}
                >
                  {!isActive && <span className="text-ink-faint">{questIcon(h.title)}</span>}
                  <span className="whitespace-nowrap">{h.title}</span>
                </Link>
              );
            })}
          </div>
        )}

        {active && (
          <div className="mt-10 max-w-3xl">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <h2 className="text-[22px] leading-tight font-semibold tracking-tight text-ink">{active.title}</h2>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                    statusLower === "active" ? "bg-[#E3F5EA] text-[#2E7D4F]" : statusLower === "draft" ? "bg-[#EAF2FB] text-[#2E5F8A]" : "bg-[#F1F1F4] text-ink-muted"
                  }`}>
                    {status}
                  </span>
                </div>
                {active.description && <p className="mt-4 text-sm text-ink-muted whitespace-pre-wrap leading-relaxed">{active.description}</p>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">{(active as any).points ?? 0}</div>
                <div className="text-xs text-ink-faint mt-1.5">points</div>
              </div>
            </div>

            {(active as any).instructions && (
              <div className="mt-8">
                <div className="eyebrow mb-1.5">Instructions</div>
                <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{(active as any).instructions}</p>
              </div>
            )}

            <div className="mt-8 surface">
              {((active as any).submission_link) && (
                <a
                  href={(active as any).submission_link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[#FAFAFB]"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-medium text-ink">Submission link</span>
                    <span className="block text-sm text-ink-muted mt-0.5 truncate">{(active as any).submission_link_label || (active as any).submission_link}</span>
                  </span>
                  <ExternalLink className="w-4 h-4 text-ink-faint shrink-0" />
                </a>
              )}

              <Link
                href={`/participant/activities/${(active as any).id}/submissions`}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-[#FAFAFB] ${((active as any).submission_link) ? "t-row" : ""}`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium text-ink">Submission board</span>
                  <span className="block text-sm text-ink-muted mt-0.5">Share your work and see what your classmates posted.</span>
                </span>
                <ClipboardList className="w-4 h-4 text-ink-faint shrink-0" />
              </Link>

              {[((active as any).link1) as string, ((active as any).link2) as string].filter(Boolean).map((lnk, i) => (
                <a key={i} href={lnk} target="_blank" rel="noreferrer" className="t-row flex items-center gap-4 px-5 py-4 hover:bg-[#FAFAFB]">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-medium text-ink">Resource {i + 1}</span>
                    <span className="block text-sm text-ink-muted mt-0.5 truncate">{lnk}</span>
                  </span>
                  <ExternalLink className="w-4 h-4 text-ink-faint shrink-0" />
                </a>
              ))}
            </div>

            <div className={`mt-8 rounded-xl px-4 py-3 text-sm ${myDone ? "bg-[#E3F5EA] text-[#2E7D4F]" : "bg-[#F4F2FD] text-ink"}`}>
              {myDone
                ? `Your team has been awarded ${(active as any).points ?? 0} points for this activity.`
                : "Your team has not been marked complete yet. Your educator ticks the team once the activity is done."}
            </div>
          </div>
        )}

        {!busy && hunts.length === 0 && (
          <div className="mt-16 max-w-md">
            <div className="section-title">No activities yet</div>
            <p className="text-sm text-ink-muted mt-1">They appear here once your educator creates them in your classes.</p>
          </div>
        )}
      </div>
    </ParticipantShell>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-4 text-sm text-slate-500">Loading...</div>}><Inner /></Suspense>;
}
