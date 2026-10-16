import type { ReactNode } from "react";

/**
 * Alert kit UI (KZ-021): 14px, padding 16px 20px (52px kiri bila ada ikon),
 * sudut 4px. Info: latar #ddebfe sempadan #bbd7fd teks #223e64.
 * Berjaya/amaran/bahaya ikut palet dim KZ-DS-v3.
 */

import { WARNA_KIT } from "./Button";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONA: Record<AlertTone, { bg: string; border: string; teks: string }> = {
  info: { bg: "#ddebfe", border: "#bbd7fd", teks: "#223e64" },
  success: { bg: WARNA_KIT.green.dim, border: WARNA_KIT.green.dim, teks: "#1f2b3a" },
  warning: { bg: WARNA_KIT.yellow.dim, border: WARNA_KIT.yellow.dim, teks: "#1f2b3a" },
  danger: { bg: WARNA_KIT.red.dim, border: WARNA_KIT.red.dim, teks: "#1f2b3a" },
};

export default function Alert({
  tone = "info",
  icon,
  children,
  className = "",
}: {
  tone?: AlertTone;
  /** Ikon menambah padding kiri 52px. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = TONA[tone];
  return (
    <div
      role="alert"
      className={`relative rounded-[4px] border text-[14px] leading-[1.65] py-4 px-5 ${className}`.trim()}
      style={{ backgroundColor: t.bg, borderColor: t.border, color: t.teks }}
    >
      {icon != null && (
        <span
          className="absolute left-4 top-4 flex h-5 w-5 items-center justify-center"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className={icon != null ? "block pl-[52px]" : ""}>{children}</span>
    </div>
  );
}
