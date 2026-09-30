"use client";

/**
 * Progress (bahagian E): "Most improved" lima teratas mengikut perubahan pct
 * antara separuh trend (kiraMostImproved) dengan sparkline kecil, diikuti
 * jadual semua peserta dengan sparkline trend yang boleh disusun ikut
 * Name / Total / Accuracy. Sparkline ialah SVG polyline ringkas; laluan
 * dikira oleh laluanSparkline supaya geometri diuji selftest.
 */
import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import type { PelajarInsights, TrendTitik } from "@/lib/insightsKelas";
import { formatMata } from "@/lib/markahPeserta";
import { kiraMostImproved, laluanSparkline } from "@/lib/insightsUi";

type KunciSusun = "nama" | "total" | "accuracy";

/** Sparkline 96x28; NULL dilangkau di dalam laluanSparkline. */
function Sparkline({ titik }: { titik: readonly TrendTitik[] }) {
  const jalan = laluanSparkline(titik.map((t) => t.pct));
  if (jalan === null) return <span className="text-ink-faint text-sm">-</span>;
  return (
    <svg viewBox="0 0 96 28" className="w-24 h-7" aria-hidden>
      <polyline fill="none" stroke="#7057D9" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={jalan} />
    </svg>
  );
}

export default function Progres({
  students,
}: {
  students: readonly PelajarInsights[];
}) {
  const [susun, setSusun] = useState<{ kunci: KunciSusun; arah: 1 | -1 }>({
    kunci: "total",
    arah: -1,
  });

  const improved = useMemo(() => kiraMostImproved(students, 5), [students]);

  const baris = useMemo(() => {
    const salin = [...students];
    salin.sort((a, b) => {
      let d = 0;
      if (susun.kunci === "nama") {
        d = String(a.name ?? "").localeCompare(String(b.name ?? "")) || (a.user_id < b.user_id ? -1 : 1);
      } else if (susun.kunci === "total") {
        d = a.total_score - b.total_score;
      } else {
        // Ketepatan NULL (tiada jawapan) sentiasa paling bawah.
        const av = a.accuracy_pct ?? -1;
        const bv = b.accuracy_pct ?? -1;
        d = av - bv;
      }
      return d * susun.arah;
    });
    return salin;
  }, [students, susun]);

  const klikKepala = (kunci: KunciSusun) => {
    setSusun((s) =>
      s.kunci === kunci
        ? { kunci, arah: (s.arah * -1) as 1 | -1 }
        : { kunci, arah: kunci === "nama" ? 1 : -1 },
    );
  };

  const Panah = ({ kunci }: { kunci: KunciSusun }) =>
    susun.kunci === kunci ? (
      <span className="text-brand-purple">{susun.arah === 1 ? "↑" : "↓"}</span>
    ) : null;

  return (
    <section className="space-y-4">
      {improved.length > 0 && (
        <div className="surface p-5">
          <h2 className="section-title">Most improved</h2>
          <p className="text-sm text-ink-muted mt-0.5">
            Second half of Live Quiz history compared with the first.
          </p>
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {improved.map(({ pelajar, delta }) => (
              <li key={pelajar.user_id} className="border border-hairline rounded-xl p-3">
                <div className="text-sm text-ink truncate">{pelajar.name ?? "Unnamed learner"}</div>
                <div className="flex items-center gap-1 text-xs font-semibold text-[#2E7D4F] mt-0.5">
                  <TrendingUp className="w-3.5 h-3.5" /> +{delta.toFixed(0)}% average score
                </div>
                <div className="mt-1.5">
                  <Sparkline titik={pelajar.trend} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="surface p-5 overflow-x-auto">
        <h2 className="section-title">Trend by learner</h2>
        <table className="w-full text-sm mt-3 min-w-[480px]">
          <thead>
            <tr className="text-left text-ink-faint">
              <th className="py-2 pr-3 font-medium">
                <button type="button" className="hover:text-ink" onClick={() => klikKepala("nama")}>
                  Name <Panah kunci="nama" />
                </button>
              </th>
              <th className="py-2 px-3 font-medium text-right">
                <button type="button" className="hover:text-ink" onClick={() => klikKepala("total")}>
                  Total <Panah kunci="total" />
                </button>
              </th>
              <th className="py-2 px-3 font-medium text-right">
                <button type="button" className="hover:text-ink" onClick={() => klikKepala("accuracy")}>
                  Accuracy <Panah kunci="accuracy" />
                </button>
              </th>
              <th className="py-2 pl-3 font-medium text-right">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {baris.map((s) => (
              <tr key={s.user_id}>
                <td className="py-2.5 pr-3 text-ink truncate max-w-[180px]">
                  {s.name ?? "Unnamed learner"}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink">
                  {formatMata(s.total_score)}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink-muted">
                  {s.accuracy_pct === null ? "-" : `${Math.round(s.accuracy_pct)}%`}
                </td>
                <td className="py-2.5 pl-3 text-right">
                  <Sparkline titik={s.trend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}