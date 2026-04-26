'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const DEMO = {
  participant: { email: 'participant@quest.local', label: 'Participant' },
  educator:    { email: 'educator@quest.local',    label: 'Educator' },
  admin:       { email: 'admin@quest.local',       label: 'Admin' },
} as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signIn(e?: React.FormEvent, override?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true); setErr(null);
    const creds = override ?? { email, password };
    const { data, error } = await supabase.auth.signInWithPassword(creds);
    setBusy(false);
    if (error || !data.user) { setErr(error?.message || 'Sign-in failed'); return; }
    const role = (data.user.user_metadata?.role as string) || 'participant';
    router.replace(`/${role}/home`);
  }

  function quick(role: keyof typeof DEMO) {
    signIn(undefined, { email: DEMO[role].email, password: 'Quest1234' });
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-600 to-blue-600 px-6 py-10">
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🗺️</div>
          <h1 className="text-3xl font-bold text-white">Welcome back 👋</h1>
          <p className="text-white/80 mt-1">Sign in to your account to continue</p>
        </div>
        <form onSubmit={signIn} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required className="w-full border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input value={password} onChange={e=>setPassword(e.target.value)} type={show?'text':'password'} required className="w-full border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none" placeholder="••••••••" />
            <label className="flex items-center gap-2 mt-2 text-sm text-gray-600">
              <input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)} /> Show password
            </label>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button disabled={busy} className="w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-600 disabled:opacity-60">
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <div className="mt-6 text-center text-white/80 text-xs tracking-widest">QUICK DEMO LOGIN</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(Object.keys(DEMO) as (keyof typeof DEMO)[]).map(k => (
            <button key={k} onClick={()=>quick(k)} disabled={busy} className="bg-white/15 hover:bg-white/25 text-white rounded-xl py-2 text-sm font-medium disabled:opacity-60">{DEMO[k].label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
