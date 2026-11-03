"use client";
import { useEffect, useState } from "react";
import { Trophy, Flame, Award, Activity, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { terjemahBilangan } from "@/lib/i18n";

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
  if (v >= 70) return { cls: "bg-rose-100 text-rose-700 ring-rose-200" };
  if (v >= 30) return { cls: "bg-amber-100 text-amber-700 ring-amber-200" };
  return { cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" };
}

export default function GamificationPanel({ classId }: { classId: string | null }) {
  const { t, bahasa } = useBahasa();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "with_badges" | "with_streak">("all");

  // Label ketidakstabilan ikut bahasa pengguna.
  const volLabel = (v: number): string =>
    v >= 70 ? t("analytics.gamif.volHigh") : v >= 30 ? t("analytics.gamif.volModerate") : t("analytics.gamif.volStable");

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
        if (!cancelled) setError(e instanceof Error ? e.message : t("analytics.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId, t]);

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
            <Trophy className="w-4 h-4 text-amber-500" /> {t("analytics.gamif.title")} <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-md bg-purple-100 text-purple-700 text-xs font-semibold align-middle" aria-label="Level 6">6</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {loading ? t("common.loadingDots") : data
              ? t("analytics.gamif.summary", { pelajar: data.totals.students, pasukan: data.totals.teams, lencana: data.totals.badges_awarded })
              : t("analytics.gamif.selectClass")}
          </div>
        </div>
      </div>
      {error && <div className="p-4 text-sm text-rose-600">{error}</div>}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border-b border-gray-100 bg-gray-50/40">
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
              <Activity className="w-3.5 h-3.5" /> {t("analytics.gamif.volatility")}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <div className="text-2xl font-semibold text-gray-900">{v?.volatility_score ?? 0}</div>
              {v && vStyle && (
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1 ring-inset ${vStyle.cls}`}>{volLabel(v.volatility_score)}</span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {t("analytics.gamif.leadChanges", { n: v?.total_leader_changes ?? 0, hari: v?.window_days ?? 14 })}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
              <Flame className="w-3.5 h-3.5 text-orange-500" /> {t("analytics.gamif.topStreak")}
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {data.top_streaks[0]?.current_streak ?? 0}<span className="text-sm font-normal text-gray-500"> {t("analytics.gamif.daysWord")}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1 truncate">
              {data.top_streaks[0]?.name ?? t("analytics.gamif.noStreaks")}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
              <Award className="w-3.5 h-3.5 text-amber-600" /> {t("analytics.gamif.badgesAwarded")}
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{data.totals.badges_awarded}</div>
            <div className="text-xs text-gray-500 mt-1">
              {t("analytics.gamif.acrossStudents", { n: students.filter((s) => s.badge_count > 0).length })}
            </div>
          </div>
        </div>
      )}

      {data && data.team_rankings.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t("educator.rankings.tableLabel")}</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">{t("common.team")}</th>
                  <th className="px-2 py-1.5 text-right">{t("analytics.gamif.colScore")}</th>
                  <th className="px-2 py-1.5 text-right">{t("analytics.gamif.colCompletions")}</th>
                  <th className="px-2 py-1.5 text-right">{t("analytics.gamif.colMembers")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.team_rankings.slice(0, 10).map((pas) => (
                  <tr key={pas.team_id}>
                    <td className="px-2 py-1.5 text-gray-500">{pas.rank}</td>
                    <td className="px-2 py-1.5 text-gray-900 font-medium truncate max-w-[18rem]">{pas.name}</td>
                    <td className="px-2 py-1.5 text-right text-gray-900">{pas.score ?? 0}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{pas.completions}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{pas.member_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.top_streaks.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t("analytics.gamif.topStreaks")}</div>
          <div className="flex flex-wrap gap-2">
            {data.top_streaks.map((s) => (
              <div key={s.user_id} className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 ring-1 ring-inset ring-orange-200 px-2.5 py-1 text-xs">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-gray-900 font-medium truncate max-w-[10rem]">{s.name}</span>
                <span className="text-orange-700 font-semibold">{s.current_streak}d</span>
                <span className="text-gray-400">{t("analytics.gamif.bestStreak", { n: s.best_streak })}</span>
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
          >{b === "all" ? t("analytics.gamif.filterAll") : b === "with_badges" ? t("analytics.gamif.filterBadges") : t("analytics.gamif.filterStreak")}</button>
        ))}
      </div>

      <div className="divide-y divide-gray-100">
        {filtered.length === 0 && !loading && (
          <div className="p-4 text-sm text-gray-500">{t("analytics.atRisk.noMatch")}</div>
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
                        <Flame className="w-3 h-3" /> {t("analytics.gamif.streakBadge", { n: s.current_streak })}
                      </span>
                    )}
                    {s.best_rank === 1 && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1 ring-inset bg-amber-100 text-amber-700 ring-amber-200">{t("analytics.gamif.teamRank1")}</span>
                    )}
                    <span className="text-xs text-gray-500">{terjemahBilangan(bahasa, "analytics.gamif.badgeOne", "analytics.gamif.badgeOther", s.badge_count, { n: s.badge_count })}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {t("analytics.gamif.statsLine", { lulus: s.approved_subs, tolak: s.rejected_subs, rentetan: s.best_streak, pangkat: s.best_rank ?? "," })}
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
                  aria-label={isOpen ? t("analytics.gamif.collapse") : t("analytics.gamif.expand")}
                >
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              {isOpen && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-md bg-gray-50 p-2">
                    <div className="text-gray-500">{t("analytics.gamif.currentStreak")}</div>
                    <div className="text-sm font-semibold text-gray-900">{s.current_streak}d</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <div className="text-gray-500">{t("analytics.gamif.bestStreakLabel")}</div>
                    <div className="text-sm font-semibold text-gray-900">{s.best_streak}d</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <div className="text-gray-500">{t("analytics.gamif.approvedStreak")}</div>
                    <div className="text-sm font-semibold text-gray-900">{s.max_approved_streak}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <div className="text-gray-500">{t("analytics.gamif.submissions")}</div>
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
