"use client";

/**
 * Score distribution (bahagian C): histogram bar SVG ringan tanpa pustaka
 * baharu. Togol segmen Total / Activities / Live Quiz; setiap bar membawa
 * tooltip "from-to: N learners". Bin kosong kekal dipapar sebagai ruang
 * supaya bentuk agihan tidak berubah antara segmen.
 */
import { useState } from "react";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { terjemahBilangan } from "@/lib/i18n";
import type { AgihanInsights } from "@/lib/insightsKelas";

type Segmen = "total" | "task" | "live";

// Label segmen datang daripada kamus supaya ikut bahasa pengguna.
const SEGMEN: Segmen[] = ["total", "task", "live"];

export default function Agihan({ agihan }: { agihan: AgihanInsights }) {
  const { t, bahasa } = useBahasa();
  const LABEL_SEGMEN: Record<Segmen, string> = {
    total: t("insights.agihan.segTotal"),
    task: t("insights.agihan.segActivities"),
    live: t("insights.agihan.segLive"),
  };
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
        <h2 className="section-title">{t("insights.agihan.title")}</h2>
        <div className="flex items-center gap-1 border border-hairline rounded-full p-1">
          {SEGMEN.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSegmen(s)}
              className={`text-sm px-3 py-1 rounded-full ${
                segmen === s
                  ? "bg-[#EAE6FC] text-brand-purple"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {LABEL_SEGMEN[s]}
            </button>
          ))}
        </div>
      </div>

      {bins.length === 0 ? (
        <p className="text-sm text-ink-muted mt-3">{t("insights.agihan.noScores")}</p>
      ) : (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-48 mt-3"
          role="img"
          aria-label={t("insights.agihan.histogramAria")}
        >
          {bins.map((b, i) => {
            const tinggi = (b.count / max) * (h - 2 * pad);
            const x = pad + i * ((w - 2 * pad) / bins.length) + 3;
            return (
              <g key={`${b.from}-${b.to}`}>
                <title>
                  {terjemahBilangan(
                    bahasa,
                    "insights.agihan.tooltipOne",
                    "insights.agihan.tooltipOther",
                    b.count,
                    { dari: b.from, hingga: b.to, n: b.count },
                  )}
                </title>
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