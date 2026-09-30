"use client";

/**
 * Kad Stat ringkas (asal dalam halaman analytics, V2-014b dipindahkan ke
 * sini supaya bahagian Class pulse dan bahagian penggunaan berkongsi
 * bentuk yang sama). Nombor besar tabular, satu aksen violet.
 */

export default function Stat({
  icon,
  label,
  value,
  hint,
  tone = "violet",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "violet" | "green" | "rose";
}) {
  const ring = tone === "green" ? "bg-[#E3F5EA] text-[#2E7D4F]"
             : tone === "rose" ? "bg-[#FDEBEA] text-[#C0392B]"
             : "bg-[#EAE6FC] text-brand-purple";
  return (
    <div className="card flex items-center gap-4">
      <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${ring}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">{value}</div>
        <div className="text-sm text-ink-muted mt-1.5">{label}</div>
        {hint && <div className="text-xs text-ink-faint mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}