'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Stats = {
  enrollments: number;
  total_lessons: number;
  fully_completed: number;
  completion_rate_pct: number;
  reviews_count: number;
  average_rating: number;
  quiz_attempts: number;
  quiz_passes: number;
  quiz_pass_rate_pct: number;
  certificates_issued: number;
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return (data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) as Record<string, string>;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AnalyticsPanel({ courseId }: { courseId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/creator/analytics/${courseId}`, { headers: { ...(await authHeader()) }, cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return; }
      setStats(j);
    } catch (e: any) { setError(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  })(); }, [courseId]);

  if (loading) return <div className="text-sm text-slate-500">Loading analytics...</div>;
  if (error) return <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg p-3">{error}</div>;
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Stat label="Enrollments" value={stats.enrollments} />
      <Stat label="Completion" value={`${stats.completion_rate_pct}%`} sub={`${stats.fully_completed} / ${stats.enrollments} fully done`} />
      <Stat label="Avg rating" value={stats.average_rating ? stats.average_rating.toFixed(1) : '—'} sub={`${stats.reviews_count} review${stats.reviews_count !== 1 ? 's' : ''}`} />
      <Stat label="Quiz pass rate" value={stats.quiz_attempts > 0 ? `${stats.quiz_pass_rate_pct}%` : '—'} sub={`${stats.quiz_passes} / ${stats.quiz_attempts} attempts`} />
      <Stat label="Certificates" value={stats.certificates_issued} />
      <Stat label="Lessons" value={stats.total_lessons} />
    </div>
  );
}
