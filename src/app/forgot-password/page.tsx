'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
// Forgot password (KZ-021: dibungkus AuthSplit). Tingkah laku tidak berubah.
import AuthSplit from '@/components/ui/AuthSplit';
export default function Forgot(){
  const [email,setEmail]=useState(''); const [busy,setBusy]=useState(false); const [err,setErr]=useState(''); const [done,setDone]=useState(false);
  async function submit(e: React.FormEvent){ e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false); if (error){ setErr(error.message); return; } setDone(true);
  }
  return (<AuthSplit>
    <div className="w-full max-w-[380px]">
      <div className="text-center mb-8">
        <h1 className="text-[20px] font-bold tracking-tight text-ink">Forgot password?</h1>
        <p className="text-[14px] text-ink-muted mt-1">We&#39;ll email you a reset link</p>
      </div>
  {done? <div className="bg-white rounded-[4px] border border-hairline p-6 space-y-3 shadow-card"><h2 className="text-[16px] font-bold text-ink">Check your email</h2><p className="text-sm text-ink-muted">Reset link sent to <b>{email}</b>.</p><Link href="/login" className="btn-primary w-full mt-2">Back to sign in</Link></div>
   :<form onSubmit={submit} className="bg-white rounded-[4px] border border-hairline p-6 space-y-4 shadow-card"><div><label className="block text-sm font-medium text-ink mb-1.5" htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="input" placeholder="you@example.com"/></div>{err&&<p className="text-sm text-kz-down">{err}</p>}<button disabled={busy} className="btn-primary w-full">{busy?'Sending…':'Send reset link'}</button><p className="text-sm text-center text-ink-muted"><Link href="/login" className="text-brand-purple font-medium">Back to sign in</Link></p></form>}
    </div>
  </AuthSplit>);
}
