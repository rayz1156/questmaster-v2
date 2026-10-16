"use client";

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { jumlahMukaSurat, potongHalaman } from "@/lib/uiKit";
import Dropdown, { type DropdownItem } from "./Dropdown";
import Pagination, { PageOf } from "./Pagination";

/**
 * Jadual data kit UI (KZ-021, gaya "Courses"/"Students"/"Users").
 *
 * Dalam kad `surface` (putih, sudut 4px, bayang kad). Kepala 13px #8094ae
 * berat 400 (bukan huruf besar) atas latar #ebeef2. Baris tinggi ~72px,
 * sel padding 8px dengan 24px kiri pada lajur pertama, pemisah #e5e9f2,
 * hover #f8f9fc. Lajur pertama (lead) menyokong kotak semak pilihan dan
 * avatar/petak. Lajur akhir "..." membuka dropdown tindakan. Bawah:
 * penomboran pelanggan di kiri dan "PAGE N OF M" di kanan.
 *
 * Telefon: lajur `hideOnMobile` disembunyikan.
 */

export type DataColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  /** Sembunyikan lajur pada skrin kecil. */
  hideOnMobile?: boolean;
  className?: string;
};

export type DataTableProps<T> = {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Tindakan baris; jika diberikan, lajur "..." automatik di hujung. */
  menuItems?: (row: T) => DropdownItem[];
  menuLabel?: string;
  /** Kotak semak pilihan lajur pertama. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (semua: boolean) => void;
  /** Slot kepala kad: carian, penapis, ikon tetapan. */
  head?: ReactNode;
  /** Penomboran pelanggan: halaman semasa (1-based) dan saiz halaman. */
  halaman?: number;
  saizHalaman?: number;
  onHalaman?: (h: number) => void;
  /** Kandungan keadaan kosong. */
  empty?: ReactNode;
  className?: string;
  /** `aria-label` jadual untuk pembaca skrin. */
  label: string;
};

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  menuItems,
  menuLabel = "Row actions",
  selectable,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  head,
  halaman = 1,
  saizHalaman = 10,
  onHalaman,
  empty,
  className = "",
  label,
}: DataTableProps<T>) {
  const jumlah = jumlahMukaSurat(rows.length, saizHalaman);
  const hal = Math.min(Math.max(1, halaman), jumlah);
  const barisHalaman = onHalaman ? potongHalaman(rows, hal, saizHalaman) : rows;
  const semuaDipilih =
    selectable && rows.length > 0 && rows.every((r, i) => selectedIds?.has(rowKey(r, i)));
  const paparPenomboran = !!onHalaman && rows.length > 0;

  return (
    <div
      className={`bg-white rounded-[4px] shadow-card overflow-hidden ${className}`.trim()}
    >
      {head != null && (
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-kz-line">
          {head}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left" aria-label={label}>
          <thead>
            <tr className="bg-[#ebeef2]">
              {selectable && (
                <th scope="col" className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    className="h-4 w-4 accent-brand-purple"
                    checked={semuaDipilih}
                    onChange={(e) => onToggleAll?.(e.target.checked)}
                  />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`text-[13px] font-normal text-ink-faint px-2 py-2 first:pl-6 whitespace-nowrap ${
                    c.hideOnMobile ? "hidden md:table-cell" : ""
                  } ${c.className || ""}`}
                >
                  {c.header}
                </th>
              ))}
              {menuItems && <th scope="col" className="w-12" aria-hidden="true" />}
            </tr>
          </thead>
          <tbody>
            {barisHalaman.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0) + (menuItems ? 1 : 0)}
                  className="py-10"
                >
                  {empty ?? (
                    <p className="text-center text-[14px] text-ink-faint">No records found.</p>
                  )}
                </td>
              </tr>
            )}
            {barisHalaman.map((r, i) => {
              const id = rowKey(r, i);
              const dipilih = selectedIds?.has(id);
              return (
                <tr
                  key={id}
                  className={`border-t border-kz-line hover:bg-[#f8f9fc] transition ${dipilih ? "bg-[#f8f9fc]" : ""}`}
                >
                  {selectable && (
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Select row ${i + 1}`}
                        className="h-4 w-4 accent-brand-purple"
                        checked={!!dipilih}
                        onChange={() => onToggleSelect?.(id)}
                      />
                    </td>
                  )}
                  {columns.map((c, ci) => (
                    <td
                      key={c.key}
                      className={`px-2 py-2 align-middle text-[13px] ${
                        ci === 0 ? "pl-6" : ""
                      } ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.className || ""}`}
                    >
                      {c.render(r, (hal - 1) * saizHalaman + i)}
                    </td>
                  ))}
                  {menuItems && (
                    <td className="px-2 py-2 align-middle text-right">
                      <Dropdown
                        items={menuItems(r)}
                        label={menuLabel}
                        trigger={({ open, toggle }) => (
                          <button
                            type="button"
                            onClick={toggle}
                            aria-haspopup="menu"
                            aria-expanded={open}
                            aria-label={menuLabel}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[4px] text-ink-faint hover:bg-[#ebeef2] hover:text-ink transition"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        )}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paparPenomboran && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-kz-line">
          <Pagination halaman={hal} jumlah={jumlah} onHalaman={onHalaman!} />
          <PageOf halaman={hal} jumlah={jumlah} />
        </div>
      )}
    </div>
  );
}
