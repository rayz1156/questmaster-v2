'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ListChecks } from 'lucide-react';

type Quest = {
  id: string;
  title: string;
  status: string;
  maxPoints: number;
  pointsEarned: number;
  totalSubmissions: number;
  approvedSubmissions: number;
  pendingSubmissions: number;
  rejectedSubmissions: number;
  participants: number;
  completionPct: number;
};

type Resp = { memberCount: number; quests: Quest[] };

export default function ActivityStatsPanel({ classId }: { classId: string | null }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const r = await fetch(`/api/analytics/activity-stats?classId=${encodeURIComponent(classId)}`, { headers });
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><ListChecks className="w-5 h-5 text-purple-600"/> Per-quest performance</h2>
        <p className="text-xs text-gray-500 mt-2">Pick a specific class to see per-quest completion and points.</p>
      </div>
    );
  }

  const quests = data?.quests ?? [];
  const totalEarned = quests.reduce((s, q) => s + q.pointsEarned, 0);
  const totalMax = quests.reduce((s, q) => s + q.maxPoints * (data?.memberCount ?? 0), 0);
  const avgCompletion = quests.length > 0
    ? Math.round(quests.reduce((s, q) => s + q.completionPct, 0) / quests.length * 10) / 10
    : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-gray-900 flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-purple-600"/> Per-quest performance <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-md bg-purple-100 text-purple-700 text-xs font-semibold align-middle" aria-label="Level 2">2</span>
        </h2>
        <div className="text-xs text-gray-500">
          {data?.memberCount ?? 0} members • avg completion {avgCompletion}% • {totalEarned}/{totalMax} pts earned
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">Completion = unique members with at least one approved submission ÷ class size.</p>

      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}
      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

      {!loading && quests.length === 0 && !error && (
        <div className="mt-4 text-sm text-gray-500">No quests created in this class yet.</div>
      )}

      {quests.length > 0 && (
        <div className="mt-4 overflow-auto max-h-[420px]">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Quest</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-right py-2 pr-3">Submissions</th>
                <th className="text-right py-2 pr-3">Approved</th>
                <th className="text-right py-2 pr-3">Pending</th>
                <th className="text-right py-2 pr-3">Participants</th>
                <th className="text-left py-2 pr-3 w-48">Completion</th>
                <th className="text-right py-2">Points</th>
              </tr>
            </thead>
            <tbody>
              {quests.map(q => (
                <tr key={q.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium text-gray-900">{q.title}</td>
                  <td className="py-2 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${q.status === 'published' ? 'bg-emerald-100 text-emerald-700' : q.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>{q.status}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{q.totalSubmissions}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-emerald-700">{q.approvedSubmissions}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-amber-700">{q.pendingSubmissions}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{q.participants}/{data?.memberCount ?? 0}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-purple-500" style={{ width: `${Math.min(100, q.completionPct)}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 tabular-nums w-10 text-right">{q.completionPct}%</span>
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{q.pointsEarned}<span className="text-xs text-gray-400">/{q.maxPoints}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
