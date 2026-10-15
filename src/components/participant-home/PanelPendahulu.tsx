"use client";

/**
 * Papan pendahulu papan pemuka peserta (KZ-018).
 *
 * Togol "Teams" / "Individuals" (paparan sahaja, tidak disimpan).
 * 5 teratas dengan pingat emas/perak/gangsa untuk kedudukan 1 hingga 3,
 * baris saya ditonjolkan, dan baris saya tetap muncul di bawah dengan
 * pemisah apabila berada di luar 5 teratas. Tiada emel atau id pengguna
 * lain dipaparkan; hanya nama paparan daripada view markah.
 */

import { useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { atas5DenganSaya, inisial, type BarisPendahulu } from "@/lib/papanPemukaPeserta";

/** Baris markah ternormalisasi yang dibina oleh halaman. */
export type BarisSkor = { id: string; label: string; skor: number };

const MEDAL = ["bg-amber-400 text-white", "bg-slate-300 text-white", "bg-orange-500 text-white"];
const PALET_INISIAL = [
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-700",
];

function Baris({ b, i, labelSaya }: { b: BarisPendahulu<BarisSkor>; i: number; labelSaya: string }) {
  const r = b.baris;
  return (
    <div
      className={`flex items-center gap-3 px-5 py-3.5 ${i > 0 ? "t-row" : ""} ${
        b.saya ? "bg-violet-50 border border-violet-200 rounded-xl" : ""
      }`}
    >
      <span
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
          b.kedudukan <= 3 ? MEDAL[b.kedudukan - 1] : "bg-[#F4F4F6] text-ink-muted"
        }`}
      >
        {b.kedudukan}
      </span>
      <span
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs ${
          PALET_INISIAL[i % PALET_INISIAL.length]
        }`}
        aria-hidden="true"
      >
        {inisial(r.label)}
      </span>
      <span className="flex-1 min-w-0 text-[15px] text-ink truncate">
        {r.label}
        {b.saya && <span className="ml-2 text-xs font-medium text-brand-purple">{labelSaya}</span>}
      </span>
      <span className="text-sm font-semibold text-ink tabular-nums whitespace-nowrap">
        {r.skor.toLocaleString()} pts
      </span>
    </div>
  );
}

export default function PanelPendahulu({
  barisPasukan,
  barisIndividu,
  myTeamId,
  myUserId,
  defaultMod,
  loading,
}: {
  barisPasukan: BarisSkor[];
  barisIndividu: BarisSkor[];
  myTeamId: string | null;
  myUserId: string | null;
  /** Mod lalai ikut scoring_mode kelas. */
  defaultMod: "pasukan" | "individu";
  loading: boolean;
}) {
  // Togol paparan sahaja; tidak disimpan antara muatan halaman.
  const [mod, setMod] = useState<"pasukan" | "individu">(defaultMod);
  const senarai = mod === "pasukan" ? barisPasukan : barisIndividu;
  const myId = mod === "pasukan" ? myTeamId : myUserId;
  const labelSaya = mod === "pasukan" ? "Your team" : "You";
  const hasil = atas5DenganSaya(senarai, (r) => r.id, (r) => r.skor, myId);

  return (
    <div className="card rounded-2xl p-5 min-w-[300px] flex-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" aria-hidden="true" />
          <span className="section-title">Leaderboard</span>
        </div>
        <div className="inline-flex rounded-xl border border-hairline bg-[#F7F7FA] p-1">
          <button
            type="button"
            aria-pressed={mod === "pasukan"}
            onClick={() => setMod("pasukan")}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
              mod === "pasukan" ? "bg-white text-brand-purple shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            Teams
          </button>
          <button
            type="button"
            aria-pressed={mod === "individu"}
            onClick={() => setMod("individu")}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
              mod === "individu" ? "bg-white text-brand-purple shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            Individuals
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-[#F4F4F6] animate-pulse" />
          ))}
        </div>
      ) : hasil.atas.length === 0 ? (
        <p className="text-sm text-ink-muted py-6">
          {mod === "pasukan" ? "No team scores yet for this class." : "No individual scores yet for this class."}
        </p>
      ) : (
        <div className="mt-4">
          <div className="space-y-2">
            {hasil.atas.map((b, i) => (
              <Baris key={b.baris.id} b={b} i={i} labelSaya={labelSaya} />
            ))}
          </div>
          {/* Saya di luar 5 teratas: pemisah, kemudian baris saya. */}
          {hasil.terpisah && hasil.saya && (
            <>
              <div className="my-2 border-t border-dashed border-hairline" aria-hidden="true" />
              <Baris b={hasil.saya} i={0} labelSaya={labelSaya} />
            </>
          )}
        </div>
      )}

      <Link href="/participant/leaderboard" className="btn-quiet text-brand-purple mt-3">
        View all
      </Link>
    </div>
  );
}