"use client";
import { useEffect, useState } from "react";
import { Trophy, Flame, Award, Activity, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Badge = { key: string; label: string; tier: "bronze" | "silver" | "gold" };

type TeamRow = {
  team_id: string;
  name: string;
  hunt_id: string;
  score: number;
  completions: number;
  member_count: number;
  last_completion_at: string | null;
  rank: number;
};

type StreakRow = {
  user_id: string;
  name: string;
  current_streak: number;
  best_streak: number;
};

type StudentRow = {
  user_id: string;
  name: string;
  current_streak: number;
  best_streak: number;
  approved_subs: number;
  rejected_subs: number;
  total_subs: number;
  best_rank: number | null;
  max_approved_streak: number;
  badges: Badge[];
  badge_count: number;
};

type Payload = {
  team_rankings: TeamRow[];
  leaderboard_volatility: {
    window_days: number;
    total_leader_changes: number;
    volatility_score: number;
  };
  top_streaks: StreakRow[];
  students: StudentRow[];
  totals: { students: number; teams: number; badges_awarded: number };
  generated_at: string;
};

function tierStyle(t: Badge["tier"]) {
  if (t === "gold") return "bg-amber-100 text-amber-800 ring-amber-200";
  if (t === "silver") return "bg-slate-100 text-slate-700 ring-slate-200";
  return "bg-orange-100 text-orange-800 ring-orange-200";
}

function volStyle(v: number) {
  if (v >= 70) return { label: "High", cls: "bg-rose-100 text-rose-700 ring-rose-200" };
  if (v >= 30) return { label: "Moderate", cls: "bg-amber-100 text-amber-700 ring-amber-200" };
  return { label: "Stable", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" };
}

export default function GamificationPanel({ classId }: { classId: string | null }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "with_badges" | "with_streak">("all");

  useEffect(() => {
    let cancelled = false;
    if (!classId || classId === "all") { setData(null); return; }
    (async () => {
      try {
        setError(null);
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
        const res = await fetch(`/api/analytics/gamification?class_id=${encodeURIComponent(classId)}`, { headers });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        if (!cancelled) setData(j.data as Payload);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId]);

  const students = data?.students ?? [];
  const filtered = students.filter((s) => {
    if (filter === "with_badges") return s.badge_count > 0;
    if (filter === "with_streak") return s.current_streak > 0 || s.best_streak >= 3;
    return true;
  });

  const v = data?.leaderboard_volatility;
  const vStyle = v ? volStyle(v.volatility_score) : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Trophy className="w-4 h-4 text-amber-500" /> Gamification <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-md bg-purple-100 text-purple-700 text-xs font-semibold align-middle" aria-label="Level 6">6</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {loading ? "Loading…" : data
              ? `${data.totals.students} students · ${data.totals.teams} teams · ${data.totals.badges_awarded} badges awarded`
              : "Select a class to view gamification metrics"}
          </div>
        </div>
      </div>
      {error && <div className="p-4 text-sm text-rose-600">{error}</div>}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border-b border-gray-100 bg-gray-50/40">
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
              <Activity className="w-3.5 h-3.5" /> Leaderboard volatility
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <div className="text-2xl font-semibold text-gray-900">{v?.volatility_score ?? 0}</div>
              {vStyle && (
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1 ring-inset ${vStyle.cls}`}>{vStyle.label}</span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {v?.total_leader_changes ?? 0} lead changes in last {v?.window_days ?? 14} days
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
              <Flame className="w-3.5 h-3.5 text-orange-500" /> Top current streak
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {data.top_streaks[0]?.current_streak ?? 0}<span className="text-sm font-normal text-gray-500"> days</span>
            </div>
            <div className="text-xs text-gray-500 mt-1 truncate">
              {data.top_streaks[0]?.name ?? "No active streaks"}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
              <Award className="w-3.5 h-3.5 text-amber-600" /> Badges awarded
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{data.totals.badges_awarded}</div>
            <div className="text-xs text-gray-500 mt-1">
              across {students.filter((s) => s.badge_count > 0).length} students
            </div>
          </div>
        </div>
      )}

      {data && data.team_rankings.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Team rankings</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Team</th>
                  <th className="px-2 py-1.5 text-right">Score</th>
                  <th className="px-2 py-1.5 text-right">Completions</th>
                  <th className="px-2 py-1.5 text-right">Members</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.team_rankings.slice(0, 10).map((t) => (
                  <tr key={t.team_id}>
                    <td className="px-2 py-1.5 text-gray-500">{t.rank}</td>
                    <td className="px-2 py-1.5 text-gray-900 font-medium truncate max-w-[18rem]">{t.name}</td>
                    <td className="px-2 py-1.5 text-right text-gray-900">{t.score ?? 0}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{t.completions}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{t.member_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.top_streaks.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Top streaks</div>
          <div className="flex flex-wrap gap-2">
            {data.top_streaks.map((s) => (
              <div key={s.user_id} className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 ring-1 ring-inset ring-orange-200 px-2.5 py-1 text-xs">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-gray-900 font-medium truncate max-w-[10rem]">{s.name}</span>
                <span className="text-orange-700 font-semibold">{s.current_streak}d</span>
                <span className="text-gray-400">/ best {s.best_streak}d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 text-xs px-4 pt-3">
        {(["all","with_badges","with_streak"] as const).map((b) => (
          <button key={b}
            className={`px-2 py-1 rounded-md ring-1 ring-inset ${filter===b ? "bg-gray-900 text-white ring-gray-900" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"}`}
            onClick={() => setFilter(b)}
          >{b === "all" ? "all students" : b === "with_badges" ? "with badges" : "with streak"}</button>
        ))}
      </div>

      <div className="divide-y divide-gray-100">
        {filtered.length === 0 && !loading && (
          <div className="p-4 text-sm text-gray-500">No students match this filter.</div>
        )}
        {filtered.map((s) => {
          const isOpen = !!expanded[s.user_id];
          return (
            <div key={s.user_id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">{s.name}</span>
                    {s.current_streak > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1 ring-inset bg-orange-100 text-orange-700 ring-orange-200">
                        <Flame className="w-3 h-3" /> {s.current_streak}d streak
                      </span>
                    )}
                    {s.best_rank === 1 && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1 ring-inset bg-amber-100 text-amber-700 ring-amber-200">#1 team</span>
                    )}
                    <span className="text-xs text-gray-500">{s.badge_count} badge{s.badge_count===1?"":"s"}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {s.approved_subs} approved · {s.rejected_subs} rejected · best streak {s.best_streak}d · best rank {s.best_rank ?? "—"}
                  </div>
                  {s.badges.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.badges.map((b) => (
                        <span key={b.key} className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1 ring-inset ${tierStyle(b.tier)}`}>
                          <Award className="w-3 h-3" /> {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="shrink-0 p-1.5 rounded-md ring-1 ring-inset ring-gray-200 text-gray-500 hover:bg-gray-50"
                  onClick={() => setExpanded((p) => ({ ...p, [s.user_id]: !p[s.user_id] }))}
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              {isOpen && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-md bg-gray-50 p-2">
                    <div className="text-gray-500">Current streak</div>
                    <div className="text-sm font-semibold text-gray-900">{s.current_streak}d</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <div className="text-gray-500">Best streak</div>
                    <div className="text-sm font-semibold text-gray-900">{s.best_streak}d</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <div className="text-gray-500">Approved streak</div>
                    <div className="text-sm font-semibold text-gray-900">{s.max_approved_streak}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <div className="text-gray-500">Submissions</div>
                    <div className="text-sm font-semibold text-gray-900">{s.total_subs}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
