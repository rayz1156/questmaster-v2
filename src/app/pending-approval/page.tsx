'use client';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AuthSplit from '@/components/ui/AuthSplit';

// Pending approval (KZ-021: dibungkus AuthSplit). Tingkah laku sign out
// dan pautan tidak berubah.
export default function Pending(){
  return (<AuthSplit>
    <div className="w-full max-w-[380px]">
      <div className="bg-white rounded-[4px] border border-hairline p-6 space-y-4 text-center shadow-card">
        <h1 className="text-[20px] font-bold tracking-tight text-ink">Awaiting admin approval</h1>
        <p className="text-sm text-ink-muted">Your educator account has been created and verified. An admin needs to approve it before you can create hunts. You'll be able to sign in once approved.</p>
        <button onClick={async()=>{ await supabase.auth.signOut(); window.location.href='/login'; }} className="btn-primary w-full">Sign out</button>
        <Link href="/login" className="block text-sm text-brand-purple font-medium">Back to sign in</Link>
      </div>
    </div>
  </AuthSplit>);
}
