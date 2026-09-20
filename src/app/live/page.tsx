"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function BorangMasuk() {
  const router = useRouter();
  const sp = useSearchParams();
  const [kod, setKod] = useState(sp.get("code") || "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onHantar = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const bersih = kod.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(bersih)) {
      setErr("The session code must be 6 characters.");
      return;
    }
    setBusy(true);
    router.push("/live/" + bersih);
  };

  return (
    <div className="card w-full max-w-sm">
      <h1 className="text-xl font-bold text-center mb-1">Live Quiz</h1>
      <p className="text-sm text-gray-500 text-center mb-4">Enter the session code from your educator.</p>
      <form onSubmit={onHantar}>
        <input
          className="input w-full text-center font-mono text-2xl tracking-widest uppercase mb-3"
          placeholder="ABC123"
          maxLength={6}
          value={kod}
          onChange={(e) => setKod(e.target.value.toUpperCase())}
          autoFocus
        />
        {err && <div className="text-xs text-red-600 mb-2">{err}</div>}
        <button type="submit" disabled={busy} className="btn-primary w-full py-2">
          Enter
        </button>
      </form>
    </div>
  );
}

export default function HalamanMasukLangsung() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Suspense fallback={<div className="card w-full max-w-sm text-center text-sm text-gray-500">Loading…</div>}>
        <BorangMasuk />
      </Suspense>
    </div>
  );
}
