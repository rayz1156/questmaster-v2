import type { ReactNode } from "react";
import { WARNA_KIT, type WarnaKit } from "./Button";

/**
 * Lencana kit UI (KZ-021): 10.8px 500, padding 0 6px, tinggi 20px, sudut 3px.
 * Variasi: solid (warna + putih), dim (latar lembut + teks warna),
 * dot (teks 12px 500 warna + titik 6px).
 */

export type BadgeVariant = "solid" | "dim" | "dot";

export default function Badge({
  children,
  variant = "dim",
  warna = "purple",
  className = "",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  warna?: WarnaKit;
  className?: string;
}) {
  const w = WARNA_KIT[warna];
  if (variant === "dot") {
    // Dot: 12px 500 teks warna + titik 6px, tiada latar.
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${className}`.trim()}
        style={{ color: w.teks }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: w.pejal }} />
        {children}
      </span>
    );
  }
  const style: React.CSSProperties =
    variant === "solid" ? { backgroundColor: w.pejal, color: "#fff" } : { backgroundColor: w.dim, color: w.teks };
  return (
    <span
      className={`inline-flex items-center h-5 px-1.5 rounded-[3px] text-[10.8px] font-medium whitespace-nowrap ${className}`.trim()}
      style={style}
    >
      {children}
    </span>
  );
}
