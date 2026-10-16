import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

/**
 * StatGroup kit UI (KZ-021): label 14px #526484, nombor 24-28px 400/500
 * #364a63, perubahan 14px hijau/merah dengan anak panah. Anak panah hanya
 * bila ada data perubahan sebenar; jika tiada, tiada anak panah.
 */

export type StatItem = {
  label: ReactNode;
  value: ReactNode;
  /** Perubahan dalam %. Positif hijau, negatif merah. Tiada = tiada anak panah. */
  change?: number;
};

export default function StatGroup({
  stats,
  className = "",
}: {
  stats: StatItem[];
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-6 ${className}`.trim()}>
      {stats.map((s, i) => (
        <div key={i}>
          <div className="text-[14px] text-ink-muted">{s.label}</div>
          <div className="text-[28px] font-normal leading-tight text-ink mt-0.5">{s.value}</div>
          {typeof s.change === "number" && s.change !== 0 && (
            <div
              className={`text-[14px] flex items-center gap-0.5 mt-0.5 ${
                s.change >= 0 ? "text-kz-up" : "text-kz-down"
              }`}
            >
              {s.change >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {Math.abs(s.change)}%
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
