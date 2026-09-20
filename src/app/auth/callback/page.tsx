'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';

type Role = 'participant' | 'educator' | 'admin' | 'superadmin';

function destFor(role: string): string {
  if (role === 'admin' || role === 'superadmin') return '/admin/overview';
  if (role === 'educator') return '/educator/classes';
  return '/participant/home';
}

function CallbackInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [msg, setMsg] = useState('Signing you in…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;

    // Pembekal yang menolak permintaan menghantar sebabnya dalam URL. Papar
    // sebab itu, jangan tulis "no session" yang tidak memberitahu apa-apa.
    const provErr = sp?.get('error_description') || sp?.get('error');
    if (provErr) {
      setFailed(true);
      setMsg(decodeURIComponent(provErr));
      return;
    }

    /** Tunggu sesi wujud. detectSessionInUrl menukar kod di latar belakang. */
    async function waitForSession(ms: number) {
      const deadline = Date.now() + ms;
      for (;;) {
        const { data } = await supabase.auth.getSession();
        if (data.session) return data.session;
        if (Date.now() > deadline) return null;
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    (async () => {
      const session = await waitForSession(10000);
      if (!alive) return;
      if (!session) {
        setFailed(true);
        setMsg('That sign-in link did not complete. Please try signing in again.');
        setTimeout(() => router.replace('/login'), 2500);
        return;
      }

      const user = session.user;
      const meta = (user.user_metadata || {}) as Record<string, unknown>;

      // Peranan hanya boleh ditetapkan pada akaun yang belum mempunyai
      // peranan langsung, iaitu pendaftaran Google yang benar-benar baharu.
      // Akaun sedia ada tidak boleh dinaikkan taraf melalui parameter URL.
      //
      // Kerja sebenar berlaku di pelayan. Pelayar tidak dibenarkan menulis
      // lajur role atau approved pada profil sendiri, jadi menetapkan
      // peranan di sini sahaja akan meninggalkan profil sebagai peserta dan
      // memintas pintu kelulusan pendidik.
      let pendingEducator = false;
      if (sp?.get('role') === 'educator' && !meta.role) {
        try {
          const res = await fetch('/api/auth/claim-educator', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          pendingEducator = res.ok;
          if (res.ok) {
            fetch('/api/notify-educator-pending', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: user.email, name: meta.name || meta.full_name || user.email }),
            }).catch(() => {});
          }
        } catch { /* peranan kekal peserta; pentadbir boleh naikkan kemudian */ }
      }

      if (pendingEducator) {
        router.replace('/pending-approval');
        return;
      }

      const { data: prof } = await supabase
        .from('qm_profiles')
        .select('role, approved')
        .eq('id', user.id)
        .maybeSingle();

      const role = (prof?.role as string) || (meta.role as Role) || 'participant';
      if (role === 'educator' && prof && prof.approved === false) {
        router.replace('/pending-approval');
        return;
      }

      const next = sp?.get('next');
      const safe = !!next && next.startsWith('/') && !next.startsWith('//');
      window.location.href = safe ? (next as string) : destFor(role);
    })();

    return () => { alive = false; };
  }, [router, sp]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FCFBF9' }}>
      <div className="px-8 pt-7">
        <Logo size={30} />
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px] text-center">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-ink">
            {failed ? 'We could not finish that.' : 'One moment.'}
          </h1>
          <p className="text-[15px] text-ink-muted mt-2">{msg}</p>
          {failed && (
            <a href="/login" className="btn-primary mt-6">Back to sign in</a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Callback() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <CallbackInner />
    </Suspense>
  );
}
