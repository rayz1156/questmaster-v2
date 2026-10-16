"use client";
/**
 * Sertai pasukan melalui kod, rupa v3 KZ-023.
 *
 * Kad tengah gaya AuthSplit: borang Field/Input kit dalam Card kit.
 * Aliran tidak berubah: semak sesi (belum log masuk -> halaman log
 * masuk dengan next), pratonton nama pasukan melalui getTeamByCode
 * apabila kod cukup panjang, dan borang tetap memanggil joinTeamByCode.
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { joinTeamByCode, getTeamByCode } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import {
  Alert,
  Button,
  Card,
  CardHead,
  Field,
  Input,
} from '@/components/ui';

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get('code') || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [ok, setOk] = useState<string|null>(null);
  const [preview, setPreview] = useState<{ name: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace(`/login?next=/participant/join-team${code?`?code=${code}`:''}`); 
    });
    // Dijalankan sekali semasa muat, seperti versi asal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookup(c: string) {
    setErr(null); setPreview(null);
    if (c.length < 4) return;
    try { const t = await getTeamByCode(c); setPreview(t ? { name: (t as { name: string }).name } : null); }
    catch { /* ignore */ }
  }

  useEffect(() => { if (code) lookup(code.trim().toUpperCase()); }, [code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setOk(null); setBusy(true);
    try {
      await joinTeamByCode(code);
      setOk('Joined team! Redirecting...');
      setTimeout(() => router.replace('/participant/home'), 800);
    } catch (e: unknown) { setErr((e as { message?: string })?.message || 'Failed to join'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm">
      <Card>
        <CardHead
          title="Join a team"
          subtitle="Enter the team code given by your educator. You must already be enrolled in the team's class."
        />
        <div className="mt-5">
          <Field label="Team code" htmlFor="kod-pasukan" note={preview ? <>Team: <span className="font-semibold text-ink">{preview.name}</span></> : undefined}>
            <Input
              id="kod-pasukan"
              className="w-full text-center font-mono text-lg uppercase tracking-widest"
              placeholder="ABCD1234"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              required
              maxLength={16}
            />
          </Field>
        </div>
        <Button type="submit" disabled={busy} className="mt-5 w-full py-2">
          {busy ? 'Joining...' : 'Join team'}
        </Button>
        {err && <Alert tone="danger" className="mt-3">{err}</Alert>}
        {ok && <Alert tone="success" className="mt-3">{ok}</Alert>}
        <p className="mt-4 text-[12px] text-ink-faint">
          Need to join a class first? <a href="/participant/join" className="text-brand-purple font-medium hover:underline">Join a class</a>
        </p>
      </Card>
    </form>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <Suspense fallback={<div className="card w-full max-w-sm">Loading...</div>}><Inner/></Suspense>
    </div>
  );
}
