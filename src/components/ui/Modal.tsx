"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Modal kit UI (KZ-021): sudut 5px, kepala 18px 700 + butang tutup ikon,
 * badan padding 28px (desktop 40px), kaki kanan butang. Fokus terperangkap
 * (Tab kitar dalam modal), Escape menutup, latar klik menutup, fokus
 * kembali kepada elemen sebelum dibuka.
 */

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Kaki: butang disusun ke kanan oleh pemanggil atau di sini. */
  footer?: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const sebelumRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    sebelumRef.current = document.activeElement as HTMLElement | null;
    // Fokus elemen pertama boleh fokus dalam modal (tutup dulu, kemudian isi).
    const t = window.setTimeout(() => {
      const fokus = panelRef.current?.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      // Butang tutup ialah elemen pertama; fokuskan dia supaya Escape jelas.
      (fokus && fokus.length > 0 ? fokus[0] : panelRef.current)?.focus();
    }, 0);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", esc);
    const badan = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = badan;
      sebelumRef.current?.focus?.();
    };
  }, [open, onClose]);

  // Fokus terperangkap: Tab terakhir kembali ke pertama dan sebaliknya.
  const onTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const fokus = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      ) || [],
    ).filter((el) => !el.hasAttribute("disabled"));
    if (fokus.length === 0) return;
    const pertama = fokus[0];
    const terakhir = fokus[fokus.length - 1];
    const semasa = document.activeElement as HTMLElement | null;
    if (e.shiftKey && semasa === pertama) {
      e.preventDefault();
      terakhir.focus();
    } else if (!e.shiftKey && semasa === terakhir) {
      e.preventDefault();
      pertama.focus();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Dialog"}
        tabIndex={-1}
        onKeyDown={onTab}
        className={`relative w-full max-w-lg bg-white rounded-[5px] outline-none ${className}`.trim()}
        style={{ boxShadow: "0 3px 12px 1px rgba(44, 55, 130, 0.15)" }}
      >
        <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-0 sm:px-10 sm:pt-7">
          <h2 className="text-[18px] font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-faint hover:bg-canvas hover:text-ink transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 sm:px-10 sm:py-7">{children}</div>
        {footer != null && (
          <div className="flex justify-end gap-2 px-6 pb-6 sm:px-10 sm:pb-8">{footer}</div>
        )}
      </div>
    </div>
  );
}
