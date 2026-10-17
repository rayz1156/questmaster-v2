'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MdEditor } from '@/components/MdEditor';

type Creator = {
  id: string;
  slug: string;
  display_name: string;
  tagline: string | null;
  bio_md: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  theme_color: string | null;
  default_payment_provider: string | null;
};

export default function SettingsPage() {
  const [c, setC] = useState<Creator | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('lms_creators').select('*').eq('owner_id', user.id).maybeSingle();
      setC(data as Creator);
      setLoading(false);
    })();
  }, []);

  async function save(patch: Partial<Creator>) {
    if (!c) return;
    setSaving(true); setOk(false); setError(null);
    const { error: e } = await supabase.from('lms_creators').update(patch).eq('id', c.id);
    setSaving(false);
    if (e) { setError(e.message); return; }
    setC({ ...c, ...patch });
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  }

  if (loading || !c) return <div className="p-10 text-center text-slate-500">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-600">Your public profile and storefront preferences.</p>

      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <label className="text-sm font-medium text-slate-700">Display name</label>
          <input value={c.display_name} onChange={(e) => setC({ ...c, display_name: e.target.value })} onBlur={(e) => save({ display_name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Tagline</label>
          <input value={c.tagline ?? ''} onChange={(e) => setC({ ...c, tagline: e.target.value })} onBlur={(e) => save({ tagline: e.target.value || null })} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">About (markdown)</label>
          <div className="mt-1"><MdEditor value={c.bio_md ?? ''} onChange={(v) => save({ bio_md: v })} /></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Avatar URL</label>
            <input value={c.avatar_url ?? ''} onChange={(e) => setC({ ...c, avatar_url: e.target.value })} onBlur={(e) => save({ avatar_url: e.target.value || null })} placeholder="https://..." className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Cover URL</label>
            <input value={c.cover_url ?? ''} onChange={(e) => setC({ ...c, cover_url: e.target.value })} onBlur={(e) => save({ cover_url: e.target.value || null })} placeholder="https://..." className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Theme color (hex)</label>
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={c.theme_color || '#059669'} onChange={(e) => save({ theme_color: e.target.value })} className="w-12 h-10 rounded border border-slate-300 cursor-pointer" />
              <input value={c.theme_color ?? ''} onChange={(e) => setC({ ...c, theme_color: e.target.value })} onBlur={(e) => save({ theme_color: e.target.value || null })} placeholder="#059669" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Default payment provider</label>
            <select value={c.default_payment_provider ?? 'stripe'} onChange={(e) => save({ default_payment_provider: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="stripe">Stripe</option>
              <option value="toyyibpay">toyyibPay</option>
              <option value="billplz">Billplz</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={() => save(c)} disabled={saving}
            className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {ok && <span className="text-sm text-emerald-600">Saved ✓</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
        <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
          Storefront URL: <code className="px-1 py-0.5 bg-slate-100 rounded">lms.kuizen.fun/c/{c.slug}</code>
          {saving && <span className="ml-3 text-slate-400">Saving…</span>}
          {ok && <span className="ml-3 text-emerald-600">Saved ✓</span>}
          {error && <span className="ml-3 text-rose-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}
