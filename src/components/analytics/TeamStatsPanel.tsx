'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Users } from 'lucide-react';

type Member = { userId: string; name: string; approvedSubmissions: number };
type Team = {
  id: string;
  name: string;
  score: number;
  maxMembers: number;
  memberCount: number;
  awardedPoints: number;
  totalApprovedContributions: number;
  topContributorShare: number;
  balanceScore: number;
  members: Member[];
};
type HuntBlock = { huntId: string; huntTitle: string; teams: Team[] };
type Resp = { hunts: HuntBlock[] };

function balanceColor(score: number): string {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}
function balanceLabel(score: number): string {
  if (score >= 75) return 'Balanced';
  if (score >= 50) return 'Mixed';
  return 'Skewed';
}

export default function TeamStatsPanel({ classId }: { classId: string | null }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!classId || classId === 'all') { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        const r = await fetch(`/api/analytics/team-stats?classId=${encodeURIComponent(classId)}`, { headers });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Failed to load');
        if (!cancelled) setData(j as Resp);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId]);

  if (!classId || classId === 'all') {
    return (
      <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Users className="w-5 h-5 text-purple-600"/> Team contribution & balance</h2>
        <p className="text-xs text-gray-500 mt-2">Pick a specific class to see team contribution and balance.</p>
      </div>
    );
  }

  const hunts = data?.hunts ?? [];
  const allTeams = hunts.flatMap(h => h.teams);
  const avgBalance = allTeams.length > 0
    ? Math.round(allTeams.reduce((s, t) => s + t.balanceScore, 0) / allTeams.length * 10) / 10
    : 0;
  const skewedCount = allTeams.filter(t => t.balanceScore < 50 && t.totalApprovedContributions > 0).length;

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-600"/> Team contribution & balance (Tier 3)
        </h2>
        <div className="text-xs text-gray-500">
          {allTeams.length} teams • avg balance {avgBalance}% • {skewedCount} skewed
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">Balance = 1 − Gini of approved-submission counts across members. Higher = more even contribution.</p>

      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}
      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      {!loading && hunts.length === 0 && !error && (
        <div className="mt-4 text-sm text-gray-500">No quests with teams in this class yet.</div>
      )}

      <div className="mt-4 space-y-5">
        {hunts.map(h => h.teams.length > 0 && (
          <div key={h.huntId}>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">{h.huntTitle}</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {h.teams.map(t => {
                const isOpen = expanded[t.id] ?? false;
                return (
                  <div key={t.id} className="rounded-lg border bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{t.name}</div>
                        <div className="text-xs text-gray-500">{t.memberCount}/{t.maxMembers} members • {t.score} pts • {t.totalApprovedContributions} approved subs</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full text-white ${balanceColor(t.balanceScore)}`}>
                        {balanceLabel(t.balanceScore)} {t.balanceScore}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                        <div className={`h-full ${balanceColor(t.balanceScore)}`} style={{ width: `${Math.min(100, t.balanceScore)}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 tabular-nums">top {t.topContributorShare}%</span>
                    </div>
                    <button
                      onClick={() => setExpanded(s => ({ ...s, [t.id]: !isOpen }))}
                      className="mt-2 text-xs text-purple-600 hover:underline"
                    >
                      {isOpen ? 'Hide members' : `Show ${t.memberCount} members`}
                    </button>
                    {isOpen && (
                      <ul className="mt-2 space-y-1">
                        {t.members.map(m => {
                          const share = t.totalApprovedContributions > 0 ? (m.approvedSubmissions / t.totalApprovedContributions) * 100 : 0;
                          return (
                            <li key={m.userId} className="flex items-center gap-2 text-xs">
                              <span className="flex-1 truncate text-gray-700">{m.name}</span>
                              <div className="w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                <div className="h-full bg-purple-500" style={{ width: `${share}%` }} />
                              </div>
                              <span className="tabular-nums text-gray-500 w-12 text-right">{m.approvedSubmissions} sub</span>
                            </li>
                          );
                        })}
                        {t.members.length === 0 && <li className="text-xs text-gray-400">No members</li>}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
