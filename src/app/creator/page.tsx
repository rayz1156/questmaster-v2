'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Stats = { courses: number; published: number; lessons: number };
type Creator = { slug: string; display_name: string; is_published: boolean };

export default function CreatorOverview() {
  const [stats, setStats] = useState<Stats>({ courses: 0, published: 0, lessons: 0 });
  const [creator, setCreator] = useState<Creator | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: cr } = await supabase.from('lms_creators').select('id, slug, display_name, is_published').eq('owner_id', user.id).maybeSingle();
    if (!cr) { setLoading(false); return; }
    setCreator(cr as unknown as Creator);
    const { data: courses } = await supabase.from('lms_courses').select('id, is_published, lesson_count').eq('creator_id', (cr as { id: string }).id);
    const rows = courses ?? [];
    setStats({
      courses: rows.length,
      published: rows.filter((r: { is_published: boolean }) => r.is_published).length,
      lessons: rows.reduce((acc: number, r: { lesson_count: number | null }) => acc + (r.lesson_count ?? 0), 0),
    });
    setLoading(false);
  };

  useEffect(() => {
    loadStats();
    const onVis = () => { if (document.visibilityState === 'visible') loadStats(); };
    const onShow = () => loadStats();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onShow);
    window.addEventListener('focus', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('focus', onShow);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Welcome back{creator ? `, ${creator.display_name}` : ''}</h1>
          <p className="mt-1 text-slate-600">Your creator dashboard.</p>
        </div>
        <Link href="/creator/courses/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-sm font-medium hover:opacity-95">+ New course</Link>
      </div>

      <div className="mt-8 grid md:grid-cols-3 gap-4">
        {[
          { label: 'Total courses', value: stats.courses },
          { label: 'Published', value: stats.published },
          { label: 'Total lessons', value: stats.lessons },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">{s.label}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{loading ? '—' : s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="font-semibold text-slate-900">Quick actions</h2>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          <Link href="/creator/courses" className="block p-4 border border-slate-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50/30 transition">
            <div className="font-medium text-slate-900">Manage courses</div>
            <div className="mt-1 text-sm text-slate-500">Edit curriculum, lessons, and pricing.</div>
          </Link>
          <Link href={creator ? `/c/${creator.slug}` : '#'} target="_blank" className="block p-4 border border-slate-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50/30 transition">
            <div className="font-medium text-slate-900">View your storefront ↗</div>
            <div className="mt-1 text-sm text-slate-500">See your public catalog the way learners do.</div>
          </Link>
        </div>
      </div>
</div>
  );
}
