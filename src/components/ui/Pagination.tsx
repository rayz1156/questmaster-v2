"use client";

import { senaraiMukaSurat } from "@/lib/uiKit";

/**
 * Penomboran kit UI (KZ-021): kotak 36px sempadan #e5e9f2,
 * "Prev 1 2 ... 6 7 Next" di kiri. Bentuk "PAGE 1 OF N" diwujudkan
 * oleh pemanggil (DataTable) atau komponen ini melalui `paparLabel`.
 */

export default function Pagination({
  halaman,
  jumlah,
  onHalaman,
  className = "",
}: {
  /** Halaman semasa, bermula 1. */
  halaman: number;
  /** Jumlah muka surat. */
  jumlah: number;
  onHalaman: (h: number) => void;
  className?: string;
}) {
  const jum = Math.max(1, Math.floor(jumlah) || 1);
  const senarai = senaraiMukaSurat(halaman, jum);
  const boleh = (h: number) => h >= 1 && h <= jum;

  const kotak =
    "inline-flex h-9 min-w-9 items-center justify-center px-2 rounded-[4px] border border-kz-line bg-white text-[13px] font-medium text-ink-muted transition hover:text-ink";
  const aktifKotak =
    "inline-flex h-9 min-w-9 items-center justify-center px-2 rounded-[4px] bg-brand-purple text-white text-[13px] font-bold";

  return (
    <nav aria-label="Pagination" className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      <button
        type="button"
        className={kotak}
        disabled={!boleh(halaman - 1)}
        onClick={() => onHalaman(halaman - 1)}
        aria-label="Previous page"
      >
        Prev
      </button>
      {senarai.map((m, i) =>
        m === null ? (
          <span key={`e${i}`} className="px-1 text-[13px] text-ink-faint" aria-hidden="true">
            ...
          </span>
        ) : (
          <button
            key={m}
            type="button"
            aria-current={m === halaman ? "page" : undefined}
            className={m === halaman ? aktifKotak : kotak}
            onClick={() => onHalaman(m)}
          >
            {m}
          </button>
        ),
      )}
      <button
        type="button"
        className={kotak}
        disabled={!boleh(halaman + 1)}
        onClick={() => onHalaman(halaman + 1)}
        aria-label="Next page"
      >
        Next
      </button>
    </nav>
  );
}

/** Label "PAGE 1 OF 12" gaya KZ-DS-v3 (nombor dalam kotak pilih). */
export function PageOf({ halaman, jumlah }: { halaman: number; jumlah: number }) {
  return (
    <span className="text-[11px] uppercase tracking-[1.4px] text-ink-faint flex items-center gap-1.5">
      Page
      <span className="inline-flex h-7 items-center rounded-[4px] border border-kz-line bg-white px-2 text-[11px] font-bold text-ink">
        {halaman}
      </span>
      of {jumlah}
    </span>
  );
}
