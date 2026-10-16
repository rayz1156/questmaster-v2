'use client';
export const dynamic='force-dynamic';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AuthSplit from '@/components/ui/AuthSplit';

// Reset password (KZ-021: dibungkus AuthSplit). Tingkah laku pengesahan
// token dan kemaskini kata laluan tidak berubah.
function ResetInner(){
  const router = useRouter();
  const [ready,setReady]=useState(false);
  const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [err,setErr]=useState(''); const [done,setDone]=useState(false);
  const params = useSearchParams();
  useEffect(()=>{
    let unsub:any;
    (async()=>{
      try{
        const th=params.get('token_hash');
        const code=params.get('code');
        const type=(params.get('type')||'recovery') as any;
        if(th){const r=await supabase.auth.verifyOtp({token_hash:th,type});if(r.error){setErr('Link invalid or expired. Request a new one.');return;}setReady(true);return;}
        if(code){const r=await supabase.auth.exchangeCodeForSession(code);if(r.error){setErr('Link invalid or expired. Request a new one.');return;}setReady(true);return;}
        if(typeof window!=='undefined'&&window.location.hash.includes('access_token')){const sub=supabase.auth.onAuthStateChange((e)=>{if(e==='PASSWORD_RECOVERY'||e==='SIGNED_IN')setReady(true);});unsub=sub.data.subscription;const s=await supabase.auth.getSession();if(s.data.session)setReady(true);return;}
        const s=await supabase.auth.getSession();if(s.data.session){setReady(true);return;}
        setErr('No reset token in URL. Request a new link.');
      }catch(e:any){setErr(e.message||'Validation failed');}
    })();
    return ()=>{if(unsub)unsub.unsubscribe();};
  },[params]);
  async function submit(e: React.FormEvent){ e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false); if (error){ setErr(error.message); return; } setDone(true);
    setTimeout(()=> router.replace('/login'), 2500);
  }
  return (<AuthSplit>
    <div className="w-full max-w-[380px]">
      <div className="text-center mb-8">
        <h1 className="text-[20px] font-bold tracking-tight text-ink">Set new password</h1>
      </div>
      {done?
        <div className="bg-white rounded-[4px] border border-hairline p-6 space-y-3 shadow-card">
          <h2 className="text-[16px] font-bold text-ink">Password updated</h2>
          <p className="text-sm text-ink-muted">Redirecting to sign in…</p>
        </div>
        :
        <form onSubmit={submit} className="bg-white rounded-[4px] border border-hairline p-6 space-y-4 shadow-card">
          {!ready && <p className="text-sm text-[#8A6100] bg-[#FEF6E7] rounded-[4px] px-3.5 py-2.5">Validating reset link… If this stays, request a new link.</p>}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="password">New password</label>
            <input id="password" type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required className="input" placeholder="At least 8 characters"/>
          </div>
          {err&&<p className="text-sm text-kz-down">{err}</p>}
          <button disabled={busy||!ready} className="btn-primary w-full disabled:opacity-60">{busy?'Saving…':'Update password'}</button>
          <p className="text-sm text-center text-ink-muted"><Link href="/forgot-password" className="text-brand-purple font-medium">Request new link</Link></p>
        </form>}
    </div>
  </AuthSplit>);
}

export default function Reset(){ return <Suspense fallback={<AuthSplit><div className="w-full max-w-[380px] text-center text-sm text-ink-muted">Loading...</div></AuthSplit>}><ResetInner/></Suspense>; }
