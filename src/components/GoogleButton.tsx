'use client';
import { useState } from 'react';
import { useProvider, signInWithGoogle } from '@/lib/oauth';

/**
 * Butang "Continue with Google".
 *
 * Ia menghilang sepenuhnya kalau pelayan auth belum menghidupkan Google,
 * jadi tiada butang rosak yang boleh diklik.
 *
 * Nota tanda Google: butang ini sengaja tiada logo G berwarna. Tanda itu
 * milik Google dan garis panduan jenama mereka menetapkan aset rasmi
 * mereka sendiri yang mesti digunakan, bukan lukisan semula. Kalau aset
 * rasmi itu diletakkan dalam /public, ia boleh dipasang di sini kemudian.
 */
export default function GoogleButton({
  role,
  next,
  label = 'Continue with Google',
  divider = true,
  className = '',
}: {
  role?: 'participant' | 'educator';
  next?: string;
  label?: string;
  /** Pemisah "or" di bawah butang, hilang bersama butang. */
  divider?: boolean;
  className?: string;
}) {
  const ready = useProvider('google');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!ready) return null;

  async function go() {
    setBusy(true); setErr('');
    const { error } = await signInWithGoogle({ role, next });
    if (error) { setBusy(false); setErr(error.message || 'Could not reach Google. Try again.'); }
  }

  return (
    <div className={className}>
      <button type="button" onClick={go} disabled={busy} className="btn-secondary w-full">
        {busy ? 'Opening Google…' : label}
      </button>
      {err && <p className="mt-2 text-sm text-[#C0392B]">{err}</p>}
      {divider && (
        <div className="flex items-center gap-3 mt-5">
          <span className="h-px flex-1 bg-hairline" />
          <span className="text-xs text-ink-faint">or</span>
          <span className="h-px flex-1 bg-hairline" />
        </div>
      )}
    </div>
  );
}
