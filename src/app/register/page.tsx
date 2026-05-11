'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function Register() {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [role,setRole]=useState<'participant'|'educator'>('participant');
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const [done,setDone]=useState(false);

  async function submit(e: React.FormEvent){
    e.preventDefault();
    setBusy(true); setErr('');
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectTo, data: { name, display_name: name, role } },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    // Notify admin if a new educator registered (fire-and-forget; non-blocking)
    if (role === 'educator') {
      fetch('/api/notify-educator-pending', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name }) }).catch(() => {});
    }
    setDone(true);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-600 to-blue-600 px-6 py-10">
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm shadow-lg mb-3 text-3xl" aria-hidden="true">📚</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Create your account</h1>
          <p className="text-white/80 mt-1">Join Kuizen as a participant or educator</p>
        </div>
        {done ? (
          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-3">
            <h2 className="text-xl font-bold text-gray-900">Check your email ✉️</h2>
            <p className="text-sm text-gray-600">We sent a verification link to <b>{email}</b>. Click it to confirm your account, then sign in.</p>
            {role==='educator' && <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">After verifying, an admin will need to approve your educator account before you can create hunts.</p>}
            <Link className="block text-center w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-600" href="/login">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
              <input value={name} onChange={e=>setName(e.target.value)} required className="w-full border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none" placeholder="Jane Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="w-full border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none" placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required className="w-full border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-purple-500 outline-none" placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">I am a…</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={()=>setRole('participant')} className={`py-2 rounded-xl border ${role==='participant'?'bg-purple-600 text-white border-purple-600':'bg-white text-gray-700 border-gray-200'}`}>Participant</button>
                <button type="button" onClick={()=>setRole('educator')} className={`py-2 rounded-xl border ${role==='educator'?'bg-purple-600 text-white border-purple-600':'bg-white text-gray-700 border-gray-200'}`}>Educator</button>
              </div>
              {role==='educator' && <p className="text-xs text-amber-700 mt-2">Educator accounts require admin approval after email verification.</p>}
            </div>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button disabled={busy} className="w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-600 disabled:opacity-60">{busy?'Creating…':'Create account'}</button>
            <p className="text-sm text-center text-gray-600">Already have an account? <Link href="/login" className="text-purple-600 font-medium">Sign in</Link></p>
          </form>
        )}
      </div>
    
      <div className="text-center mt-8 space-y-1">
        <div className="text-[11px] text-white/60 uppercase tracking-widest">In collaboration with</div>
        <div className="text-sm text-white/90 font-medium">UPSI · AFK · Airiz</div>
        <div className="text-[11px] text-white/60 mt-2">Powered by <span className="font-semibold text-white/80">Airiz Intelligence</span></div>
      </div>
</div>
  );
}
