'use client';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function Register() {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [role,setRole]=useState<'participant'|'creator'>('participant');
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const [done,setDone]=useState(false);

  async function submit(e: React.FormEvent){
    e.preventDefault();
    setBusy(true); setErr('');
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectTo, data: { name, display_name: name, role } },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
  }

  return (
    <div className="min-h-screen flex flex-col bg-primary px-6 py-10">
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded bg-white/15 backdrop-blur-sm shadow-lg mb-3" aria-hidden="true"><KuizenAcademyLogo variant="mark" color="mono-light" height={48} /></div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Cipta akaun anda</h1>
          <p className="text-white/80 mt-1">Sertai StafKita Akademi sebagai peserta atau pencipta</p>
        </div>
        {done ? (
          <div className="bg-white rounded shadow-xl p-6 space-y-3">
            <h2 className="text-xl font-bold text-slate-900">Semak e-mel anda ✉️</h2>
            <p className="text-sm text-slate-600">Kami telah menghantar pautan pengesahan ke <b>{email}</b>. Klik pautan tersebut untuk mengesahkan akaun anda, kemudian log masuk.</p>
            <Link className="block text-center w-full py-3 rounded text-white font-semibold bg-primary hover:bg-primary-hover transition" href="/login">Kembali untuk log masuk</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded shadow-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama paparan</label>
              <input value={name} onChange={e=>{setName(e.target.value); setErr('');}} required className="w-full border border-slate-200 rounded px-3 py-2 focus:ring-2 focus:ring-primary outline-none" placeholder="Nama anda" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">E-mel</label>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value); setErr('');}} required className="w-full border border-slate-200 rounded px-3 py-2 focus:ring-2 focus:ring-primary outline-none" placeholder="anda@contoh.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kata laluan</label>
              <input type="password" minLength={8} value={password} onChange={e=>{setPassword(e.target.value); setErr('');}} required className="w-full border border-slate-200 rounded px-3 py-2 focus:ring-2 focus:ring-primary outline-none" placeholder="Sekurang-kurangnya 8 aksara" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Saya ialah…</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={()=>setRole('participant')} className={`py-2 rounded border ${role==='participant'?'bg-primary text-white border-primary':'bg-white text-slate-700 border-slate-200'}`}>Peserta</button>
                <button type="button" onClick={()=>setRole('creator')} className={`py-2 rounded border ${role==='creator'?'bg-primary text-white border-primary':'bg-white text-slate-700 border-slate-200'}`}>Pencipta</button>
              </div>
            </div>
            {err && <p className="text-sm text-status-danger">{err}</p>}
            <button disabled={busy} className="w-full py-3 rounded text-white font-semibold bg-primary hover:bg-primary-hover transition disabled:opacity-60">{busy?'Mencipta…':'Cipta akaun'}</button>
            <p className="text-sm text-center text-slate-600">Sudah ada akaun? <Link href="/login" className="text-primary font-medium">Log masuk</Link></p>
          </form>
        )}
      </div>
    
      <div className="text-center mt-8 space-y-1">
        <div className="text-[11px] text-white/60 uppercase tracking-widest">Dikuasakan oleh</div>
        <div className="text-sm text-white/90 font-medium">StafKita Akademi</div>
      </div>
</div>
  );
}
