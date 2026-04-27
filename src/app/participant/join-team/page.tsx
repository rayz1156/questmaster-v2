"use client";
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { joinTeamByCode, getTeamByCode } from '@/lib/data';
import { getSession } from '@/lib/session';

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get('code') || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [ok, setOk] = useState<string|null>(null);
  const [preview, setPreview] = useState<{ name: string } | null>(null);

  useEffect(() => { if (!getSession()) router.replace(`/login?next=/participant/join-team${code?`?code=${code}`:''}`); }, []);

  async function lookup(c: string) {
    setErr(null); setPreview(null);
    if (c.length < 4) return;
    try { const t = await getTeamByCode(c); setPreview(t ? { name: (t as any).name } : null); }
    catch { /* ignore */ }
  }

  useEffect(() => { if (code) lookup(code.trim().toUpperCase()); }, [code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setOk(null); setBusy(true);
    try {
      await joinTeamByCode(code);
      setOk('Joined team! Redirecting...');
      setTimeout(() => router.replace('/participant/home'), 800);
    } catch (e: any) { setErr(e.message || 'Failed to join'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-3">
      <h1 className="font-bold text-lg">Join a team</h1>
      <p className="text-xs text-gray-500">Enter the team code given by your educator. You must already be enrolled in the team's class.</p>
      <input className="input w-full text-center font-mono text-lg uppercase tracking-widest" placeholder="ABCD1234" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required maxLength={16} />
      {preview && <div className="text-xs text-gray-700">Team: <span className="font-semibold">{preview.name}</span></div>}
      <button disabled={busy} className="btn-primary w-full py-2">{busy ? 'Joining...' : 'Join team'}</button>
      {err && <div className="text-xs text-red-600">{err}</div>}
      {ok && <div className="text-xs text-green-700">{ok}</div>}
      <div className="text-xs text-gray-500">Need to join a class first? <a href="/participant/join" className="underline">Join a class</a></div>
    </form>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Suspense fallback={<div className="card w-full max-w-sm">Loading...</div>}><Inner/></Suspense>
    </div>
  );
}
