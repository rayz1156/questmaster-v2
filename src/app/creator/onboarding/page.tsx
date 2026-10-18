'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function OnboardingPage() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tagline, setTagline] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) { setError('Slug must be 3-40 chars: lowercase letters, numbers, hyphens.'); return; }
    if (!displayName.trim()) { setError('Display name is required.'); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const { error: insertErr } = await supabase.from('lms_creators').insert({
      owner_id: user.id,
      slug,
      display_name: displayName.trim(),
      tagline: tagline.trim() || null,
      bio_md: bio.trim() || null,
      is_published: true,
    });
    setBusy(false);
    if (insertErr) { setError(insertErr.message); return; }
    router.push('/creator');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-900">Set up your creator profile</h1>
        <p className="mt-2 text-sm text-slate-600">Choose a public URL. You can change everything else later.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Display name</label>
            <input value={displayName} onChange={(e) => { setDisplayName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" placeholder="Jane's Academy" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Public URL</label>
            <div className="mt-1 flex items-stretch rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-emerald-500 overflow-hidden">
              <span className="px-3 flex items-center bg-slate-50 text-sm text-slate-500 border-r border-slate-300">akademi.stafkita.com/c/</span>
              <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className="flex-1 px-3 py-2 outline-none" placeholder="jane" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Tagline <span className="text-slate-400 font-normal">(optional)</span></label>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" placeholder="Short, punchy intro" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">About <span className="text-slate-400 font-normal">(optional, markdown)</span></label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" placeholder="Tell learners what you teach..." />
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-medium hover:opacity-95 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create my storefront'}
          </button>
        </form>
      </div>
    </div>
  );
}
