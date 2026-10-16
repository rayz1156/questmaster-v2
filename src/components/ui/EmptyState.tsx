import type { ReactNode } from "react";
import { WARNA_KIT, type WarnaKit } from "./Button";
import Button from "./Button";

/**
 * Keadaan kosong kit UI (KZ-021): ikon bulat 64px latar dim,
 * tajuk 16px 700, teks 14px lembut, butang utama (pilihan).
 */
export default function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
  href,
  warna = "purple",
  className = "",
}: {
  icon: ReactNode;
  title: string;
  text?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
  warna?: WarnaKit;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center text-center py-10 px-6 ${className}`.trim()}>
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: WARNA_KIT[warna].dim, color: WARNA_KIT[warna].teks }}
      >
        {icon}
      </span>
      <h3 className="text-[16px] font-bold text-ink mt-4">{title}</h3>
      {text != null && <p className="text-[14px] text-ink-faint mt-1 max-w-sm">{text}</p>}
      {actionLabel && (onAction || href) && (
        <Button className="mt-5" onClick={onAction} href={href} size="lg">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
