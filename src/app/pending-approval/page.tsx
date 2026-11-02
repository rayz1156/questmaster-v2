'use client';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AuthSplit from '@/components/ui/AuthSplit';
import { useBahasa } from '@/lib/i18n/BahasaProvider';

// Pending approval (KZ-021: dibungkus AuthSplit). Tingkah laku sign out
// dan pautan tidak berubah. Semua teks UI melalui useBahasa() (KZ-040).
export default function Pending(){
  const { t } = useBahasa();
  return (<AuthSplit>
    <div className="w-full max-w-[380px]">
      <div className="bg-white rounded-[4px] border border-hairline p-6 space-y-4 text-center shadow-card">
        <h1 className="text-[20px] font-bold tracking-tight text-ink">{t('auth.awaitingApproval')}</h1>
        <p className="text-sm text-ink-muted">{t('auth.awaitingBody')}</p>
        <button onClick={async()=>{ await supabase.auth.signOut(); window.location.href='/login'; }} className="btn-primary w-full">{t('common.signOut')}</button>
        <Link href="/login" className="block text-sm text-brand-purple font-medium">{t('common.backToSignIn')}</Link>
      </div>
    </div>
  </AuthSplit>);
}
