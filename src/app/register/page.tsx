'use client';

/**
 * Create account, semakan September 2026. Lihat skrin log masuk untuk
 * pasangannya; kedua-duanya sengaja kelihatan sama.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';
import GoogleButton from '@/components/GoogleButton';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'participant' | 'educator'>('participant');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectTo, data: { name, display_name: name, role } },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (role === 'educator') {
      fetch('/api/notify-educator-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      }).catch(() => {});
    }
    setDone(true);
  }

  async function resendVerification() {
    if (!email) { setResendMsg('Please enter your email above first.'); return; }
    setResending(true); setResendMsg('');
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
    setResending(false);
    setResendMsg(error
      ? (error.message || 'Could not resend. Try again later.')
      : 'Verification email sent again. Please check your inbox, and your spam folder.');
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FCFBF9' }}>
      <div className="px-8 pt-7">
        <Logo size={30} />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">
          <div className="text-center mb-8">
            <h1 className="text-[40px] leading-[1.1] font-semibold tracking-tight text-ink">
              {done ? 'Check your email.' : 'Start here.'}
            </h1>
            <p className="text-[17px] text-ink-muted mt-2">
              {done ? `We sent a verification link to ${email}.` : 'One account for every class you teach or join.'}
            </p>
          </div>

          {done ? (
            <div className="bg-white rounded-2xl border border-hairline p-6">
              <p className="text-sm text-ink-muted">
                Open the link to confirm your account, then sign in. If it is not there in a minute, check your spam folder.
              </p>
              {role === 'educator' && (
                <p className="text-sm text-[#8A6100] bg-[#FEF6E7] rounded-xl px-3.5 py-2.5 mt-4">
                  Educator accounts are approved by an admin after verification.
                </p>
              )}
              <button
                type="button"
                onClick={resendVerification}
                disabled={resending}
                className="btn-quiet text-brand-purple mt-4 disabled:opacity-50"
              >
                {resending ? 'Sending…' : 'Resend verification email'}
              </button>
              {resendMsg && <p className="text-sm text-ink-muted mt-2">{resendMsg}</p>}
              <Link href="/login" className="btn-primary w-full mt-5">Back to sign in</Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-hairline p-6">
              <GoogleButton role={role} className="mb-5 empty:hidden" label="Sign up with Google" />

              <form onSubmit={submit}>
                <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="name">Display name</label>
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="input mb-4"
                  placeholder="Jane Doe"
                />

                <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="email">Email</label>
                <input
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                  className="input mb-4"
                  placeholder="you@example.com"
                />

                <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="password">Password</label>
                <div className="relative mb-4">
                  <input
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={show ? 'text' : 'password'}
                    minLength={8}
                    required
                    autoComplete="new-password"
                    className="input pr-11"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition"
                  >
                    {show ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>

                <div className="text-sm font-medium text-ink mb-1.5">I am a</div>
                <div className="inline-flex rounded-xl border border-hairline overflow-hidden text-sm mb-1">
                  <button
                    type="button"
                    onClick={() => setRole('participant')}
                    className={`px-4 py-2 font-medium transition ${role === 'participant' ? 'bg-[#F4F2FD] text-brand-purple' : 'text-ink-muted hover:text-ink'}`}
                  >
                    Participant
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('educator')}
                    className={`px-4 py-2 font-medium transition border-l border-hairline ${role === 'educator' ? 'bg-[#F4F2FD] text-brand-purple' : 'text-ink-muted hover:text-ink'}`}
                  >
                    Educator
                  </button>
                </div>
                <p className="text-xs text-ink-faint mb-5">
                  {role === 'educator'
                    ? 'Educator accounts are approved by an admin before you can create classes.'
                    : 'Join classes with a code from your educator.'}
                </p>

                {err && <p className="text-sm text-[#C0392B] mb-3">{err}</p>}

                <button disabled={busy} className="btn-primary w-full py-3">
                  {busy ? 'Creating…' : 'Create account'}
                </button>
              </form>

              <p className="mt-5 text-sm text-center text-ink-muted">
                Already have an account?{' '}
                <Link href="/login" className="text-brand-purple font-medium hover:underline">Sign in</Link>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="pb-8 text-center text-xs text-ink-faint tracking-wide">
        UPSI &nbsp;·&nbsp; AFK &nbsp;·&nbsp; Veltrix
      </div>
    </div>
  );
}
