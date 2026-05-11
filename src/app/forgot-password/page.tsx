'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
export default function Forgot(){
  const [email,setEmail]=useState(''); const [busy,setBusy]=useState(false); const [err,setErr]=useState(''); const [done,setDone]=useState(false);
  async function submit(e: React.FormEvent){ e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false); if (error){ setErr(error.message); return; } setDone(true);
  }
  return (<div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-600 to-blue-600 px-6 py-10"><div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto"><div className="text-center mb-8"><div className="text-4xl mb-2">🔑</div><h1 className="text-3xl font-bold text-white">Forgot password?</h1><p className="text-white/80 mt-1">We'll email you a reset link</p></div>
  {done? <div className="bg-white rounded-2xl shadow-xl p-6 space-y-3"><h2 className="text-xl font-bold">Check your email</h2><p className="text-sm text-gray-600">Reset link sent to <b>{email}</b>.</p><Link href="/login" className="block text-center w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-600">Back to sign in</Link></div>
   :<form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-6 space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="w-full border border-gray-200 rounded-xl px-3 py-2" placeholder="you@example.com"/></div>{err&&<p className="text-sm text-red-600">{err}</p>}<button disabled={busy} className="w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-600 disabled:opacity-60">{busy?'Sending…':'Send reset link'}</button><p className="text-sm text-center text-gray-600"><Link href="/login" className="text-purple-600 font-medium">Back to sign in</Link></p></form>}
  </div>
      <div className="text-center mt-8 space-y-1"><div className="text-[11px] text-white/60 uppercase tracking-widest">In collaboration with</div><div className="text-sm text-white/90 font-medium">UPSI · AFK · Veltrix</div><div className="text-[11px] text-white/60 mt-2">Powered by <span className="font-semibold text-white/80">Veltrix Technology</span></div></div>
</div>);
}
