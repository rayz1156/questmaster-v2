'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
// Forgot password (KZ-021: dibungkus AuthSplit). Tingkah laku tidak berubah.
// Semua teks UI melalui useBahasa() (KZ-040).
import AuthSplit from '@/components/ui/AuthSplit';
import PemilihBahasa from '@/components/PemilihBahasa';
import { useBahasa } from '@/lib/i18n/BahasaProvider';
export default function Forgot(){
  const { t } = useBahasa();
  const [email,setEmail]=useState(''); const [busy,setBusy]=useState(false); const [err,setErr]=useState(''); const [done,setDone]=useState(false);
  async function submit(e: React.FormEvent){ e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false); if (error){ setErr(error.message); return; } setDone(true);
  }
  return (<AuthSplit penjuru={<PemilihBahasa />}>
    <div className="w-full max-w-[380px]">
      <div className="text-center mb-8">
        <h1 className="text-[20px] font-bold tracking-tight text-ink">{t('auth.forgotTitle')}</h1>
        <p className="text-[14px] text-ink-muted mt-1">{t('auth.forgotSubtitle')}</p>
      </div>
  {done? <div className="bg-white rounded-[4px] border border-hairline p-6 space-y-3 shadow-card"><h2 className="text-[16px] font-bold text-ink">{t('auth.checkEmail')}</h2><p className="text-sm text-ink-muted">{t('auth.resetLinkSentTo', { emel: email })}</p><Link href="/login" className="btn-primary w-full mt-2">{t('common.backToSignIn')}</Link></div>
   :<form onSubmit={submit} className="bg-white rounded-[4px] border border-hairline p-6 space-y-4 shadow-card"><div><label className="block text-sm font-medium text-ink mb-1.5" htmlFor="email">{t('auth.email')}</label><input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="input" placeholder={t('auth.emailPlaceholder')}/></div>{err&&<p className="text-sm text-kz-down">{err}</p>}<button disabled={busy} className="btn-primary w-full">{busy?t('auth.sending'):t('auth.sendResetLink')}</button><p className="text-sm text-center text-ink-muted"><Link href="/login" className="text-brand-purple font-medium">{t('common.backToSignIn')}</Link></p></form>}
    </div>
  </AuthSplit>);
}