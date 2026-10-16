import type { ReactNode } from "react";

/**
 * Avatar kit UI (KZ-021): bulat, latar lembut palet indeks + inisial.
 * sm 32px/12px, lalai 40px/14px 500 ls 0.84px, lg 80px/28px.
 * AvatarGroup: avatar bertindih dengan sisa "+12" kelabu.
 */

import { inisial, warnaIndeks } from "@/lib/uiKit";

export type AvatarSize = "sm" | "md" | "lg";

const SAIZ_AVATAR: Record<AvatarSize, { kotak: string; teks: string }> = {
  sm: { kotak: "h-8 w-8", teks: "text-[12px]" },
  md: { kotak: "h-10 w-10", teks: "text-[14px] tracking-[0.84px]" },
  lg: { kotak: "h-20 w-20", teks: "text-[28px]" },
};

export default function Avatar({
  name,
  size = "md",
  /** Indeks baris untuk palet; lalai 0 (ungu). */
  index = 0,
  className = "",
}: {
  name: string;
  size?: AvatarSize;
  index?: number;
  className?: string;
}) {
  const s = SAIZ_AVATAR[size];
  const w = warnaIndeks(index);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium ${s.kotak} ${s.teks} ${className}`.trim()}
      style={{ backgroundColor: w.latar, color: w.teks }}
    >
      {inisial(name)}
    </span>
  );
}

export function AvatarGroup({
  names,
  max = 5,
  size = "sm",
  className = "",
}: {
  names: string[];
  /** Bilangan avatar yang dipaparkan; sisanya menjadi "+N". */
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  const ditunjuk = names.slice(0, max);
  const sisa = names.length - ditunjuk.length;
  const s = SAIZ_AVATAR[size];
  return (
    <span className={`inline-flex items-center ${className}`.trim()} aria-hidden="true">
      {ditunjuk.map((n, i) => (
        <span
          key={`${n}-${i}`}
          className="rounded-full ring-2 ring-white"
          style={{ marginLeft: i === 0 ? 0 : -8 }}
        >
          <Avatar name={n} size={size} index={i} />
        </span>
      ))}
      {sisa > 0 && (
        <span
          className={`inline-flex items-center justify-center rounded-full bg-[#eff1f5] text-ink-faint font-medium ring-2 ring-white ${s.kotak} ${s.teks}`}
          style={{ marginLeft: -8 }}
        >
          +{sisa}
        </span>
      )}
    </span>
  );
}

/** Slot avatar bebas (contoh: gambar sebenar) untuk katalog. */
export function AvatarSlot({ children }: { children: ReactNode }) {
  return <span className="inline-flex shrink-0">{children}</span>;
}
