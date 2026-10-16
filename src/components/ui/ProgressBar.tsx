/**
 * Bar kemajuan kit UI (KZ-021): tinggi 6px, latar #e5e9f2, bar ungu
 * (atau warna status), sudut penuh.
 */

import { WARNA_KIT, type WarnaKit } from "./Button";

export default function ProgressBar({
  value,
  max = 100,
  warna = "purple",
  label,
  className = "",
}: {
  value: number;
  max?: number;
  warna?: WarnaKit;
  /** Label kebolehcapaian, wajib supaya pembaca skrin tahu maksud bar. */
  label: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`h-1.5 w-full rounded-full bg-kz-line overflow-hidden ${className}`.trim()}
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${pct}%`, backgroundColor: WARNA_KIT[warna].pejal }}
      />
    </div>
  );
}
