"use client";
/**
 * Sertai kelas melalui kod, rupa v3 KZ-023.
 *
 * Kad tengah gaya AuthSplit: borang Field/Input kit dalam Card kit.
 * Aliran tidak berubah: semak sesi dahulu (belum log masuk -> halaman
 * log masuk dengan next), kod dalam URL -> alih ke /j/<kod
 * dinormalisasi>, dan borang tetap memanggil joinClassByCode dengan
 * normalizeClassCode.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { joinClassByCode, normalizeClassCode } from "@/lib/data";
import {
  Alert,
  Button,
  Card,
  CardHead,
  Field,
  Input,
} from "@/components/ui";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get('code') || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Wait for Supabase to hydrate the session before redirecting to login
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace(`/login?next=${encodeURIComponent('/participant/join' + (code ? `?code=${code}` : ''))}`);
      } else {
        // Satu aliran sahaja: jika kod ada di URL, alih ke /j/<kod
        // dinormalisasi> (tiket V2-004). Tiada penyertaan automatik di sini.
        if (code && code.trim()) {
          router.replace(`/j/${normalizeClassCode(code.trim())}`);
          return;
        }
      }
    })();
    return () => { cancelled = true; };
    // Dijalankan sekali semasa muat, seperti versi asal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(null); setBusy(true);
    // Kod dinormalisasi sebelum dihantar supaya jarak, sengkang dan
    // huruf O/I/L tidak menghalang penyertaan.
    try { await joinClassByCode(normalizeClassCode(code)); setOk("Joined! Redirecting…"); setTimeout(() => router.replace('/participant/home'), 800); }
    catch (e: unknown) { const m = String((e as { message?: string })?.message || 'Failed'); setErr(/Invalid class code/i.test(m) ? "Code not found. Please check the code with your educator." : m); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm">
      <Card>
        <div className="mb-5">
          <Button variant="ghost" href="/participant/home" ariaLabel="Back to Home">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Button>
        </div>
        <CardHead
          title="Join a class"
          subtitle="Enter the class code given by your educator."
        />
        <div className="mt-5">
          <Field label="Class code" htmlFor="kod-kelas">
            <Input
              id="kod-kelas"
              className="text-center font-mono text-lg uppercase tracking-[0.2em]"
              placeholder="ABCD1234"
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setErr(null); }}
              required
              maxLength={16}
            />
          </Field>
        </div>
        <Button type="submit" disabled={busy} className="mt-5 w-full py-2">
          {busy ? 'Joining…' : 'Join class'}
        </Button>
        {err && <Alert tone="danger" className="mt-3">{err}</Alert>}
        {ok && <Alert tone="success" className="mt-3">{ok}</Alert>}
      </Card>
    </form>
  );
}
export default function ParticipantJoin() {
  return (<div className="min-h-screen bg-canvas flex items-center justify-center p-4"><Suspense fallback={<div className="card w-full max-w-sm">Loading…</div>}><Inner/></Suspense></div>);
}
