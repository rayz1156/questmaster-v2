'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Course = {
  id: string;
  title: string;
  is_published: boolean;
  price_cents: number | null;
  currency: string | null;
  lesson_count: number | null;
  updated_at: string;
};

export default function CoursesListPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: cr } = await supabase.from('lms_creators').select('id').eq('owner_id', user.id).maybeSingle();
      if (!cr) { setLoading(false); return; }
      const { data } = await supabase
        .from('lms_courses')
        .select('id, title, is_published, price_cents, currency, lesson_count, updated_at')
        .eq('creator_id', (cr as { id: string }).id)
        .order('updated_at', { ascending: false });
      setCourses((data ?? []) as Course[]);
      setLoading(false);
    })();
  }, []);

  function priceLabel(c: Course) {
    if (!c.price_cents || c.price_cents === 0) return 'Free';
    const amt = (c.price_cents / 100).toFixed(2);
    return `${c.currency || 'USD'} ${amt}`;
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Courses</h1>
          <p className="mt-1 text-sm text-slate-600">Create and manage your course catalog.</p>
        </div>
        <Link href="/creator/courses/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-sm font-medium hover:opacity-95">+ New course</Link>
      </div>

      <div className="mt-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">Loading…</div>
        ) : courses.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-5xl">📚</div>
            <div className="mt-3 font-semibold text-slate-900">No courses yet</div>
            <p className="mt-1 text-sm text-slate-500">Create your first course to get started.</p>
            <Link href="/creator/courses/new" className="mt-4 inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">+ Create course</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Lessons</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-4 font-medium text-slate-900">{c.title}</td>
                  <td className="px-5 py-4">
                    {c.is_published ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Published</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">Draft</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-slate-600">{c.lesson_count ?? 0}</td>
                  <td className="px-5 py-4 text-slate-600">{priceLabel(c)}</td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/creator/courses/${c.id}/edit`} className="text-emerald-700 hover:text-emerald-800 font-medium">Edit →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
