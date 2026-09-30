"use client";

/**
 * Score distribution (bahagian C): histogram bar SVG ringan tanpa pustaka
 * baharu. Togol segmen Total / Activities / Live Quiz; setiap bar membawa
 * tooltip "from-to: N learners". Bin kosong kekal dipapar sebagai ruang
 * supaya bentuk agihan tidak berubah antara segmen.
 */
import { useState } from "react";
import type { AgihanInsights } from "@/lib/insightsKelas";

type Segmen = "total" | "task" | "live";

const SEGMEN: { kunci: Segmen; label: string }[] = [
  { kunci: "total", label: "Total" },
  { kunci: "task", label: "Activities" },
  { kunci: "live", label: "Live Quiz" },
];

export default function Agihan({ agihan }: { agihan: AgihanInsights }) {
  const [segmen, setSegmen] = useState<Segmen>("total");
  const bins = agihan[segmen];
  const max = Math.max(1, ...bins.map((b) => b.count));

  // viewBox tetap; bar diagih sekata mengikut bilangan bin.
  const w = 720;
  const h = 180;
  const pad = 24;
  const lebarBar = bins.length > 0 ? (w - 2 * pad) / bins.length - 6 : 0;

  return (
    <section className="surface p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="section-title">Score distribution</h2>
        <div className="flex items-center gap-1 border border-hairline rounded-full p-1">
          {SEGMEN.map((s) => (
            <button
              key={s.kunci}
              type="button"
              onClick={() => setSegmen(s.kunci)}
              className={`text-sm px-3 py-1 rounded-full ${
                segmen === s.kunci
                  ? "bg-[#EAE6FC] text-brand-purple"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {bins.length === 0 ? (
        <p className="text-sm text-ink-muted mt-3">No scores yet.</p>
      ) : (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-48 mt-3"
          role="img"
          aria-label="Histogram of learner scores"
        >
          {bins.map((b, i) => {
            const tinggi = (b.count / max) * (h - 2 * pad);
            const x = pad + i * ((w - 2 * pad) / bins.length) + 3;
            return (
              <g key={`${b.from}-${b.to}`}>
                <title>{`${b.from}-${b.to}: ${b.count} ${b.count === 1 ? "learner" : "learners"}`}</title>
                <rect
                  x={x}
                  y={h - pad - tinggi}
                  width={Math.max(2, lebarBar)}
                  height={Math.max(b.count > 0 ? 2 : 0, tinggi)}
                  rx="3"
                  fill={b.count > 0 ? "#7057D9" : "#EDEEF2"}
                />
                {b.count > 0 && (
                  <text
                    x={x + Math.max(2, lebarBar) / 2}
                    y={h - pad - tinggi - 6}
                    fontSize="11"
                    fill="#6b7280"
                    textAnchor="middle"
                  >
                    {b.count}
                  </text>
                )}
                <text
                  x={x + Math.max(2, lebarBar) / 2}
                  y={h - 8}
                  fontSize="10"
                  fill="#6b7280"
                  textAnchor="middle"
                >
                  {b.from}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}