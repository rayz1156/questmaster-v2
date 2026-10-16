import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Kad kit UI (KZ-021, nilai KZ-DS-v3 bahagian 2).
 *
 * Card: putih, sudut 4px, tiada sempadan, bayang kad, padding dalaman 24px.
 * CardHead: tajuk 16.8px 700 ls -0.17px #364a63, subtajuk 13px #8094ae,
 * slot kanan (pautan "View All" 13px ungu / butang "..." dsb.).
 * CardSection: bahagian dipisah garis #e5e9f2; baris senarai padding 16px 24px.
 */

export function Card({
  children,
  className = "",
  /** Kad tanpa padding (untuk jadual `surface`). */
  padat = false,
}: {
  children: ReactNode;
  className?: string;
  padat?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-[4px] shadow-card ${padat ? "" : "p-6"} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function CardHead({
  title,
  subtitle,
  right,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Slot kanan: pautan "View All", pemilih kecil atau butang "...". */
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${className}`.trim()}>
      <div className="min-w-0">
        <h3 className="text-[16.8px] font-bold tracking-[-0.17px] text-ink leading-snug truncate">
          {title}
        </h3>
        {subtitle != null && (
          <p className="text-[13px] text-ink-faint mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {right != null && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  );
}

/**
 * Pautan "View All" standard kepala kad: 13px ungu.
 */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[13px] font-medium text-brand-purple hover:underline">
      {children}
    </Link>
  );
}

export function CardSection({
  children,
  className = "",
  /** Benar untuk baris senarai (padding 16px 24px, dipisah #e5e9f2). */
  baris = false,
}: {
  children: ReactNode;
  className?: string;
  baris?: boolean;
}) {
  return (
    <div
      className={`border-t border-kz-line ${baris ? "px-6 py-4" : "p-6"} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export default Card;
