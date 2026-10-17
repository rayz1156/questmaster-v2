'use client';
import Image from 'next/image';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';


function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function signIn(e: React.FormEvent | undefined, override?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true); setErr('');
    const creds = override ?? { email, password };
    const { data, error } = await supabase.auth.signInWithPassword(creds);
    if (error || !data.user) { setBusy(false); setErr(error?.message || 'Sign-in failed'); return; }
    // Fetch role from lms_profiles (authoritative), fall back to user_metadata
    let role: string = (data.user.user_metadata?.role as string) || 'participant';
    try {
      const { data: prof } = await supabase.from('lms_profiles').select('role').eq('id', data.user.id).maybeSingle();
      if (prof?.role) role = prof.role as string;
    } catch {}
    // Ensure session is fully cached before navigation to avoid double-login
    try { await supabase.auth.getUser(); } catch {}
    setBusy(false);
    const nextParam = searchParams?.get('next');
    const isSafeNext = !!nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//');
    const defaultDest = (role === 'creator' || role === 'educator' || role === 'admin' || role === 'superadmin') ? '/creator' : '/home';
    const dest = isSafeNext ? nextParam : defaultDest;
    window.location.href = dest;
  }


  return (
    <div className="min-h-screen flex flex-col bg-academy-gradient px-6 py-10">
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="text-center mb-8">
          <div className="mb-3 flex justify-center"><KuizenAcademyLogo variant="mark" height={72} color="mono-light"/></div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Kuizen Academy</h1>
          
          
          <p className="text-white/70 mt-3 text-sm">Welcome back 👋 Sign in to continue</p>
        </div>
        <form onSubmit={signIn} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input value={email} onChange={e=>{setEmail(e.target.value); setErr('');}} type="email" required className="w-full border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input value={password} onChange={e=>{setPassword(e.target.value); setErr('');}} type={show?'text':'password'} required className="w-full border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="••••••••" />
            <label className="flex items-center gap-2 mt-2 text-sm text-gray-600">
              <input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)} /> Show password
            </label>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button disabled={busy} className="w-full py-3 rounded-xl bg-gold-500 hover:bg-gold-600 text-veltrix-900 font-bold shadow-lg shadow-gold-500/30 transition disabled:opacity-60 disabled:cursor-not-allowed">{busy ? 'Signing in…' : 'Sign In'}</button>
          <div className="flex justify-between text-sm">
            <Link href="/forgot-password" className="text-white/90 font-semibold hover:text-white underline-offset-2 hover:underline">Forgot password?</Link>
            <Link href="/register" className="text-white/90 font-semibold hover:text-white underline-offset-2 hover:underline">Create account</Link>
          </div>
        </form>
        </div>
    
      <div className="text-center mt-8 space-y-1">
        <div className="text-[11px] text-white/60 uppercase tracking-widest">Powered by</div>
        <div className="text-sm text-white/90 font-medium">Kuizen Academy</div>
        <div className="text-[11px] text-white/60 mt-2"><span className="font-semibold text-white/80">A Veltrix Technology Center Product</span></div>
      </div>
</div>
  );
}


export default function LoginPage(){ return (<Suspense fallback={null}><LoginInner/></Suspense>); }
