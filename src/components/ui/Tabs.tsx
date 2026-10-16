"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tab kit UI (KZ-021, gaya nav-tabs): 14px 700, teks #526484,
 * aktif #854fff dengan garis bawah 3px, jarak antara tab 32px,
 * padding 16px 0, garis dasar #dbdfea.
 */

export type TabItem = {
  label: string;
  href?: string;
  /** Awalan laluan tambahan yang dikira aktif untuk tab ini. */
  match?: string[];
  /**
   * Tab keadaan (KZ-022): bila ada, render butang bukan pautan.
   * `aktif` menentukan kariah aktif.
   */
  onSelect?: () => void;
  /** Kariah ini aktif (untuk tab keadaan). */
  aktif?: boolean;
};

export default function Tabs({ items, className = "" }: { items: TabItem[]; className?: string }) {
  const pathname = usePathname();
  const here = (href: string) => pathname === href || !!pathname?.startsWith(href + "/");
  const aktif = (t: TabItem) =>
    t.onSelect != null ? !!t.aktif : t.href != null && (here(t.href) || (t.match || []).some(here));

  return (
    <div
      role="tablist"
      aria-label="Tabs"
      className={`flex items-center gap-8 border-b border-hairline overflow-x-auto ${className}`.trim()}
    >
      {items.map((t) => {
        const on = aktif(t);
        const isi = (
          <>
            {t.label}
            {on && (
              <span
                aria-hidden="true"
                className="absolute left-0 right-0 bottom-[-1px] h-[3px] rounded-full bg-brand-purple"
              />
            )}
          </>
        );
        const kelas = `relative shrink-0 py-4 text-[14px] font-bold transition ${
          on ? "text-brand-purple" : "text-ink-muted hover:text-ink"
        }`;
        if (t.onSelect != null) {
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={t.onSelect}
              className={kelas}
            >
              {isi}
            </button>
          );
        }
        return (
          <Link
            key={t.href}
            href={t.href ?? "#"}
            role="tab"
            aria-selected={on}
            className={kelas}
          >
            {isi}
          </Link>
        );
      })}
    </div>
  );
}
