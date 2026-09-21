'use client';

/**
 * Sign in, semakan September 2026.
 *
 * Yang dibuang: gradien ungu ke biru penuh skrin, logo 80px, tiga baris
 * slogan pemasaran, dan nota kerjasama yang lebih besar daripada borang.
 * Orang yang datang ke skrin ini mahu masuk; mereka sudah tahu apa itu
 * Kuizen. Yang tinggal ialah nama, satu ayat, dan borang.
 *
 * Semua kelakuan dikekalkan: emel diingati, tunjuk kata laluan, hantar
 * semula emel pengesahan, penghalaan ikut peranan, dan parameter next.
 */

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { supabase, setRememberMe } from '@/lib/supabase';
import Logo from '@/components/Logo';
import GoogleButton from '@/components/GoogleButton';

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [remember, setRemember] = useState(true);

  // Prefill the last remembered email + restore the checkbox preference.
  useEffect(() => {
    try {
      const savedEmail = window.localStorage.getItem('qm-remembered-email');
      if (savedEmail) setEmail(savedEmail);
      if (window.localStorage.getItem('qm-remember') === '0') setRemember(false);
    } catch { /* ignore */ }
  }, []);

  async function signIn(e: React.FormEvent | undefined, override?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true); setErr('');
    const creds = override ?? { email, password };
    setRememberMe(remember);
    try {
      if (remember) window.localStorage.setItem('qm-remembered-email', creds.email);
      else window.localStorage.removeItem('qm-remembered-email');
    } catch { /* ignore */ }
    const { data, error } = await supabase.auth.signInWithPassword(creds);
    if (error || !data.user) {
      setBusy(false);
      const m = error?.message || 'Sign-in failed';
      setErr(m);
      setNeedsVerify(/confirm|verif/i.test(m));
      return;
    }
    const { data: prof } = await supabase.from('qm_profiles').select('role, approved').eq('id', data.user.id).maybeSingle();
    const role = (prof?.role as string) || (data.user.user_metadata?.role as string) || 'participant';
    if (role === 'educator' && prof && prof.approved === false) {
      setBusy(false);
      router.replace('/pending-approval');
      return;
    }
    try { await supabase.auth.getUser(); } catch {}
    setBusy(false);
    const nextParam = searchParams?.get('next');
    const isSafeNext = !!nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//');
    const defaultDest = role === 'educator'
      ? '/educator/classes'
      : (role === 'admin' || role === 'superadmin') ? '/admin/overview' : '/participant/home';
    window.location.href = isSafeNext ? nextParam : defaultDest;
  }

  async function resendVerification() {
    if (!email) { setResendMsg('Please enter your email above first.'); return; }
    setResending(true); setResendMsg('');
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
    setResending(false);
    setResendMsg(error
      ? (error.message || 'Could not resend. Try again later.')
      : 'Verification email sent. Please check your inbox, and your spam folder.');
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FCFBF9' }}>
      <div className="px-8 pt-7">
        <Logo size={30} />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">
          <div className="text-center mb-8">
            <h1 className="text-[40px] leading-[1.1] font-semibold tracking-tight text-ink">Welcome back.</h1>
            <p className="text-[17px] text-ink-muted mt-2">Your next great class starts here.</p>
          </div>

          <div className="bg-white rounded-2xl border border-hairline p-6">
            <GoogleButton next={searchParams?.get('next') || undefined} className="mb-5 empty:hidden" />

            <form onSubmit={signIn}>
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
                required
                autoComplete="current-password"
                className="input pr-11"
                placeholder="Enter your password"
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

            <label className="flex items-center gap-2.5 text-sm text-ink select-none mb-5">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded accent-[#7057D9]"
              />
              Remember me
            </label>

            {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

            {needsVerify && (
              <div className="text-sm mb-3">
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={resending}
                  className="text-brand-purple font-medium disabled:opacity-50"
                >
                  {resending ? 'Sending…' : 'Resend verification email'}
                </button>
                {resendMsg && <p className="text-ink-muted mt-1">{resendMsg}</p>}
              </div>
            )}

            <button disabled={busy} className="btn-primary w-full py-3">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            </form>

            <div className="mt-5 flex items-center justify-between text-sm">
              <Link href="/forgot-password" className="text-brand-purple font-medium hover:underline">
                Forgot password?
              </Link>
              <Link href="/register" className="text-brand-purple font-medium hover:underline">
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="pb-8 text-center text-xs text-ink-faint tracking-wide space-y-2">
        <div>UPSI &nbsp;·&nbsp; AFK &nbsp;·&nbsp; Veltrix</div>
        <div className="space-x-4">
          <Link href="/privacy" className="hover:text-ink-muted">Privacy</Link>
          <Link href="/terms" className="hover:text-ink-muted">Terms</Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginInner />
    </Suspense>
  );
}

/**
 * Rangka statik yang dihidangkan sebelum borang dihidrat.
 *
 * Fallback sebelum ini null, jadi HTML yang dihantar pelayan tiada tajuk dan
 * hampir tiada teks. Perangkak membaca HTML itu, bukan skrin selepas
 * JavaScript berjalan.
 */
function LoginShell() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FCFBF9' }}>
      <div className="px-8 pt-7">
        <Logo size={30} />
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px] text-center">
          <h1 className="text-[40px] leading-[1.1] font-semibold tracking-tight text-ink">
            Welcome back.
          </h1>
          <p className="text-[17px] text-ink-muted mt-2">
            Your next great class starts here.
          </p>
        </div>
      </div>
    </div>
  );
}
