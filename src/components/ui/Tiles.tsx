import type { ReactNode } from "react";
import { inisial, warnaIndeks } from "@/lib/uiKit";
import Avatar from "./Avatar";

/**
 * Baris senarai kit UI (KZ-021, gaya "Top Courses" / "Top Instructors").
 *
 * InitialTile: petak 40px sudut 4px latar lembut + inisial 2 huruf berwarna
 * (palet indeks: ungu, biru, hijau, kuning, merah, cyan).
 * TileRow: petak + tajuk 14px #364a63 + sub 12px #8094ae; kanan nilai.
 * PersonRow: avatar bulat 40px + nama 14px 700 + sub 12px; kanan nilai.
 * (Emel pengguna lain tidak dipapar sebagai sub: halaman memutuskan apa
 * yang dibenarkan; komponen ini hanya memaparkan apa yang diberikan.)
 */

export function InitialTile({
  name,
  index = 0,
  className = "",
}: {
  name: string;
  index?: number;
  className?: string;
}) {
  const w = warnaIndeks(index);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] text-[13px] font-medium ${className}`.trim()}
      style={{ backgroundColor: w.latar, color: w.teks }}
    >
      {inisial(name)}
    </span>
  );
}

export function TileRow({
  title,
  subtitle,
  value,
  valueSub,
  index = 0,
  href,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Nilai kanan 14px #364a63. */
  value?: ReactNode;
  /** Sub nilai kanan 12px. */
  valueSub?: ReactNode;
  index?: number;
  href?: string;
  className?: string;
}) {
  const isi = (
    <>
      <InitialTile name={typeof title === "string" ? title : "???"} index={index} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-ink font-medium truncate">{title}</span>
        {subtitle != null && (
          <span className="block text-[12px] text-ink-faint truncate">{subtitle}</span>
        )}
      </span>
      {(value != null || valueSub != null) && (
        <span className="shrink-0 text-right">
          {value != null && <span className="block text-[14px] text-ink">{value}</span>}
          {valueSub != null && (
            <span className="block text-[12px] text-ink-faint">{valueSub}</span>
          )}
        </span>
      )}
    </>
  );
  const kelas = `flex items-center gap-3 py-3 ${className}`.trim();
  if (href) {
    return (
      <a href={href} className={`${kelas} hover:opacity-80 transition`}>
        {isi}
      </a>
    );
  }
  return <div className={kelas}>{isi}</div>;
}

export function PersonRow({
  name,
  subtitle,
  value,
  index = 0,
  href,
  className = "",
}: {
  name: string;
  subtitle?: ReactNode;
  value?: ReactNode;
  index?: number;
  href?: string;
  className?: string;
}) {
  const isi = (
    <>
      <Avatar name={name} size="md" index={index} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-ink truncate">{name}</span>
        {subtitle != null && (
          <span className="block text-[12px] text-ink-faint truncate">{subtitle}</span>
        )}
      </span>
      {value != null && <span className="shrink-0 text-[14px] text-ink">{value}</span>}
    </>
  );
  const kelas = `flex items-center gap-3 py-3 ${className}`.trim();
  if (href) {
    return (
      <a href={href} className={`${kelas} hover:opacity-80 transition`}>
        {isi}
      </a>
    );
  }
  return <div className={kelas}>{isi}</div>;
}
