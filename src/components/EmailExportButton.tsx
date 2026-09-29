"use client";

/**
 * Butang "Send to Encharge" untuk pengepala halaman People sesebuah kelas.
 *
 * Aliran: klik membuka modal yang memanggil dryRun dahulu (kiraan sahaja,
 * tiada penghantaran), pendidik menandakan persetujuan, kemudian butang
 * hantar dibuka. Keputusan dipapar dalam pil status.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { pelanBerbayar } from "@/lib/pelan";

// Pelan berkesan dari GET /api/integrations/email; 'unlimited' dipaparkan
// sebagai 'pro' oleh pelayan, jadi jenis ini cukup.
type Status = { plan: string; connected: boolean };
type DryRun = { total: number; withEmail: number; withoutEmail: number; tags: string[]; provider: string };
type Hasil = { sent: number; skipped: number; failed: number; errors: string[] };

export default function EmailExportButton({ classId }: { classId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [buka, setBuka] = useState(false);
  const [pratonton, setPratonton] = useState<DryRun | null>(null);
  const [setuju, setSetuju] = useState(false);
  const [hantarBusy, setHantarBusy] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [ralat, setRalat] = useState<string | null>(null);

  const muatStatus = useCallback(async () => {
    try {
      const { data: ses } = await supabase.auth.getSession();
      const res = await fetch("/api/integrations/email", {
        headers: ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setStatus({ plan: typeof data.plan === "string" ? data.plan : "free", connected: !!data.connected });
    } catch {
      /* senyap: butang kekal dalam keadaan lalai */
    }
  }, []);

  useEffect(() => {
    muatStatus();
  }, [muatStatus]);

  const bukaModal = async () => {
    setBuka(true);
    setPratonton(null);
    setSetuju(false);
    setHasil(null);
    setRalat(null);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const res = await fetch(`/api/classes/${classId}/email-export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {}),
        },
        body: JSON.stringify({ consent: false, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRalat(data.error || "Could not prepare the export.");
        return;
      }
      setPratonton(data as DryRun);
    } catch {
      setRalat("Could not prepare the export.");
    }
  };

  const hantar = async () => {
    setHantarBusy(true);
    setRalat(null);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const res = await fetch(`/api/classes/${classId}/email-export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {}),
        },
        body: JSON.stringify({ consent: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRalat(data.error || "Sending failed.");
        return;
      }
      setHasil(data as Hasil);
      muatStatus();
    } catch {
      setRalat("Sending failed.");
    } finally {
      setHantarBusy(false);
    }
  };

  // Belum tahu status: jangan papar butang setengah masak.
  if (!status) return null;

  // Bukan pelan berbayar: butang terkunci dengan tooltip (V2-008).
  if (!pelanBerbayar(status.plan)) {
    return (
      <button
        type="button"
        disabled
        title="This feature is part of the Pro plan."
        className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3.5 py-2 bg-violet-50 border border-violet-200 text-ink-muted cursor-not-allowed"
      >
        <Lock className="w-4 h-4" /> Send to Encharge
        <span className="text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full px-1.5 py-0.5">
          Pro
        </span>
      </button>
    );
  }

  // Pro tetapi tiada integrasi: pautan ke Profil.
  if (!status.connected) {
    return (
      <Link
        href="/educator/profile"
        className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-3.5 py-2 bg-violet-50 border border-violet-200 text-brand-purple"
      >
        Connect Encharge in your profile first
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={bukaModal}
        className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3.5 py-2 text-white bg-gradient-to-r from-violet-600 to-indigo-600"
      >
        <Send className="w-4 h-4" /> Send to Encharge
      </button>

      {buka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl border border-violet-200 w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-ink">Send to Encharge</h3>
              <button type="button" onClick={() => setBuka(false)} className="text-ink-muted" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!pratonton && !ralat && <p className="text-sm text-ink-muted">Counting participants...</p>}

            {pratonton && (
              <div className="text-sm text-ink space-y-2">
                <p>
                  {pratonton.withEmail} participant{pratonton.withEmail === 1 ? "" : "s"} will be added to
                  Encharge with tag{pratonton.tags.length > 1 ? "s" : ""} {pratonton.tags.join(", ")}.
                </p>
                {pratonton.withoutEmail > 0 && (
                  <p className="text-ink-muted">
                    {pratonton.withoutEmail} without email will be skipped.
                  </p>
                )}
                {pratonton.withEmail === 0 && (
                  <p className="text-ink-muted">Nothing to send: no participants have an email address.</p>
                )}
              </div>
            )}

            {pratonton && pratonton.withEmail > 0 && (
              <label className="flex items-start gap-2 mt-4 text-sm text-ink cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={setuju}
                  onChange={(e) => setSetuju(e.target.checked)}
                />
                <span>I confirm these participants agreed to receive emails from me</span>
              </label>
            )}

            {ralat && <p className="text-sm text-red-600 mt-3">{ralat}</p>}

            {hasil && (
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span className="text-sm rounded-lg bg-[#E3F5EA] text-[#2E7D4F] px-2.5 py-1 font-medium">
                  Sent {hasil.sent}
                </span>
                <span className="text-sm rounded-lg bg-[#FAFAFB] text-ink-muted px-2.5 py-1 font-medium">
                  Skipped {hasil.skipped}
                </span>
                {hasil.failed > 0 && (
                  <span className="text-sm rounded-lg bg-[#FCE8E4] text-[#B4552F] px-2.5 py-1 font-medium">
                    Failed {hasil.failed}
                  </span>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setBuka(false)} className="btn-quiet text-sm text-ink-muted">
                Close
              </button>
              {pratonton && pratonton.withEmail > 0 && (
                <button
                  type="button"
                  disabled={!setuju || hantarBusy}
                  onClick={hantar}
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
                >
                  {hantarBusy
                    ? "Sending..."
                    : `Send ${pratonton.withEmail} participant${pratonton.withEmail === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
