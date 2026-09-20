"use client";

/**
 * Menu elipsis untuk satu baris.
 *
 * Sebabnya wujud: butang padam merah pada setiap baris membuatkan mata
 * berhenti pada perkara paling berbahaya dan paling jarang dilakukan. Semua
 * tindakan sekunder masuk ke sini, dan tindakan memusnah diletak di bawah
 * pemisah dengan warna merah hanya pada teksnya.
 */

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  /** Letak di bawah pemisah dan warnakan merah. */
  danger?: boolean;
  disabled?: boolean;
};

export default function RowMenu({
  items,
  label = "More actions",
}: {
  items: RowMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const normal = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);

  const Row = ({ it }: { it: RowMenuItem }) => (
    <button
      disabled={it.disabled}
      onClick={() => { setOpen(false); it.onSelect(); }}
      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition disabled:opacity-40 ${
        it.danger ? "text-[#C0392B] hover:bg-[#FDF3F2]" : "text-ink hover:bg-[#F7F7F9]"
      }`}
    >
      {it.icon && <span className={it.danger ? "text-[#C0392B]" : "text-ink-faint"}>{it.icon}</span>}
      {it.label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-[#F4F4F6] transition"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 bg-white rounded-xl border border-hairline shadow-raised py-1 z-50"
        >
          {normal.map((it, i) => <Row key={i} it={it} />)}
          {danger.length > 0 && normal.length > 0 && <div className="h-px bg-hairline my-1" />}
          {danger.map((it, i) => <Row key={`d${i}`} it={it} />)}
        </div>
      )}
    </div>
  );
}
