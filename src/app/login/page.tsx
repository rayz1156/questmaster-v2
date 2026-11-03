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
import { pautanDalamanSelamat } from '@/lib/pautan';
import GoogleButton from '@/components/GoogleButton';
import AuthSplit from '@/components/ui/AuthSplit';
import PemilihBahasa from '@/components/PemilihBahasa';
import { useBahasa, tulisKukiBahasa } from '@/lib/i18n/BahasaProvider';

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, bahasa } = useBahasa();
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
      const m = error?.message || t('auth.signInFailed');
      setErr(m);
      setNeedsVerify(/confirm|verif/i.test(m));
      return;
    }
    const { data: prof } = await supabase.from('qm_profiles').select('role, approved, bahasa').eq('id', data.user.id).maybeSingle();
    const role = (prof?.role as string) || (data.user.user_metadata?.role as string) || 'participant';
    if (role === 'educator' && prof && prof.approved === false) {
      setBusy(false);
      router.replace('/pending-approval');
      return;
    }
    try { await supabase.auth.getUser(); } catch {}
    // KZ-043 A4: bahasa dalam profil mengatasi kuki peranti ini, supaya
    // pilihan pengguna mengikuti mereka semasa log masuk di peranti baharu.
    const bahasaProfil = prof?.bahasa;
    if ((bahasaProfil === 'en' || bahasaProfil === 'ms') && bahasaProfil !== bahasa) {
      tulisKukiBahasa(bahasaProfil);
    }
    setBusy(false);
    const nextParam = searchParams?.get('next');
    // Hanya laluan relatif dibenarkan (tolak // dan \ sebagai awalan skema),
    // sama seperti semakan di /auth/callback. Pengesah dikongsi sebagai fungsi
    // tulen dalam src/lib/pautan.ts supaya ujian sendiri memakai takrifan sama.
    const isSafeNext = pautanDalamanSelamat(nextParam);
    const defaultDest = role === 'educator'
      ? '/educator/classes'
      : (role === 'admin' || role === 'superadmin') ? '/admin/overview' : '/participant/home';
    window.location.href = isSafeNext && nextParam ? nextParam : defaultDest;
  }

  async function resendVerification() {
    if (!email) { setResendMsg(t('auth.enterEmailFirst')); return; }
    setResending(true); setResendMsg('');
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
    setResending(false);
    setResendMsg(error
      ? (error.message || t('auth.couldNotResend'))
      : t('auth.verificationSent'));
  }

  return (
    <AuthSplit penjuru={<PemilihBahasa />}>
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <h1 className="text-[20px] font-bold tracking-tight text-ink">{t('auth.welcomeBack')}</h1>
          <p className="text-[14px] text-ink-muted mt-1">{t('auth.loginSubtitle')}</p>
        </div>

        <div className="bg-white rounded-[4px] border border-hairline p-6 shadow-card">
            <GoogleButton next={searchParams?.get('next') || undefined} className="mb-5 empty:hidden" />

            <form onSubmit={signIn}>
            <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="email">{t('auth.email')}</label>
            <input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
              className="input mb-4"
              placeholder={t('auth.emailPlaceholder')}
            />

            <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="password">{t('auth.password')}</label>
            <div className="relative mb-4">
              <input
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={show ? 'text' : 'password'}
                required
                autoComplete="current-password"
                className="input pr-11"
                placeholder={t('auth.passwordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
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
              {t('auth.rememberMe')}
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
                  {resending ? t('auth.sending') : t('auth.resendVerification')}
                </button>
                {resendMsg && <p className="text-ink-muted mt-1">{resendMsg}</p>}
              </div>
            )}

            <button disabled={busy} className="btn-primary w-full py-3">
              {busy ? t('auth.signingIn') : t('auth.signInButton')}
            </button>

            </form>

            <div className="mt-5 flex items-center justify-between text-sm">
              <Link href="/forgot-password" className="text-brand-purple font-medium hover:underline">
                {t('auth.forgotPassword')}
              </Link>
              <Link href="/register" className="text-brand-purple font-medium hover:underline">
                {t('auth.createAccount')}
              </Link>
            </div>
        </div>
      </div>
    </AuthSplit>
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
  const { t } = useBahasa();
  return (
    <AuthSplit penjuru={<PemilihBahasa />}>
      <div className="w-full max-w-[380px] text-center">
        <h1 className="text-[20px] font-bold tracking-tight text-ink">
          {t('auth.welcomeBack')}
        </h1>
        <p className="text-[14px] text-ink-muted mt-1">
          {t('auth.loginSubtitle')}
        </p>
      </div>
    </AuthSplit>
  );
}
