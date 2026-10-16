import type { ReactNode } from "react";
import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { InitialTile } from "./Tiles";
import { AvatarGroup } from "./Avatar";
import Badge from "./Badge";
import ProgressBar from "./ProgressBar";
import Dropdown, { type DropdownItem } from "./Dropdown";
import { MoreHorizontal } from "lucide-react";
import { labelMasa } from "@/lib/uiKit";

/**
 * Kad projek kit UI (KZ-021, untuk aktiviti/quest): petak inisial 40px +
 * tajuk 15px 700 + sub 12px; "..." kanan atas; keterangan 14px 2 baris;
 * baris "N Tasks" kiri dan peratus kanan; progres 6px; bawah kumpulan
 * avatar kiri dan lencana masa kanan ("5 Days Left" kuning dim,
 * "Due Tomorrow" merah dim, "Done" hijau dim, lain kelabu dim).
 *
 * Grid 3 lajur (desktop) / 2 (tablet) / 1 (telefon) jarak 28px diuruskan
 * oleh pemanggil dengan kelas ProjectGrid di bawah.
 */

export default function ProjectCard({
  title,
  subtitle,
  description,
  tasksDone,
  tasksTotal,
  progress,
  members,
  daysLeft,
  done,
  badges,
  menuItems,
  menuLabel = "Project actions",
  href,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  description?: ReactNode;
  tasksDone?: number;
  tasksTotal?: number;
  /** Peratus 0-100; jika tiada, dihitung daripada tasks. */
  progress?: number;
  members?: string[];
  /** Sisa hari untuk lencana masa. */
  daysLeft?: number;
  /** Siap: lencana "Done" hijau dim. */
  done?: boolean;
  /** Lencana tambahan baris bawah, kanan, sebelum lencana masa (KZ-022). */
  badges?: ReactNode;
  menuItems?: DropdownItem[];
  menuLabel?: string;
  href?: string;
  className?: string;
}) {
  const pct =
    typeof progress === "number"
      ? progress
      : tasksTotal
        ? Math.round(((tasksDone ?? 0) / tasksTotal) * 100)
        : 0;
  const masa =
    typeof daysLeft === "number" || done
      ? labelMasa(typeof daysLeft === "number" ? daysLeft : 0, !!done)
      : null;

  return (
    <div
      className={`bg-white rounded-[4px] shadow-card p-6 flex flex-col gap-4 ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <InitialTile name={title} index={0} />
        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} className="block">
              <h3 className="text-[15px] font-bold text-ink leading-snug truncate hover:text-brand-purple transition">{title}</h3>
            </Link>
          ) : (
            <h3 className="text-[15px] font-bold text-ink leading-snug truncate">{title}</h3>
          )}
          {subtitle != null && (
            <p className="text-[12px] text-ink-faint truncate">{subtitle}</p>
          )}
        </div>
        {menuItems && (
          <Dropdown
            items={menuItems}
            label={menuLabel}
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={menuLabel}
                className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-[4px] text-ink-faint hover:bg-[#ebeef2] hover:text-ink transition"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          />
        )}
      </div>

      {description != null && (
        <p className="text-[14px] text-ink-muted leading-[1.65] line-clamp-2">{description}</p>
      )}

      {(tasksTotal != null || progress != null) && (
        <>
          <div className="flex items-center justify-between text-[13px]">
            <span className="flex items-center gap-1.5 text-ink-faint">
              <CheckSquare className="w-4 h-4" aria-hidden="true" />
              {tasksTotal != null ? `${tasksDone ?? 0} / ${tasksTotal} Tasks` : `${pct}%`}
            </span>
            <span className="text-ink-muted font-medium">{pct}%</span>
          </div>
          <ProgressBar value={pct} max={100} label={`${title} progress`} />
        </>
      )}

      {(members && members.length > 0) || masa || badges ? (
        <div className="flex items-center justify-between gap-2 mt-auto pt-2">
          {members && members.length > 0 ? (
            <AvatarGroup names={members} max={4} />
          ) : (
            <span />
          )}
          <span className="flex items-center gap-1.5">
            {badges}
            {masa && (
              <Badge variant="dim" warna={masa.warna}>
                {masa.label}
              </Badge>
            )}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Grid kad projek: 3 lajur desktop, 2 tablet, 1 telefon, jarak 28px. */
export function ProjectGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
