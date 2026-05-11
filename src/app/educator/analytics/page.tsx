"use client";
import { useEffect, useState, useMemo } from "react";
import ActivityStatsPanel from "@/components/analytics/ActivityStatsPanel";
import AtRiskPanel from "@/components/analytics/AtRiskPanel";
import GamificationPanel from "@/components/analytics/GamificationPanel";
import TeamStatsPanel from "@/components/analytics/TeamStatsPanel";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { listMyEducatorClasses } from "@/lib/data";
import type { EducatorClassRow } from "@/lib/types";
import {
  GraduationCap, ListChecks, Users, BarChart3, User as UserIcon, BookOpen,
  Activity, TrendingUp, AlertTriangle, Eye, LogIn, Target, CheckCircle2, HelpCircle,
} from "lucide-react";

const tabs = [
  { href: "/educator/classes",   label: "Classes",   icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams",     label: "Teams",     icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings",  label: "Rankings",  icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/analytics", label: "Analytics", icon: <Activity className="w-5 h-5"/> },
  { href: "/educator/profile",   label: "Profile",   icon: <UserIcon className="w-5 h-5"/> },
];

type Summary = {
  class_id: string | null;
  totals: { total_events: number; unique_users: number; page_views: number; logins: number; quest_opens: number; quest_submits: number };
  inactivity: { active_1d: number; active_7d: number; active_30d: number; at_risk_inactive_7d: number };
  daily: Array<{ day: string; dau: number; events: number }>;
  hourly: Array<{ hour: number; events: number }>;
};

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number | string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{icon}<span>{label}</span></div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

function LineChart({ data }: { data: Array<{ day: string; dau: number }> }) {
  const { points, max, width, height } = useMemo(() => {
    const w = 720, h = 180, pad = 28;
    if (data.length === 0) return { points: "", max: 0, width: w, height: h };
    const max = Math.max(1, ...data.map(d => d.dau));
    const step = (w - 2 * pad) / Math.max(1, data.length - 1);
    const pts = data.map((d, i) => {
      const x = pad + i * step;
      const y = h - pad - ((d.dau / max) * (h - 2 * pad));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return { points: pts, max, width: w, height: h };
  }, [data]);
  if (data.length === 0) return <div className="text-sm text-gray-500">No data yet — analytics start collecting now.</div>;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44">
      <polyline fill="none" stroke="#7c3aed" strokeWidth="2.5" points={points} />
      <polyline fill="url(#g)" stroke="none" points={`28,${height-28} ${points} ${width-28},${height-28}`} opacity="0.15" />
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>
      <text x="6" y="14" fontSize="10" fill="#6b7280">peak {max}</text>
    </svg>
  );
}

function HourBars({ data }: { data: Array<{ hour: number; events: number }> }) {
  const buckets = Array.from({ length: 24 }, (_, h) => data.find(d => d.hour === h)?.events ?? 0);
  const max = Math.max(1, ...buckets);
  return (
    <div className="flex items-end gap-1 h-32">
      {buckets.map((v, h) => (
        <div key={h} className="flex-1 flex flex-col items-center gap-1" title={`${h}:00 — ${v} events`}>
          <div className="w-full bg-purple-500/80 rounded-t" style={{ height: `${(v / max) * 100}%` }} />
          {h % 3 === 0 && <span className="text-[10px] text-gray-500">{h}h</span>}
        </div>
      ))}
    </div>
  );
}

export default function EducatorAnalyticsPage() {
  const [classes, setClasses] = useState<EducatorClassRow[]>([]);
  const [classId, setClassId] = useState<string | "all">("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listMyEducatorClasses().then(setClasses).catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
        const qs = classId === "all" ? "" : `?class_id=${encodeURIComponent(classId)}`;
        const res = await fetch(`/api/analytics/engagement${qs}`, { headers });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to load analytics");
        if (!cancelled) setSummary(j.data as Summary);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId]);

  const t = summary?.totals;
  const inact = summary?.inactivity;

  return (
    <Shell tabs={tabs}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Activity className="w-7 h-7 text-purple-600"/> Analytics</h1>
          <p className="text-sm text-gray-600 mt-1">Engagement & access overview for the last 90 days.</p>
        </div>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value as string | "all")}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="all">All my classes</option>
          {classes.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>

      {loading && <div className="mt-6 text-sm text-gray-500">Loading analytics…</div>}
      {error && <div className="mt-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      {summary && (
        <>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat icon={<Eye className="w-4 h-4"/>}        label="Page views"   value={t!.page_views} />
            <Stat icon={<LogIn className="w-4 h-4"/>}      label="Logins"       value={t!.logins} />
            <Stat icon={<Users className="w-4 h-4"/>}      label="Unique users" value={t!.unique_users} />
            <Stat icon={<Target className="w-4 h-4"/>}     label="Quest opens"  value={t!.quest_opens} />
            <Stat icon={<CheckCircle2 className="w-4 h-4"/>} label="Submissions"  value={t!.quest_submits} />
            <Stat icon={<TrendingUp className="w-4 h-4"/>} label="Total events" value={t!.total_events} />
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
            <Stat icon={<Activity className="w-4 h-4 text-green-600"/>}    label="Active 24h"  value={inact!.active_1d} />
            <Stat icon={<Activity className="w-4 h-4 text-purple-600"/>}   label="Active 7d"   value={inact!.active_7d} />
            <Stat icon={<Activity className="w-4 h-4 text-indigo-600"/>}   label="Active 30d"  value={inact!.active_30d} />
            <Stat icon={<AlertTriangle className="w-4 h-4 text-amber-600"/>} label="At risk (>7d)" value={inact!.at_risk_inactive_7d} hint="Inactive for over a week" />
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-purple-600"/> Daily active users</h2>
              <p className="text-xs text-gray-500">Unique users per day across this {classId === 'all' ? 'account' : 'class'}.</p>
              <div className="mt-3"><LineChart data={summary.daily} /></div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><BookOpen className="w-5 h-5 text-purple-600"/> Time-of-day heatmap</h2>
              <p className="text-xs text-gray-500">When students actually work — a tall bar near midnight means deadline crunching.</p>
              <div className="mt-3"><HourBars data={summary.hourly} /></div>
            </div>
          </div>

          <ActivityStatsPanel classId={classId} />
        <TeamStatsPanel classId={classId} />
        <AtRiskPanel classId={classId} />
        <GamificationPanel classId={classId} />
        <p className="mt-6 text-xs text-gray-500">
            More tiers (learning outcomes & mastery) are on the roadmap. Tier 6 (gamification) is now live.
            Submit ideas via <a className="text-purple-600 underline" href="/help">Help → Send Feedback</a>.
          </p>
        </>
      )}
    </Shell>
  );
}
