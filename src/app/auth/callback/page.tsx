'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
export default function Callback(){
  const router = useRouter();
  const [msg,setMsg]=useState('Verifying…');
  useEffect(()=>{(async()=>{
    const { data } = await supabase.auth.getSession();
    if (!data.session){ setMsg('No session. Please sign in.'); setTimeout(()=>router.replace('/login'), 2000); return; }
    const role = (data.session.user.user_metadata as Record<string,unknown>).role as string || 'participant';
    if (role==='admin' || role==='superadmin') router.replace('/admin/overview');
    else if (role==='educator') router.replace('/educator/activities');
    else router.replace('/participant/home');
  })()},[router]);
  return (<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600 text-white"><div className="text-center"><div className="text-4xl mb-3">✨</div><p>{msg}</p></div></div>);
}
