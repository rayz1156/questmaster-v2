'use client';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { teks } from '@/i18n/teks';


function LoginInner() {
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
    if (error || !data.user) { setBusy(false); setErr(error?.message || teks.logMasuk.gagal); return; }
    // Ambil peranan daripada lms_profiles (autoritatif), jatuh balik ke user_metadata
    let role: string = (data.user.user_metadata?.role as string) || 'participant';
    try {
      const { data: prof } = await supabase.from('lms_profiles').select('role').eq('id', data.user.id).maybeSingle();
      if (prof?.role) role = prof.role as string;
    } catch {}
    // Pastikan sesi tersimpan sepenuhnya sebelum navigasi supaya tiada log masuk berganda
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
          <h1 className="text-4xl font-bold text-white tracking-tight">{teks.jenama.nama}</h1>
          <p className="text-white/70 mt-3 text-sm">{teks.logMasuk.aluan}</p>
        </div>
        <form onSubmit={signIn} className="bg-white rounded shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{teks.logMasuk.emel}</label>
            <input value={email} onChange={e=>{setEmail(e.target.value); setErr('');}} type="email" required className="w-full border border-slate-200 rounded px-3 py-2 focus:ring-2 focus:ring-primary outline-none" placeholder={teks.logMasuk.placeholderEmel} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{teks.logMasuk.kataLaluan}</label>
            <input value={password} onChange={e=>{setPassword(e.target.value); setErr('');}} type={show?'text':'password'} required className="w-full border border-slate-200 rounded px-3 py-2 focus:ring-2 focus:ring-primary outline-none" placeholder="••••••••" />
            <label className="flex items-center gap-2 mt-2 text-sm text-slate-600">
              <input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)} /> {teks.logMasuk.tunjukkanKataLaluan}
            </label>
          </div>
          {err && <p className="text-sm text-status-danger">{err}</p>}
          <button disabled={busy} className="w-full py-3 rounded bg-primary hover:bg-primary-hover text-white font-bold transition disabled:opacity-60 disabled:cursor-not-allowed">{busy ? teks.logMasuk.sedang : teks.logMasuk.butang}</button>
          <div className="flex justify-between text-sm">
            <Link href="/forgot-password" className="text-white/90 font-semibold hover:text-white underline-offset-2 hover:underline">{teks.logMasuk.lupa}</Link>
            <Link href="/register" className="text-white/90 font-semibold hover:text-white underline-offset-2 hover:underline">{teks.logMasuk.cipta}</Link>
          </div>
        </form>
        </div>

      <div className="text-center mt-8 space-y-1">
        <div className="text-[11px] text-white/60 uppercase tracking-widest">{teks.jenama.dikuasakanOleh}</div>
        <div className="text-sm text-white/90 font-medium">{teks.jenama.nama}</div>
      </div>
</div>
  );
}


export default function LoginPage(){ return (<Suspense fallback={null}><LoginInner/></Suspense>); }
