"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { joinClassByCode } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { teks } from "@/i18n/teks";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get('code') || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
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
        setAuthChecked(true);
        // Auto-submit if we already have a code in the URL (group/invite link)
        if (code && code.trim()) {
          setBusy(true); setErr(null); setOk(null);
          try {
            await joinClassByCode(code.trim().toUpperCase());
            setOk(teks.sertai.berjaya);
            setTimeout(() => router.replace('/participant/home'), 600);
          } catch (e:any) {
            const msg = String(e?.message || teks.sertai.gagal);
            setErr(/Invalid class code/i.test(msg) ? teks.sertai.kodTidakSahSemak(code.trim().toUpperCase()) : msg);
          } finally { setBusy(false); }
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(null); setBusy(true);
    try { await joinClassByCode(code.trim().toUpperCase()); setOk(teks.sertai.berjaya); setTimeout(() => router.replace('/participant/home'), 800); }
    catch (e: any) { const m=String(e?.message||teks.sertai.gagal); setErr(/Invalid class code/i.test(m) ? teks.sertai.kodTidakSah(code.trim().toUpperCase()) : m); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-3">
      <a href="/participant/home" className="flex items-center gap-1 text-sm text-purple-600 hover:underline mb-3"><svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>{teks.sertai.kembali}</a><h1 className="font-bold text-lg">{teks.sertai.tajuk}</h1>
      <p className="text-xs text-gray-500">{teks.sertai.sub}</p>
      <input className="input w-full text-center font-mono text-lg uppercase" placeholder="ABCD1234" value={code} onChange={e=>{setCode(e.target.value.toUpperCase());setErr(null);}} required maxLength={16}/>
      <button disabled={busy} className="btn-primary w-full py-2">{busy ? teks.sertai.menyertai : teks.sertai.butang}</button>
      {err && <div className="text-xs text-red-600">{err}</div>}
      {ok && <div className="text-xs text-green-700">{ok}</div>}
    </form>
  );
}
export default function ParticipantJoin() {
  return (<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4"><Suspense fallback={<div className="card w-full max-w-sm">{teks.sertai.memuatkan}</div>}><Inner/></Suspense></div>);
}
