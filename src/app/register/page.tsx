'use client';

/**
 * Create account, semakan September 2026. Lihat skrin log masuk untuk
 * pasangannya; kedua-duanya sengaja kelihatan sama.
 *
 * Semua teks UI melalui useBahasa() (KZ-040). Mesej "emel sudah berdaftar"
 * dahulu mengesan navigator.language secara ad-hoc; kini ia ikut kuki
 * kz_lang yang sama dengan seluruh aplikasi.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import GoogleButton from '@/components/GoogleButton';
import AuthSplit from '@/components/ui/AuthSplit';
import PemilihBahasa from '@/components/PemilihBahasa';
import { useBahasa } from '@/lib/i18n/BahasaProvider';

export default function Register() {
  const { t } = useBahasa();
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
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectTo, data: { name, display_name: name, role } },
    });
    setBusy(false);
    // Emel sudah wujud: Supabase sama ada memulangkan ralat "already
    // registered", atau (bila pengesahan emel aktif) pengguna dengan
    // identities kosong tanpa ralat.
    const emelWujud =
      (error && /already\s+(been\s+)?registered|already exists/i.test(error.message || '')) ||
      (!error && Array.isArray(data?.user?.identities) && data.user.identities.length === 0);
    if (emelWujud) { setErr(t(role === 'educator' ? 'auth.emailTakenEducator' : 'auth.emailTakenParticipant')); return; }
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
    if (!email) { setResendMsg(t('auth.enterEmailFirst')); return; }
    setResending(true); setResendMsg('');
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
    setResending(false);
    setResendMsg(error
      ? (error.message || t('auth.couldNotResend'))
      : t('auth.verificationSentAgain'));
  }

  return (
    <AuthSplit penjuru={<PemilihBahasa />}>
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <h1 className="text-[20px] font-bold tracking-tight text-ink">
            {done ? t('auth.checkEmail') : t('auth.startHere')}
          </h1>
          <p className="text-[14px] text-ink-muted mt-1">
            {done ? t('auth.sentLinkTo', { emel: email }) : t('auth.oneAccountFor')}
          </p>
        </div>

        {done ? (
          <div className="bg-white rounded-[4px] border border-hairline p-6 shadow-card">
              <p className="text-sm text-ink-muted">
                {t('auth.openLinkToConfirm')}
              </p>
              {role === 'educator' && (
                <p className="text-sm text-[#8A6100] bg-[#FEF6E7] rounded-xl px-3.5 py-2.5 mt-4">
                  {t('auth.educatorApprovedByAdmin')}
                </p>
              )}
              <button
                type="button"
                onClick={resendVerification}
                disabled={resending}
                className="btn-quiet text-brand-purple mt-4 disabled:opacity-50"
              >
                {resending ? t('auth.sending') : t('auth.resendVerification')}
              </button>
              {resendMsg && <p className="text-sm text-ink-muted mt-2">{resendMsg}</p>}
              <Link href="/login" className="btn-primary w-full mt-5">{t('common.backToSignIn')}</Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-hairline p-6">
              <GoogleButton role={role} className="mb-5 empty:hidden" label={t('auth.signUpGoogle')} />

              <form onSubmit={submit}>
                <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="name">{t('auth.displayName')}</label>
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="input mb-4"
                  placeholder={t('auth.namePlaceholder')}
                />

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
                    minLength={8}
                    required
                    autoComplete="new-password"
                    className="input pr-11"
                    placeholder={t('auth.newPasswordPlaceholder')}
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

                <div className="text-sm font-medium text-ink mb-1.5">{t('auth.iAmA')}</div>
                <div className="inline-flex rounded-xl border border-hairline overflow-hidden text-sm mb-1">
                  <button
                    type="button"
                    onClick={() => setRole('participant')}
                    className={`px-4 py-2 font-medium transition ${role === 'participant' ? 'bg-[#F4F2FD] text-brand-purple' : 'text-ink-muted hover:text-ink'}`}
                  >
                    {t('auth.participant')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('educator')}
                    className={`px-4 py-2 font-medium transition border-l border-hairline ${role === 'educator' ? 'bg-[#F4F2FD] text-brand-purple' : 'text-ink-muted hover:text-ink'}`}
                  >
                    {t('auth.educator')}
                  </button>
                </div>
                <p className="text-xs text-ink-faint mb-5">
                  {role === 'educator'
                    ? t('auth.educatorNote')
                    : t('auth.participantNote')}
                </p>

                {err && <p className="text-sm text-[#C0392B] mb-3">{err}</p>}

                <button disabled={busy} className="btn-primary w-full py-3">
                  {busy ? t('auth.creating') : t('auth.createAccountButton')}
                </button>
              </form>

              <p className="mt-5 text-sm text-center text-ink-muted">
                {t('auth.alreadyHaveAccount')}{' '}
                <Link href="/login" className="text-brand-purple font-medium hover:underline">{t('common.signIn')}</Link>
              </p>
            </div>
          )}
      </div>
    </AuthSplit>
  );
}
