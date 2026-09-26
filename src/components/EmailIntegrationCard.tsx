"use client";

/**
 * Kad "Email integration" untuk halaman Profil pendidik.
 *
 * Satu penyedia, dibuat sempurna (KZ-005): satu kad, satu penyedia
 * (Encharge), tiada tetapan lain. Kunci API tidak pernah dihantar balik
 * oleh GET; kad ini hanya melihat status, hint 4 aksara dan tarikh.
 */

import { useCallback, useEffect, useState } from "react";
import { Lock, Mail, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";

type StatusIntegrasi = {
  plan: "free" | "pro";
  connected: boolean;
  provider: string | null;
  hint: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
};

function tarikhRingkas(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function EmailIntegrationCard() {
  const [status, setStatus] = useState<StatusIntegrasi | null>(null);
  const [kunci, setKunci] = useState("");
  const [busy, setBusy] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);
  const [maklum, setMaklum] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setRalat(null);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const res = await fetch("/api/integrations/email", {
        headers: ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {},
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setRalat(data.error || "Could not load the email integration.");
        return;
      }
      setStatus(data as StatusIntegrasi);
    } catch {
      setRalat("Could not load the email integration.");
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const sambung = async () => {
    setRalat(null);
    setMaklum(null);
    setBusy(true);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const res = await fetch("/api/integrations/email", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {}),
        },
        body: JSON.stringify({ provider: "encharge", apiKey: kunci }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRalat(data.error || "Could not connect Encharge.");
        return;
      }
      setKunci("");
      await muat();
    } catch {
      setRalat("Could not connect Encharge.");
    } finally {
      setBusy(false);
    }
  };

  const putus = async () => {
    setRalat(null);
    setMaklum(null);
    setBusy(true);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const res = await fetch("/api/integrations/email", {
        method: "DELETE",
        headers: ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setRalat(data.error || "Could not disconnect.");
        return;
      }
      setMaklum("Encharge disconnected.");
      await muat();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 text-ink font-semibold">
          <Mail className="w-4 h-4 text-brand-purple" /> Email integration
        </div>
        {status && status.plan !== "pro" && (
          <span className="text-[11px] font-bold uppercase tracking-wide text-white bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full px-2.5 py-1">
            Pro
          </span>
        )}
      </div>

      {/* Belum log masuk atau masih memuat */}
      {!status && (
        <p className="text-sm text-ink-muted">{ralat || "Loading..."}</p>
      )}

      {/* Bukan Pro: terkunci, tiada medan. */}
      {status && status.plan !== "pro" && (
        <div className="flex items-start gap-2 text-sm text-ink-muted">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Send your class participants to your email marketing tool. This is part of the Pro plan.
          </span>
        </div>
      )}

      {/* Pro, belum sambung. */}
      {status && status.plan === "pro" && !status.connected && (
        <div>
          <p className="text-sm text-ink-muted mb-3">
            Connect your email marketing provider, then send a whole class to it in one click from the People page.
          </p>
          <div className="flex items-center gap-3 border border-violet-200 bg-white rounded-lg px-3 py-2.5 mb-3 w-fit">
            <span className="w-8 h-8 rounded-lg bg-[#EAE6FC] text-brand-purple flex items-center justify-center font-bold text-sm">E</span>
            <span className="text-sm font-medium text-ink">Encharge</span>
          </div>
          <label className="block text-sm text-ink-muted mb-1" htmlFor="encharge-api-key">
            Encharge API key
          </label>
          <input
            id="encharge-api-key"
            type="password"
            className="input mb-1"
            placeholder="Paste your API key"
            value={kunci}
            onChange={(e) => setKunci(e.target.value)}
            autoComplete="off"
          />
          <a
            className="inline-block text-xs text-brand-purple underline mb-3"
            href="https://app.encharge.io/settings/api-keys"
            target="_blank"
            rel="noreferrer"
          >
            Where do I find my API key? <ExternalLink className="w-3 h-3 inline" />
          </a>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy || kunci.trim().length < 8}
              onClick={sambung}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {busy ? "Connecting..." : "Connect"}
            </button>
          </div>
        </div>
      )}

      {/* Sudah sambung. */}
      {status && status.plan === "pro" && status.connected && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink">
            Connected to Encharge · ••••{status.hint || "••••"}
            {status.last_sync_at && (
              <span className="text-ink-muted"> · last sync {tarikhRingkas(status.last_sync_at)}</span>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={putus}
            className="btn-quiet text-sm text-ink-muted disabled:opacity-50"
          >
            {busy ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      )}

      {ralat && <p className="text-sm text-red-600 mt-2">{ralat}</p>}
      {maklum && <p className="text-sm text-[#2E7D4F] mt-2">{maklum}</p>}
    </div>
  );
}
