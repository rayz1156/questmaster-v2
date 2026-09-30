"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatMata } from "@/lib/markahPeserta";
import { supabase } from "@/lib/supabase";

/** Markah peserta daripada GET /api/classes/[id]/members/[userId]/scores. */
type MarkahPeserta = {
  name: string;
  totals: { task: number; live: number; adjustment: number; total: number; rank: number; liveSessions: number };
  activities: { huntId: string; title: string; approvedPoints: number; approvedCount: number; pendingCount: number }[];
  liveQuizzes: { sessionId: string; quizTitle: string; playedAt: string; score: number; correct: number; answered: number }[];
  adjustments: { delta: number; reason: string | null; createdAt: string }[];
};

/** Tarikh pendek untuk senarai dalam laci; kosong jika tidak sah. */
function tarikhPendek(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Kad pecahan markah kecil (Activities, Live Quiz, Adjustments). */
function KadPecahan({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="bg-[#FAFAFB] border border-hairline rounded-xl p-3">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="text-[15px] font-semibold text-ink tabular-nums mt-0.5">{nilai}</div>
    </div>
  );
}

/**
 * Laci butiran markah seorang peserta (V2-013). Diekstrak daripada halaman
 * People di V2-014b supaya tab Insights boleh guna semula laci yang sama;
 * tingkah laku People tidak berubah. Lebar 420px pada skrin besar, penuh
 * pada telefon. Tutup dengan Esc, klik luar atau butang X; fokus dikunci
 * dalam laci supaya papan kekunci tidak keluar ke latar.
 */
export default function LaciMarkahPeserta({
  classId,
  userId,
  nama,
  jumlahAhli,
  tutup,
}: {
  classId: string;
  userId: string;
  nama: string;
  jumlahAhli: number;
  tutup: () => void;
}) {
  const [data, setData] = useState<MarkahPeserta | null>(null);
  const [ralat, setRalat] = useState<string | null>(null);
  const [muat, setMuat] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const butangTutupRef = useRef<HTMLButtonElement>(null);

  // Muat data markah setiap kali laci dibuka untuk peserta baharu.
  useEffect(() => {
    let alive = true;
    setMuat(true);
    setRalat(null);
    setData(null);
    (async () => {
      try {
        const { data: ses } = await supabase.auth.getSession();
        const res = await fetch(`/api/classes/${classId}/members/${userId}/scores`, {
          headers: ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {},
          cache: "no-store",
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          if (alive) setRalat(j?.error || "Could not load scores.");
          return;
        }
        if (alive) setData(j as MarkahPeserta);
      } catch {
        if (alive) setRalat("Could not load scores.");
      } finally {
        if (alive) setMuat(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [classId, userId]);

  // Esc menutup laci; Tab berpusing dalam laci sahaja (perangkap fokus).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        tutup();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const boleh = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (boleh.length === 0) return;
      const pertama = boleh[0];
      const akhir = boleh[boleh.length - 1];
      if (e.shiftKey && document.activeElement === pertama) {
        e.preventDefault();
        akhir.focus();
      } else if (!e.shiftKey && document.activeElement === akhir) {
        e.preventDefault();
        pertama.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    butangTutupRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [tutup]);

  const jumlah = data?.totals.total ?? 0;

  return (
    <div className="fixed inset-0 z-50">
      {/* Latar klik luar menutup laci. */}
      <div className="absolute inset-0 bg-black/40" onClick={tutup} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${nama} scores`}
        className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white border-l border-hairline shadow-raised flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-hairline">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold text-ink truncate">{nama}</div>
            {data && (
              <div className="text-sm text-ink-muted mt-0.5">
                Rank {data.totals.rank} of {jumlahAhli}
              </div>
            )}
          </div>
          <button
            ref={butangTutupRef}
            type="button"
            onClick={tutup}
            aria-label="Close"
            className="w-9 h-9 rounded-xl border border-hairline flex items-center justify-center text-ink-muted hover:text-ink shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {muat && (
            <div className="space-y-3">
              <div className="h-9 w-2/3 rounded-lg bg-[#EDEEF2] animate-pulse" />
              <div className="h-24 rounded-xl bg-[#EDEEF2] animate-pulse" />
              <div className="h-32 rounded-xl bg-[#EDEEF2] animate-pulse" />
            </div>
          )}

          {!muat && ralat && <div className="text-sm text-red-600">{ralat}</div>}

          {!muat && data && (
            <>
              <div>
                <div className="text-xs text-ink-faint">Total</div>
                <div className="text-3xl font-semibold text-brand-purple tabular-nums mt-1">
                  {formatMata(jumlah)}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <KadPecahan label="Activities" nilai={formatMata(data.totals.task)} />
                <KadPecahan label="Live Quiz" nilai={formatMata(data.totals.live)} />
                <KadPecahan label="Adjustments" nilai={formatMata(data.totals.adjustment)} />
              </div>

              <div>
                <div className="section-title text-sm mb-2">Activities</div>
                {data.activities.length === 0 ? (
                  <p className="text-sm text-ink-muted">No activities yet.</p>
                ) : (
                  <ul className="divide-y divide-hairline border border-hairline rounded-xl">
                    {data.activities.map((a) => (
                      <li key={a.huntId} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-ink truncate">{a.title}</div>
                          <div className="text-xs text-ink-faint mt-0.5">
                            {a.approvedCount} approved, {a.pendingCount} pending
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-ink tabular-nums shrink-0">
                          {formatMata(a.approvedPoints)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="section-title text-sm mb-2">Live Quiz</div>
                {data.liveQuizzes.length === 0 ? (
                  <p className="text-sm text-ink-muted">No live quizzes yet.</p>
                ) : (
                  <ul className="divide-y divide-hairline border border-hairline rounded-xl">
                    {data.liveQuizzes.map((lq) => (
                      <li key={lq.sessionId} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-ink truncate">{lq.quizTitle}</div>
                          <div className="text-xs text-ink-faint mt-0.5">
                            {tarikhPendek(lq.playedAt)}
                            {lq.answered > 0 ? ` · ${lq.correct}/${lq.answered} correct` : ""}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-ink tabular-nums shrink-0">
                          {formatMata(lq.score)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {data.adjustments.length > 0 && (
                <div>
                  <div className="section-title text-sm mb-2">Adjustments</div>
                  <ul className="divide-y divide-hairline border border-hairline rounded-xl">
                    {data.adjustments.map((adj, i) => (
                      <li key={i} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-ink truncate">{adj.reason || "Adjustment"}</div>
                          <div className="text-xs text-ink-faint mt-0.5">{tarikhPendek(adj.createdAt)}</div>
                        </div>
                        <div
                          className={`text-sm font-semibold tabular-nums shrink-0 ${adj.delta < 0 ? "text-red-600" : "text-ink"}`}
                        >
                          {formatMata(adj.delta)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
