'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { teks } from '@/i18n/teks';
export default function Forgot(){
  const [email,setEmail]=useState(''); const [busy,setBusy]=useState(false); const [err,setErr]=useState(''); const [done,setDone]=useState(false);
  async function submit(e: React.FormEvent){ e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false); if (error){ setErr(error.message); return; } setDone(true);
  }
  return (<div className="min-h-screen flex flex-col bg-primary px-6 py-10"><div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto"><div className="text-center mb-8"><div className="text-4xl mb-2">🔑</div><h1 className="text-3xl font-bold text-white">{teks.lupaKataLaluan.tajuk}</h1><p className="text-white/80 mt-1">{teks.lupaKataLaluan.subtajuk}</p></div>
  {done? <div className="bg-white rounded shadow-xl p-6 space-y-3"><h2 className="text-xl font-bold">{teks.lupaKataLaluan.semak}</h2><p className="text-sm text-slate-600">{teks.lupaKataLaluan.dihantarAwal}<b>{email}</b>{teks.lupaKataLaluan.dihantarAkhir}</p><Link href="/login" className="block text-center w-full py-3 rounded text-white font-semibold bg-primary hover:bg-primary-hover transition">{teks.lupaKataLaluan.kembali}</Link></div>
   :<form onSubmit={submit} className="bg-white rounded shadow-xl p-6 space-y-4"><div><label className="block text-sm font-medium text-slate-700 mb-1">{teks.lupaKataLaluan.emel}</label><input type="email" value={email} onChange={e=>{setEmail(e.target.value); setErr('');}} required className="w-full border border-slate-200 rounded px-3 py-2" placeholder={teks.lupaKataLaluan.placeholderEmel}/></div>{err&&<p className="text-sm text-status-danger">{err}</p>}<button disabled={busy} className="w-full py-3 rounded text-white font-semibold bg-primary hover:bg-primary-hover transition disabled:opacity-60">{busy?teks.lupaKataLaluan.menghantar:teks.lupaKataLaluan.butang}</button><p className="text-sm text-center text-slate-600"><Link href="/login" className="text-primary font-medium">{teks.lupaKataLaluan.kembali}</Link></p></form>}
  </div>
      <div className="text-center mt-8 space-y-1"><div className="text-[11px] text-white/60 uppercase tracking-widest">{teks.jenama.dikuasakanOleh}</div><div className="text-sm text-white/90 font-medium">{teks.jenama.nama}</div></div>
</div>);
}
