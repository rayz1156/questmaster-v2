'use client';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
export default function Pending(){
  return (<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600 px-6"><div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 space-y-3 text-center"><div className="text-4xl">⏳</div><h1 className="text-xl font-bold text-gray-900">Awaiting admin approval</h1><p className="text-sm text-gray-600">Your educator account has been created and verified. An admin needs to approve it before you can create hunts. You'll be able to sign in once approved.</p><button onClick={async()=>{ await supabase.auth.signOut(); window.location.href='/login'; }} className="w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-600">Sign out</button><Link href="/login" className="block text-sm text-purple-600">Back to sign in</Link></div>
      <div className="text-center mt-8 space-y-1"><div className="text-[11px] text-white/60 uppercase tracking-widest">In collaboration with</div><div className="text-sm text-white/90 font-medium">UPSI · AFK · Airiz</div><div className="text-[11px] text-white/60 mt-2">Powered by <span className="font-semibold text-white/80">Airiz Intelligence</span></div></div>
</div>);
}
