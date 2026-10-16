"use client";

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import Button from "./Button";
import Dropdown from "./Dropdown";

/**
 * Kepala halaman kit UI (KZ-021, nilai KZ-DS-v3).
 *
 * Padding bawah 28px. Tajuk 28px 700 ls -0.84px #364a63, atau varian
 * breadcrumb: "Students / " + nama berwarna #854fff berat 400.
 * Keterangan 14px #8094ae. Kanan: butang garis + butang utama.
 *
 * Mod telefon: butang utama menjadi butang ikon sahaja (44px) dan
 * tindakan lain masuk ke menu "..." (toggle-expand).
 */

export type PageHeadAction = {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
};

export default function PageHead({
  /** Tajuk penuh, ATAU guna `crumb` + `name` untuk varian breadcrumb. */
  title,
  crumb,
  name,
  description,
  /** Tindakan sekunder (butang garis di desktop, menu "..." di telefon). */
  secondaryActions = [],
  /** Slot butang bebas (desktop sahaja), sebagai alternatif kepada senarai. */
  actions,
  /** Butang utama; di telefon menjadi butang ikon 44px. */
  primaryAction,
  primaryLabel,
  primaryIcon,
  onPrimary,
  primaryHref,
  className = "",
}: {
  title?: ReactNode;
  crumb?: string;
  name?: string;
  description?: ReactNode;
  secondaryActions?: PageHeadAction[];
  /** Antara lama: hantar `actions` bebas untuk butang penuh. */
  actions?: ReactNode;
  primaryAction?: PageHeadAction;
  primaryLabel?: string;
  primaryIcon?: ReactNode;
  onPrimary?: () => void;
  primaryHref?: string;
  className?: string;
}) {
  const utama: PageHeadAction | null =
    primaryAction ?? (primaryLabel ? { label: primaryLabel, icon: primaryIcon, onSelect: onPrimary, href: primaryHref } : null);

  const tajuk =
    crumb && name != null ? (
      <h1 className="text-[28px] font-bold tracking-[-0.84px] text-ink leading-tight">
        <span className="text-ink font-normal">{crumb} / </span>
        <span className="text-brand-purple font-normal">{name}</span>
      </h1>
    ) : (
      <h1 className="text-[28px] font-bold tracking-[-0.84px] text-ink leading-tight">{title}</h1>
    );

  return (
    <div className={`pb-7 flex flex-wrap items-start justify-between gap-4 ${className}`.trim()}>
      <div className="min-w-0">
        {tajuk}
        {description != null && <p className="text-[14px] text-ink-faint mt-1">{description}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Desktop: semua tindakan sebagai butang penuh. */}
        <div className="hidden sm:flex items-center gap-2">
          {secondaryActions.map((a, i) => (
            <Button key={i} variant="outline" onClick={a.onSelect} href={a.href}>
              {a.icon}
              {a.label}
            </Button>
          ))}
          {actions}
          {utama && (
            <Button onClick={utama.onSelect} href={utama.href}>
              {utama.icon}
              {utama.label}
            </Button>
          )}
        </div>

        {/* Telefon: butang utama jadi ikon sahaja (44px), lain masuk "...". */}
        <div className="sm:hidden flex items-center gap-2">
          {utama && (
            <Button variant="icon" size="lg" onClick={utama.onSelect} href={utama.href} ariaLabel={utama.label}>
              {utama.icon}
            </Button>
          )}
          {secondaryActions.length > 0 && (
            <Dropdown
              items={secondaryActions.map((a) => ({
                label: a.label,
                icon: a.icon,
                onSelect: a.onSelect ?? (() => {}),
              }))}
              label="More actions"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-label="More actions"
                  className="flex h-11 w-11 items-center justify-center rounded-[4px] text-ink-muted hover:bg-[#ebeef2] transition"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
