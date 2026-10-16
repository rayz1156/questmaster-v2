"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Dropdown kit UI (KZ-021): putih, sudut 4px, bayang dropdown
 * `0 3px 12px 1px rgba(44,55,130,.15)`, item 13px 500 padding 9px 20px,
 * ikon 16px kiri, pemisah #e5e9f2.
 *
 * Kebolehcapaian: butang pencetus dengan aria-haspopup/aria-expanded, menu
 * role="menu", item role="menuitem", tutup pada Escape dan klik luar,
 * anak panah Atas/Bawah gerak fokus antara item, fokus kembali kepada
 * pencetus selepas tutup.
 */

export type DropdownItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  /** Letak di bawah pemisah dan warnakan merah. */
  danger?: boolean;
  disabled?: boolean;
};

export default function Dropdown({
  trigger,
  items,
  label = "More actions",
  /** Sisi menu relatif kepada pencetus. */
  align = "right",
  className = "",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: DropdownItem[];
  label?: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /** Fokus pencetus (butang pertama di dalam slot trigger). */
  const fokusPencetus = () => {
    const btn = triggerRef.current?.querySelector<HTMLElement>("button, a");
    btn?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        fokusPencetus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    // Fokuskan item pertama yang aktif apabila menu dibuka.
    const t = window.setTimeout(() => {
      const fokus = menuRef.current?.querySelector<HTMLElement>("button:not(:disabled)");
      fokus?.focus();
    }, 0);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.clearTimeout(t);
    };
  }, [open]);

  const gerakFokus = (arah: 1 | -1) => {
    const butang = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") || [],
    );
    if (butang.length === 0) return;
    const semasa = document.activeElement as HTMLElement | null;
    const i = butang.indexOf(semasa ?? butang[0]);
    const next = butang[(i + arah + butang.length) % butang.length];
    next?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      gerakFokus(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      gerakFokus(-1);
    }
  };

  const normal = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);

  const Baris = ({ it }: { it: DropdownItem }) => (
    <button
      type="button"
      role="menuitem"
      disabled={it.disabled}
      onClick={() => {
        setOpen(false);
        fokusPencetus();
        it.onSelect();
      }}
      className={`w-full flex items-center gap-2.5 px-5 py-[9px] text-[13px] font-medium text-left transition disabled:opacity-40 ${
        it.danger ? "text-kz-down hover:bg-[#fce4e2]" : "text-ink-muted hover:bg-canvas"
      }`}
    >
      {it.icon && (
        <span className={it.danger ? "text-kz-down" : "text-ink-faint"}>{it.icon}</span>
      )}
      {it.label}
    </button>
  );

  return (
    <div className={`relative ${className}`.trim()} ref={wrapRef} onKeyDown={onKeyDown}>
      <span ref={triggerRef} className="inline-flex">
        {trigger({
          open,
          toggle: () => setOpen((v) => !v),
        })}
      </span>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className={`absolute z-50 mt-1 min-w-[180px] bg-white rounded-[4px] py-1.5 ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ boxShadow: "0 3px 12px 1px rgba(44, 55, 130, 0.15)" }}
        >
          {normal.map((it, i) => (
            <Baris key={i} it={it} />
          ))}
          {danger.length > 0 && normal.length > 0 && (
            <div className="h-px bg-kz-line my-1" />
          )}
          {danger.map((it, i) => (
            <Baris key={`d${i}`} it={it} />
          ))}
        </div>
      )}
    </div>
  );
}
