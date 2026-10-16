"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, MoreVertical } from "lucide-react";
import Avatar from "./Avatar";
import Dropdown from "./Dropdown";

/**
 * Susun atur profil kit UI (KZ-021, gaya "Personal Information").
 *
 * Satu kad dibahagi dua. Kiri 290px: kepala (avatar + nama + sub + "⋮"),
 * blok statistik overline 11px huruf besar ls 2.2px + nilai besar ungu,
 * menu pautan dengan ikon 18px (aktif #854fff, chevron kanan), blok
 * "LAST LOGIN" kecil. Kanan: padding 40px, tajuk 24px 700 + keterangan,
 * seksyen "BASICS" bar kelabu #ebeef2 11px huruf besar, DataRow label
 * 14px #8094ae lebar 1/3 + nilai 14px 500 #526484 + pautan kanan.
 *
 * Telefon: kiri menjadi laci (butang "⋮" membuka panel).
 */

export type ProfileMenuItem = {
  label: string;
  href: string;
  /** Ikon 18px. */
  icon: ReactNode;
  match?: string[];
};

export function ProfileLayout({
  name,
  subtitle,
  menuMoreItems,
  stats,
  menu,
  lastLogin,
  children,
  className = "",
}: {
  name: string;
  subtitle?: ReactNode;
  /** Tindakan menu "⋮" kepala kiri. */
  menuMoreItems?: { label: string; onSelect: () => void }[];
  /** Blok statistik: label overline + nilai besar. */
  stats?: { label: string; value: ReactNode }[];
  menu: ProfileMenuItem[];
  lastLogin?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [laci, setLaci] = useState(false);
  const pathname = usePathname();
  const here = (href: string) => pathname === href || !!pathname?.startsWith(href + "/");
  const aktif = (m: ProfileMenuItem) => here(m.href) || (m.match || []).some(here);

  // ===== Panel kiri =====
  const panel = (
    <div className="flex flex-col h-full">
      <div className="p-6 flex items-start gap-3">
        <Avatar name={name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink truncate">{name}</div>
          {subtitle != null && (
            <div className="text-[12px] text-ink-faint truncate">{subtitle}</div>
          )}
        </div>
        {menuMoreItems && menuMoreItems.length > 0 && (
          <Dropdown
            items={menuMoreItems}
            label="Profile actions"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Profile actions"
                className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-[4px] text-ink-faint hover:bg-[#ebeef2] hover:text-ink transition"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            )}
          />
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="px-6 pb-6 grid grid-cols-2 gap-x-4 gap-y-5">
          {stats.map((s, i) => (
            <div key={i}>
              <div className="text-[11px] font-medium uppercase tracking-[2.2px] text-ink-faint">
                {s.label}
              </div>
              <div className="text-[24px] font-normal text-brand-purple leading-tight mt-1">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <nav aria-label="Profile menu" className="px-4 pb-4">
        {menu.map((m) => {
          const on = aktif(m);
          return (
            <Link
              key={m.href}
              href={m.href}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-[14px] transition ${
                on ? "text-brand-purple font-medium" : "text-ink-muted hover:text-ink hover:bg-canvas"
              }`}
            >
              <span className={on ? "text-brand-purple" : "text-ink-faint"}>
                <span className="inline-flex h-[18px] w-[18px] items-center justify-center">
                  {m.icon}
                </span>
              </span>
              <span className="flex-1 truncate">{m.label}</span>
              <ChevronRight
                className={`w-4 h-4 shrink-0 ${on ? "text-brand-purple" : "text-ink-faint"}`}
              />
            </Link>
          );
        })}
      </nav>

      {lastLogin != null && (
        <div className="mt-auto px-6 py-4 border-t border-kz-line text-[11px] uppercase tracking-[2.2px] text-ink-faint">
          Last login
          <div className="text-[13px] tracking-normal normal-case text-ink-muted mt-0.5">
            {lastLogin}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={`bg-white rounded-[4px] shadow-card md:grid md:grid-cols-[290px_1fr] overflow-hidden ${className}`.trim()}>
      {/* ===== Desktop: panel kiri statik ===== */}
      <aside className="hidden md:block border-r border-kz-line">{panel}</aside>

      {/* ===== Telefon: panel kiri jadi laci ===== */}
      <div className="md:hidden px-6 py-4 border-b border-kz-line flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={name} size="sm" />
          <span className="text-[14px] font-bold text-ink truncate">{name}</span>
        </div>
        <button
          type="button"
          onClick={() => setLaci(true)}
          aria-expanded={laci}
          className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-hairline px-3 text-[13px] font-medium text-ink-muted hover:bg-canvas transition"
        >
          <ChevronRight className="w-4 h-4 rotate-90" aria-hidden="true" /> Menu
        </button>
        {laci && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Profile menu">
            <div className="absolute inset-0 bg-black/50" onClick={() => setLaci(false)} aria-hidden="true" />
            <div className="absolute inset-y-0 left-0 w-[290px] max-w-[85vw] bg-white overflow-y-auto">
              {panel}
            </div>
          </div>
        )}
      </div>

      {/* ===== Kanan: kandungan ===== */}
      <div className="p-6 md:p-10 min-w-0">{children}</div>
    </div>
  );
}

export function ProfileMenu() {
  // Menu diuruskan terus oleh ProfileLayout; komponen ini disediakan
  // untuk keserasian senarai komponen KZ-021 (item dihantar melalui
  // prop `menu`). Tidak dirender sendiri.
  return null;
}

/** Seksyen data dalam kanan profil: bar "BASICS" 11px huruf besar. */
export function DataSection({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h4 className="bg-[#ebeef2] text-[11px] font-medium uppercase tracking-[2.2px] text-ink-faint rounded-[3px] px-2.5 py-1.5">
        {title}
      </h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Baris data profil: label 1/3 kiri, nilai, pautan kanan, pemisah. */
export function DataRow({
  label,
  value,
  actionLabel,
  onAction,
  href,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  /** Pautan kanan "Change" atau chevron. */
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
  className?: string;
}) {
  const pautan =
    actionLabel && href ? (
      <Link href={href} className="text-[13px] font-medium text-brand-purple hover:underline">
        {actionLabel}
      </Link>
    ) : actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="text-[13px] font-medium text-brand-purple hover:underline"
      >
        {actionLabel}
      </button>
    ) : null;

  return (
    <div
      className={`flex flex-wrap sm:flex-nowrap items-center gap-2 py-6 px-5 border-b border-kz-line last:border-b-0 ${className}`.trim()}
    >
      <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">{label}</div>
      <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted">{value}</div>
      {pautan && <div className="shrink-0">{pautan}</div>}
    </div>
  );
}
