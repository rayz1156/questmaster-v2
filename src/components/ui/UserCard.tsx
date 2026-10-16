import type { ReactNode } from "react";
import Avatar from "./Avatar";
import Button from "./Button";

/**
 * Kad pengguna kit UI (KZ-021): avatar lg di tengah, nama, sub,
 * butang kecil, statistik 3 lajur di bawah.
 */

export default function UserCard({
  name,
  subtitle,
  actionLabel,
  onAction,
  href,
  index = 0,
  stats,
  className = "",
}: {
  name: string;
  subtitle?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
  index?: number;
  /** Statistik 3 lajur: label + nilai. */
  stats?: { label: ReactNode; value: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-[4px] shadow-card p-6 flex flex-col items-center text-center ${className}`.trim()}
    >
      <Avatar name={name} size="lg" index={index} />
      <h3 className="text-[16.8px] font-bold text-ink mt-3">{name}</h3>
      {subtitle != null && <p className="text-[13px] text-ink-faint mt-0.5">{subtitle}</p>}
      {actionLabel && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onAction} href={href}>
          {actionLabel}
        </Button>
      )}
      {stats && stats.length > 0 && (
        <div className="grid grid-cols-3 w-full mt-6 pt-4 border-t border-kz-line">
          {stats.map((s, i) => (
            <div key={i}>
              <div className="text-[24px] font-normal leading-none text-ink">{s.value}</div>
              <div className="text-[13px] text-ink-faint mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
