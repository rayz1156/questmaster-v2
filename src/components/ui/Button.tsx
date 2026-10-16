import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Butang kit UI (KZ-021, nilai KZ-DS-v3 bahagian 2).
 *
 * 13px tebal 700 ls 0.26px, tinggi 36px, padding 7px 18px, sudut 4px.
 * Variasi: primary (#854fff), outline (putih + sempadan #dbdfea),
 * ghost (teks sahaja), icon (36x36), dim (latar lembut warna).
 * Saiz: sm (32px), md (36px, lalai), lg (44px untuk aksi utama telefon).
 *
 * `href` memulangkan pautan dengan rupa butang (corak asChild).
 */

export type WarnaKit = "purple" | "green" | "red" | "yellow" | "info" | "gray" | "blue" | "dark";

/** Pasangan warna pejal (utama) dan latar lembutnya (dim) ikut KZ-DS-v3. */
export const WARNA_KIT: Record<WarnaKit, { pejal: string; dim: string; teks: string }> = {
  purple: { pejal: "#854fff", dim: "#ebe2ff", teks: "#854fff" },
  green: { pejal: "#1ee0ac", dim: "#e6fcf6", teks: "#1ee0ac" },
  red: { pejal: "#e85347", dim: "#fce4e2", teks: "#e85347" },
  yellow: { pejal: "#f4bd0e", dim: "#fef6e0", teks: "#f4bd0e" },
  info: { pejal: "#09c2de", dim: "#e0f8fc", teks: "#09c2de" },
  blue: { pejal: "#6576ff", dim: "#e5e9ff", teks: "#6576ff" },
  gray: { pejal: "#8094ae", dim: "#eff1f5", teks: "#8094ae" },
  dark: { pejal: "#1f2b3a", dim: "#eff1f5", teks: "#1f2b3a" },
};

export type ButtonVariant = "primary" | "outline" | "ghost" | "icon" | "dim";
export type ButtonSize = "sm" | "md" | "lg";

const SAIZ: Record<ButtonSize, string> = {
  // sm: 32px.
  sm: "h-8 px-3 text-[12px]",
  // md: 36px, 13px, padding 7px 18px (nilai lalai KZ-DS-v3).
  md: "h-9 px-[18px] py-[7px] text-[13px]",
  // lg: 44px, sasaran sentuh aksi utama pada telefon.
  lg: "h-11 px-6 text-[14px]",
};

function kelasAsas(variant: ButtonVariant, size: ButtonSize, warna: WarnaKit): string {
  const asas =
    "inline-flex items-center justify-center gap-2 font-bold tracking-[0.26px] rounded-[4px] transition select-none";
  const saiz = variant === "icon" ? "h-9 w-9" : SAIZ[size];
  const fokus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple";
  if (variant === "primary") {
    const pejal = warna === "purple" ? "bg-brand-purple hover:bg-[#6b30ff]" : "";
    const latar = warna === "purple" ? "" : `bg-[${WARNA_KIT[warna].pejal}]`;
    return `${asas} ${saiz} ${fokus} text-white disabled:opacity-40 disabled:cursor-not-allowed ${pejal} ${latar}`.trim();
  }
  if (variant === "outline") {
    return `${asas} ${saiz} ${fokus} bg-white border border-hairline text-ink-muted hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed`;
  }
  if (variant === "ghost") {
    return `${asas} ${saiz} ${fokus} text-ink-muted hover:bg-[#ebeef2] disabled:opacity-40`;
  }
  if (variant === "icon") {
    // Ikon: 36x36 tanpa sempadan, teks badan, hover latar #ebeef2.
    return `${asas} ${saiz} ${fokus} text-ink-muted hover:bg-[#ebeef2] disabled:opacity-40`;
  }
  // dim: latar lembut warna + teks warna.
  const w = WARNA_KIT[warna];
  return `${asas} ${saiz} ${fokus} disabled:opacity-40`;
}

export type ButtonProps = {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Warna untuk primary/dim. Lalai purple. */
  warna?: WarnaKit;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  ariaLabel?: string;
  target?: string;
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  warna = "purple",
  href,
  onClick,
  disabled,
  type = "button",
  className = "",
  ariaLabel,
  target,
}: ButtonProps) {
  // Dim memerlukan gaya dinamik kerana pasangan warna datang daripada peta.
  const gayaDim: React.CSSProperties =
    variant === "dim"
      ? { backgroundColor: WARNA_KIT[warna].dim, color: WARNA_KIT[warna].teks }
      : {};
  const gayaPrimary: React.CSSProperties =
    variant === "primary" && warna !== "purple"
      ? { backgroundColor: WARNA_KIT[warna].pejal }
      : {};
  const gaya = { ...gayaDim, ...gayaPrimary };

  const kelas = `${kelasAsas(variant, size, warna)} ${className}`.trim();
  const ikonSaja = variant === "icon";

  if (href && !disabled) {
    return (
      <Link
        href={href}
        className={kelas}
        style={gaya}
        aria-label={ariaLabel}
        target={target}
        onClick={onClick}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={kelas}
      style={gaya}
      aria-label={ariaLabel}
      aria-hidden={ikonSaja && !ariaLabel ? undefined : undefined}
    >
      {children}
    </button>
  );
}
