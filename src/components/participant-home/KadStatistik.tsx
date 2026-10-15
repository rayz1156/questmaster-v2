"use client";

/**
 * Empat kad statistik papan pemuka peserta (KZ-018).
 *
 * Setiap kad: petak ikon berwarna lembut di kiri, nombor besar. Semua
 * nombor datang daripada fungsi data sedia ada; tiada nilai tetap.
 * Kategori XP/Level/Badge sengaja tidak wujud di sini.
 */

import { BookOpen, ClipboardList, Zap, Trophy } from "lucide-react";
import type { ReactNode } from "react";

type KadDef = {
  label: string;
  /** Rentetan nilai yang dipaparkan besar (contoh "#3" atau ","). */
  nilai: string;
  /** Keterangan kecil di bawah nombor (pilihan). */
  nota?: ReactNode;
  ikon: ReactNode;
  /** Kelas latar dan teks petak ikon, contoh "bg-violet-100 text-violet-700". */
  warna: string;
};

export default function KadStatistik({
  bilKelas,
  aktivitiAktif,
  mata,
  kedudukan,
}: {
  bilKelas: number;
  aktivitiAktif: number;
  mata: number;
  kedudukan: number;
}) {
  const kad: KadDef[] = [
    {
      label: "Enrolled classes",
      nilai: String(bilKelas),
      ikon: <BookOpen className="w-6 h-6" aria-hidden="true" />,
      warna: "bg-violet-100 text-violet-700",
    },
    {
      label: "Active activities",
      nilai: String(aktivitiAktif),
      ikon: <ClipboardList className="w-6 h-6" aria-hidden="true" />,
      warna: "bg-indigo-100 text-indigo-700",
    },
    {
      label: "Total points",
      nilai: mata.toLocaleString(),
      nota: mata > 0 ? "Keep it up." : "Complete activities to earn points.",
      ikon: <Zap className="w-6 h-6" aria-hidden="true" />,
      warna: "bg-amber-100 text-amber-700",
    },
    {
      label: "Class rank",
      // Tiada pasukan: paparan "," seperti kelakuan lama halaman ini.
      nilai: kedudukan > 0 ? `#${kedudukan}` : ",",
      nota:
        kedudukan > 0 && kedudukan <= 3
          ? "Top three. Keep it up."
          : kedudukan > 0
            ? "Climb higher."
            : "No ranking yet.",
      ikon: <Trophy className="w-6 h-6" aria-hidden="true" />,
      warna: "bg-emerald-100 text-emerald-700",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kad.map((k) => (
        <div key={k.label} className="card rounded-xl">
          <div className="flex items-center gap-4">
            <span className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${k.warna}`}>
              {k.ikon}
            </span>
            <div className="min-w-0">
              <div className="text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">
                {k.nilai}
              </div>
              <div className="text-sm text-ink-muted mt-1.5">{k.label}</div>
            </div>
          </div>
          {k.nota && <div className="text-xs text-ink-faint mt-2.5">{k.nota}</div>}
        </div>
      ))}
    </div>
  );
}