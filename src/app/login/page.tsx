'use client';
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
    // Read role + approved from qm_profiles (RLS allows self select)
    const { data: prof } = await supabase.from('qm_profiles').select('role, approved').eq('id', data.user.id).maybeSingle();
    const role = (prof?.role as string) || (data.user.user_metadata?.role as string) || 'participant';
    if (role === 'educator' && prof && prof.approved === false) {
      setBusy(false);
      router.replace('/pending-approval');
      return;
    }
    // Ensure session is fully cached before navigation to avoid double-login
    try { await supabase.auth.getUser(); } catch {}
    setBusy(false);
    const nextParam = searchParams?.get('next');
    const isSafeNext = !!nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//');
    const defaultDest = role === 'educator' ? '/educator/classes' : (role === 'admin' || role === 'superadmin') ? '/admin/overview' : '/participant/home';
    const dest = isSafeNext ? nextParam : defaultDest;
    window.location.href = dest;
  }


  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-600 to-blue-600 px-6 py-10">
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm shadow-lg mb-3 text-3xl" aria-hidden="true">📚</div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Kuizen</h1>
          <p className="text-white/90 mt-2 text-base font-medium tracking-wide">Learn. Compete. Conquer.</p>
          <p className="text-white/75 mt-1 text-sm">Where classrooms become arenas and learners become champions.</p>
          <p className="text-white/70 mt-3 text-sm">Welcome back 👋 Sign in to continue</p>
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
          <button disabled={busy} className="w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-600 disabled:opacity-60">{busy ? 'Signing in…' : 'Sign In'}</button>
          <div className="flex justify-between text-sm">
            <Link href="/forgot-password" className="text-purple-600 font-medium">Forgot password?</Link>
            <Link href="/register" className="text-purple-600 font-medium">Create account</Link>
          </div>
        </form>
        </div>
    
      <div className="text-center mt-8 space-y-1">
        <div className="text-[11px] text-white/60 uppercase tracking-widest">In collaboration with</div>
        <div className="text-sm text-white/90 font-medium">UPSI · AFK · Veltrix</div>
        <div className="text-[11px] text-white/60 mt-2">Powered by <span className="font-semibold text-white/80">Veltrix Technology</span></div>
      </div>
</div>
  );
}


export default function LoginPage(){ return (<Suspense fallback={null}><LoginInner/></Suspense>); }
