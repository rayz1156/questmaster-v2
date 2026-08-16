// app/oauth/consent/page.tsx
// Skrin kebenaran yang dilihat pengguna apabila Claude atau ChatGPT meminta
// akses ke akaun Kuizen mereka.
//
// Nota Next.js: pengguna useSearchParams() MESTI dibalut dalam <Suspense>.

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// Singleton sedia ada app (storageKey 'qm-auth'). Jangan cipta klien kedua
// pada kunci storan yang sama: dua GoTrueClient akan berlumba memutarkan
// refresh token yang sama.
import { supabase } from "@/lib/supabase";

function ConsentInner() {
  const params = useSearchParams();

  const clientName = params.get("client_name") ?? "Aplikasi luar";
  const scope = params.get("scope") ?? "kuizen:read kuizen:write";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user?.email ?? null);
    });
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setStatus({ kind: "error", text: error.message });
      return;
    }
    setSessionEmail(data.user?.email ?? null);
  }

  /**
   * Kedua-dua "Benarkan" dan "Tolak" pergi melalui pelayan, supaya
   * redirect_uri sentiasa disahkan terhadap klien yang didaftarkan.
   * Refresh token pelayar TIDAK dihantar.
   */
  async function submit(action: "approve" | "deny") {
    setBusy(true);
    setStatus(null);

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setBusy(false);
      setStatus({ kind: "error", text: "Sesi tamat. Sila log masuk semula." });
      setSessionEmail(null);
      return;
    }

    const res = await fetch("/api/oauth/consent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        action,
        client_id: params.get("client_id"),
        redirect_uri: params.get("redirect_uri"),
        code_challenge: params.get("code_challenge"),
        code_challenge_method: params.get("code_challenge_method"),
        scope,
        state: params.get("state"),
        resource: params.get("resource"),
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setBusy(false);
      setStatus({ kind: "error", text: json.error ?? "Permintaan gagal" });
      return;
    }
    window.location.href = json.redirect_to;
  }

  const permissions = [
    { scope: "kuizen:read", label: "Melihat kelas, hunt, board dan progres anda" },
    { scope: "kuizen:write", label: "Mencipta dan mengemas kini kandungan bagi pihak anda" },
  ].filter((p) => scope.includes(p.scope));

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-lg font-bold text-white">
            K
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            Benarkan {clientName} mengakses Kuizen?
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Nama di atas dilaporkan oleh aplikasi itu sendiri. Sambungan ini akan
            bertindak sebagai anda, dan hanya boleh melihat perkara yang anda sendiri
            boleh lihat.
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
            Kebenaran diminta
          </p>
          <ul className="space-y-1.5">
            {permissions.map((p) => (
              <li key={p.scope} className="flex gap-2 text-sm text-violet-900">
                <span aria-hidden="true">&bull;</span>
                <span>{p.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {status && (
          <div
            className={`mb-4 rounded-lg px-3 py-2 text-sm ${
              status.kind === "error"
                ? "bg-rose-50 text-rose-700"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {status.text}
          </div>
        )}

        {sessionEmail ? (
          <>
            <p className="mb-4 text-sm text-slate-600">
              Log masuk sebagai <span className="font-medium text-slate-900">{sessionEmail}</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => submit("deny")}
                disabled={busy}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Tolak
              </button>
              <button
                onClick={() => submit("approve")}
                disabled={busy}
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
              >
                {busy ? "Memproses..." : "Benarkan"}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={signIn} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Emel"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kata laluan"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
            >
              {busy ? "Log masuk..." : "Log masuk untuk teruskan"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Memuatkan...</div>}
    >
      <ConsentInner />
    </Suspense>
  );
}
