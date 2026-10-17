'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function NewCoursePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug)) { setError('Slug must be 3-80 chars: lowercase letters, numbers, hyphens.'); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const { data: cr, error: crErr } = await supabase.from('lms_creators').select('id').eq('owner_id', user.id).maybeSingle();
    if (crErr || !cr) { setError('Creator profile not found.'); setBusy(false); return; }
    const { data: course, error: insErr } = await supabase
      .from('lms_courses')
      .insert({
        creator_id: (cr as { id: string }).id,
        title: title.trim(),
        slug,
        subtitle: subtitle.trim() || null,
        is_free: true,
        price_cents: 0,
        currency: 'USD',
        is_published: false,
      })
      .select('id')
      .single();
    setBusy(false);
    if (insErr || !course) { setError(insErr?.message || 'Could not create course.'); return; }
    router.push(`/creator/courses/${(course as { id: string }).id}/edit`);
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <Link href="/creator/courses" className="text-sm text-slate-500 hover:text-slate-700">← Back to courses</Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Create a new course</h1>
      <p className="mt-1 text-sm text-slate-600">Start with the basics. You can add lessons, pricing, and publish next.</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4 bg-white border border-slate-200 rounded-xl p-6">
        <div>
          <label className="text-sm font-medium text-slate-700">Title</label>
          <input value={title} onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" placeholder="Intro to Modern CSS" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">URL slug</label>
          <div className="mt-1 flex items-stretch rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-emerald-500 overflow-hidden">
            <span className="px-3 flex items-center bg-slate-50 text-sm text-slate-500 border-r border-slate-300">.../course/</span>
            <input value={slug} onChange={(e) => { const v = slugify(e.target.value); setSlug(v); setSlugTouched(v.length > 0); }} className="flex-1 px-3 py-2 outline-none" placeholder="intro-to-modern-css" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Subtitle <span className="text-slate-400 font-normal">(optional)</span></label>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" placeholder="A short hook for your course card" />
        </div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Link href="/creator/courses" className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</Link>
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{busy ? 'Creating…' : 'Create course'}</button>
        </div>
      </form>
    </div>
  );
}
