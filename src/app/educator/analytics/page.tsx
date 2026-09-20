"use client";
import { useEffect, useState, useMemo } from "react";
import ActivityStatsPanel from "@/components/analytics/ActivityStatsPanel";
import AtRiskPanel from "@/components/analytics/AtRiskPanel";
import GamificationPanel from "@/components/analytics/GamificationPanel";
import MasteryPanel from "@/components/analytics/MasteryPanel";
import TeamStatsPanel from "@/components/analytics/TeamStatsPanel";
import Shell from "@/components/Shell";
import { EDU_TABS } from '@/lib/eduTabs';
import { supabase } from "@/lib/supabaseClient";
import { listMyEducatorClasses } from "@/lib/data";
import type { EducatorClassRow } from "@/lib/types";
import {
  GraduationCap, ListChecks, Users, BarChart3, User as UserIcon, BookOpen,
  Activity, TrendingUp, AlertTriangle, Eye, LogIn, Target, CheckCircle2, HelpCircle,
} from "lucide-react";

type Summary = {
  class_id: string | null;
  totals: { total_events: number; unique_users: number; page_views: number; logins: number; quest_opens: number; quest_submits: number };
  inactivity: { active_1d: number; active_7d: number; active_30d: number; at_risk_inactive_7d: number };
  daily: Array<{ day: string; dau: number; events: number }>;
  hourly: Array<{ hour: number; events: number }>;
};

function Stat({ icon, label, value, hint, tone = "violet" }: { icon: React.ReactNode; label: string; value: number | string; hint?: string; tone?: "violet" | "green" | "rose" }) {
  const ring = tone === "green" ? "bg-[#E3F5EA] text-[#2E7D4F]"
             : tone === "rose" ? "bg-[#FDEBEA] text-[#C0392B]"
             : "bg-[#EAE6FC] text-brand-purple";
  return (
    <div className="card flex items-center gap-4">
      <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${ring}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">{value}</div>
        <div className="text-sm text-ink-muted mt-1.5">{label}</div>
        {hint && <div className="text-xs text-ink-faint mt-0.5">{hint}</div>}
      </div>
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
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
      <polyline fill="none" stroke="#7057D9" strokeWidth="2.5" points={points} />
      <polyline fill="url(#g)" stroke="none" points={`28,${height-28} ${points} ${width-28},${height-28}`} opacity="0.15" />
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7057D9" />
          <stop offset="100%" stopColor="#7057D9" stopOpacity="0" />
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
          <div className="w-full bg-[#B9ABF1] rounded-t" style={{ height: `${(v / max) * 100}%` }} />
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

  const learners = t?.unique_users ?? 0;
  const active30 = inact?.active_30d ?? 0;
  const atRisk = inact?.at_risk_inactive_7d ?? 0;

  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="eyebrow mb-1">Global insights</div>
          <h1 className="page-title">See how learning is going.</h1>
          <p className="page-subtitle">
            Track engagement across all your classes and spot opportunities to support your learners.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value as string | "all")}
            className="input w-auto"
          >
            <option value="all">All classes</option>
            {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <span className="input w-auto flex items-center text-ink-muted cursor-default">Last 90 days</span>
        </div>
      </div>

      {loading && <p className="text-sm text-ink-muted">Loading…</p>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

      {summary && (
        <>
          {/* Tiga nombor yang benar-benar menjawab soalan "bagaimana keadaannya". */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <Stat icon={<Users className="w-5 h-5" />} label="Learners" value={learners} />
            <Stat icon={<TrendingUp className="w-5 h-5" />} label="Active in 30 days" value={active30} tone="green" />
            <Stat icon={<Users className="w-5 h-5" />} label="Inactive over 7 days" value={atRisk} tone="rose" />
          </div>

          {atRisk > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-[#F3E2C0] bg-[#FDF8EC] px-4 py-3.5 mb-5">
              <span className="w-8 h-8 rounded-full bg-[#F6E3BC] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-[#9A6B14]" />
              </span>
              <span className="text-sm text-[#7A5410] flex-1">
                {atRisk} {atRisk === 1 ? "learner has" : "learners have"} not visited in over a week.
              </span>
              <a href="#explore" className="btn-quiet text-[#7A5410] whitespace-nowrap">View learners →</a>
            </div>
          )}

          <div className="surface p-5 mb-5">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <h2 className="font-semibold text-ink">Daily active learners</h2>
              <span className="text-xs text-ink-faint">Last 90 days</span>
            </div>
            <LineChart data={summary.daily} />
            <details className="mt-3 border-t border-hairline pt-3">
              <summary className="flex items-center gap-2 cursor-pointer select-none text-sm text-ink">
                <BarChart3 className="w-4 h-4 text-ink-faint" />
                More usage metrics
                <span className="text-ink-faint">· {t!.page_views.toLocaleString()} page views</span>
              </summary>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                <Stat icon={<Eye className="w-5 h-5" />} label="Page views" value={t!.page_views} />
                <Stat icon={<LogIn className="w-5 h-5" />} label="Sign ins" value={t!.logins} />
                <Stat icon={<Target className="w-5 h-5" />} label="Activity opens" value={t!.quest_opens} />
                <Stat icon={<CheckCircle2 className="w-5 h-5" />} label="Submissions" value={t!.quest_submits} />
                <Stat icon={<TrendingUp className="w-5 h-5" />} label="Total events" value={t!.total_events} />
                <Stat icon={<Activity className="w-5 h-5" />} label="Active in 24 hours" value={inact!.active_1d} />
              </div>
              <div className="mt-5">
                <p className="text-sm text-ink-muted mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-ink-faint" /> When students actually work
                </p>
                <HourBars data={summary.hourly} />
              </div>
            </details>
          </div>

          <div id="explore" className="mb-4">
            <h2 className="section-title">Explore a class</h2>
            <p className="text-sm text-ink-muted mt-0.5">
              Choose a class to see activity completion, team contribution and learning outcomes.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 space-y-4">
              <ActivityStatsPanel classId={classId} />
              <TeamStatsPanel classId={classId} />
            </div>
            <div className="lg:col-span-5 space-y-4">
              <MasteryPanel classId={classId} />
              <AtRiskPanel classId={classId} />
              <GamificationPanel classId={classId} />
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
