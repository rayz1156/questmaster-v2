'use client';
export const dynamic='force-dynamic';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { teks } from '@/i18n/teks';
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
        if(th){const r=await supabase.auth.verifyOtp({token_hash:th,type});if(r.error){setErr(teks.tetapSemula.pautanTidakSah);return;}setReady(true);return;}
        if(code){const r=await supabase.auth.exchangeCodeForSession(code);if(r.error){setErr(teks.tetapSemula.pautanTidakSah);return;}setReady(true);return;}
        if(typeof window!=='undefined'&&window.location.hash.includes('access_token')){const sub=supabase.auth.onAuthStateChange((e)=>{if(e==='PASSWORD_RECOVERY'||e==='SIGNED_IN')setReady(true);});unsub=sub.data.subscription;const s=await supabase.auth.getSession();if(s.data.session)setReady(true);return;}
        const s=await supabase.auth.getSession();if(s.data.session){setReady(true);return;}
        setErr(teks.tetapSemula.tiadaToken);
      }catch(e:any){setErr(e.message||teks.tetapSemula.pengesahanGagal);}
    })();
    return ()=>{if(unsub)unsub.unsubscribe();};
  },[params]);
  async function submit(e: React.FormEvent){ e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false); if (error){ setErr(error.message); return; } setDone(true);
    setTimeout(()=> router.replace('/login'), 2500);
  }
  return (<div className="min-h-screen flex flex-col bg-primary px-6 py-10"><div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto"><div className="text-center mb-8"><div className="text-4xl mb-2">🔐</div><h1 className="text-3xl font-bold text-white">{teks.tetapSemula.tajuk}</h1></div>
  {done?<div className="bg-white rounded shadow-xl p-6 space-y-3"><h2 className="text-xl font-bold">{teks.tetapSemula.dikemasKini}</h2><p className="text-sm text-slate-600">{teks.tetapSemula.mengubahHala}</p></div>:
   <form onSubmit={submit} className="bg-white rounded shadow-xl p-6 space-y-4">{!ready && <p className="text-sm text-amber-700">{teks.tetapSemula.sedangMengesahkan}</p>}<div><label className="block text-sm font-medium text-slate-700 mb-1">{teks.tetapSemula.kataLaluanBaharu}</label><input type="password" minLength={8} value={password} onChange={e=>{setPassword(e.target.value); setErr('');}} required className="w-full border border-slate-200 rounded px-3 py-2" placeholder={teks.tetapSemula.placeholderKataLaluan}/></div>{err&&<p className="text-sm text-status-danger">{err}</p>}<button disabled={busy||!ready} className="w-full py-3 rounded text-white font-semibold bg-primary hover:bg-primary-hover transition disabled:opacity-60">{busy?teks.tetapSemula.menyimpan:teks.tetapSemula.butang}</button><p className="text-sm text-center text-slate-600"><Link href="/forgot-password" className="text-primary font-medium">{teks.tetapSemula.mintaBaharu}</Link></p></form>}
  </div></div>);
}

export default function Reset(){ return <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white bg-primary">{teks.tetapSemula.memuatkan}</div>}><ResetInner/></Suspense>; }
