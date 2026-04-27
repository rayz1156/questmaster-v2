"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { joinClassByCode } from "@/lib/data";
import { getSession } from "@/lib/session";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get('code') || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  useEffect(() => { if (!getSession()) router.replace(`/login?next=/participant/join${code ? `?code=${code}`:''}`); }, []);
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(null); setBusy(true);
    try { await joinClassByCode(code.trim().toUpperCase()); setOk("Joined! Redirecting…"); setTimeout(() => router.replace('/participant'), 800); }
    catch (e: any) { setErr(e.message || 'Failed'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-3">
      <h1 className="font-bold text-lg">Join a class</h1>
      <p className="text-xs text-gray-500">Enter the class code given by your educator.</p>
      <input className="input w-full text-center font-mono text-lg uppercase" placeholder="ABCD1234" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required maxLength={16}/>
      <button disabled={busy} className="btn-primary w-full py-2">{busy ? 'Joining…' : 'Join class'}</button>
      {err && <div className="text-xs text-red-600">{err}</div>}
      {ok && <div className="text-xs text-green-700">{ok}</div>}
    </form>
  );
}
export default function ParticipantJoin() {
  return (<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4"><Suspense fallback={<div className="card w-full max-w-sm">Loading…</div>}><Inner/></Suspense></div>);
}
