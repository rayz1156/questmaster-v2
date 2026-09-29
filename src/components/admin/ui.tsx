'use client';

// ui.tsx
// Komponen kecil dikongsi oleh halaman ruang kerja admin (V2-011b).
//
// Fail ini sengaja hanya mengimport next/link dan jenis React: relTime dan
// initials diuji oleh scripts/selftest-admin-ui.ts melalui fail ini, jadi
// jangan tambah import yang menarik klien Supabase atau modul pelayan.

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

/* =========================================================
 * Fungsi tulen
 * ========================================================= */

function tarikhRingkas(t: number): string {
  // Locale tetap en-US supaya ujian dan skrin semua mesin konsisten.
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Masa relatif: "just now", "5 min ago", "3 h ago", "2 d ago", selepas
 * seminggu tarikh pendek. Masa rujukan boleh disuntik untuk ujian;
 * null atau tarikh rosak menjadi "Never" (lajur Last active).
 */
export function relTime(iso: string | null | undefined, kiniMs?: number): string {
  if (!iso) return 'Never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Never';
  const kini = typeof kiniMs === 'number' ? kiniMs : Date.now();
  const beza = kini - t;
  if (beza < 60_000) return 'just now';
  if (beza < 3_600_000) return `${Math.floor(beza / 60_000)} min ago`;
  if (beza < 86_400_000) return `${Math.floor(beza / 3_600_000)} h ago`;
  if (beza < 7 * 86_400_000) return `${Math.floor(beza / 86_400_000)} d ago`;
  return tarikhRingkas(t);
}

/**
 * Huruf awal avatar, logik sama dengan Shell.tsx: gelaran Dr/Prof/Mr
 * dibuang, satu perkataan ambil dua huruf pertama, selebihnya huruf
 * pertama dan terakhir. Nama kosong menjadi "?".
 */
export function initials(name?: string | null): string {
  const parts = String(name || '')
    .replace(/^(Dr|Dr\.|Prof|Prof\.|Mr|Ms|Mrs)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* =========================================================
 * Komponen paparan
 * ========================================================= */

/** Kad asas; token reka bentuk admin yang sama di mana-mana. */
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`bg-white border border-hairline rounded-2xl shadow-card ${className}`}>{children}</div>;
}

/** Pil status: hijau Verified/Active, kuning Pending/Unverified, merah Suspended, violet peranan, kelabu neutral. */
export function Pill({ tone = 'gray', children }: { tone?: 'green' | 'yellow' | 'red' | 'violet' | 'gray'; children: ReactNode }) {
  const kelas =
    tone === 'green'
      ? 'bg-green-100 text-green-700'
      : tone === 'yellow'
        ? 'bg-yellow-100 text-yellow-700'
        : tone === 'red'
          ? 'bg-red-100 text-red-700'
          : tone === 'violet'
            ? 'bg-[#EAE6FC] text-brand-purple'
            : 'bg-gray-100 text-gray-600';
  return <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${kelas}`}>{children}</span>;
}

/** Kad statistik kecil dengan pautan pilihan. */
export function StatCard({
  label,
  value,
  hint,
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  icon?: ReactNode;
}) {
  const isi = (
    <div className="bg-white border border-hairline rounded-2xl shadow-card p-4 h-full">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</span>
        {icon && <span className="text-brand-purple shrink-0">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold text-ink mt-2">{value}</div>
      {hint && <div className="text-xs text-ink-muted mt-1">{hint}</div>}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block h-full transition hover:shadow-raised">
        {isi}
      </Link>
    );
  }
  return isi;
}

/** Tab garis bawah violet. */
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-5 border-b border-hairline overflow-x-auto">
      {items.map((t) => {
        const aktif = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`relative shrink-0 pb-3 pt-1 text-sm border-b-2 -mb-px transition ${
              aktif
                ? 'border-brand-purple text-brand-purple font-semibold'
                : 'border-transparent text-ink-muted hover:text-ink font-medium'
            }`}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className={`ml-1.5 text-xs ${aktif ? 'text-brand-purple' : 'text-ink-faint'}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Keadaan kosong dalam kad. */
export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-sm font-medium text-ink">{title}</div>
      {body && <div className="text-sm text-ink-muted mt-1">{body}</div>}
    </div>
  );
}

/**
 * Dialog alasan wajib untuk tindakan admin beralasan. Alasan 5 hingga 500
 * aksara (selepas trim), sama had dengan RPC migrasi 0047. Butang
 * pengesahan kekal dilumpuhkan sehingga alasan sah.
 */
export function ReasonDialog({
  open,
  title,
  confirmLabel,
  tone = 'default',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [alasan, setAlasan] = useState('');

  // Reset setiap kali dialog dibuka supaya alasan lama tidak bocor
  // antara tindakan.
  useEffect(() => {
    if (open) setAlasan('');
  }, [open]);

  if (!open) return null;
  const bersih = alasan.trim();
  const sah = bersih.length >= 5 && bersih.length <= 500;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl border border-hairline shadow-raised w-full max-w-md p-5">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <textarea
          autoFocus
          rows={4}
          maxLength={500}
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder="Explain what happened and why this action is needed"
          className="w-full mt-3 border border-hairline rounded-xl p-3 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-ink-faint">{bersih.length}/500</span>
          <span className="text-xs text-ink-faint">This is recorded in Audit.</span>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!sah}
            onClick={() => onConfirm(bersih)}
            className={
              tone === 'danger'
                ? 'bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40'
                : 'bg-brand-purple text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
