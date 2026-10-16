"use client";

/**
 * Intro Board dan Learning Board dalam menu sisi pendidik (KZ-022d,
 * permintaan Boss). Shell memanggil hook ini; halaman sedia ada yang
 * memanggil <Shell tabs={EDU_TABS}> tidak perlu disunting.
 *
 * Kelas yang dipaut (kelasNav.pilihKelasNav):
 *   1. Kelas dalam laluan semasa (/educator/classes/<id>/...). Kelas ini
 *      juga diingati dalam storan pelayar.
 *   2. Kelas terakhir yang dibuka (storan pelayar).
 *   3. Kelas aktif pertama mengikut susunan aktiviti.
 * Jika pendidik tiada kelas, item tidak dipaparkan. Hook hanya bertindak
 * apabila senarai tab mengandungi /educator/classes (menu pendidik).
 */

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutGrid } from "lucide-react";
import { listMyClasses } from "@/lib/data";
import { statusKelas, susunKelas } from "@/lib/kelasStatus";
import {
  KUNCI_KELAS_PENDIDIK,
  kelasDariLaluanPendidik,
  pautanPapanKelasPendidik,
  pilihKelasNav,
} from "@/lib/kelasNav";

type TabAsas = {
  href: string;
  label: string;
  group?: string;
  icon?: React.ReactNode;
  match?: string[];
};

type KelasRingkas = Parameters<typeof susunKelas>[0][number];

const RUMAH_PENDIDIK = "/educator/classes";

export function useTabPapanPendidik<T extends TabAsas>(tabs: T[]): T[] {
  const pathname = usePathname();
  const menuPendidik = tabs.some((t) => t.href === RUMAH_PENDIDIK);
  const [urutan, setUrutan] = useState<KelasRingkas[]>([]);
  const [simpanan, setSimpanan] = useState<string | null>(null);

  useEffect(() => {
    if (!menuPendidik) return;
    let alive = true;
    try {
      setSimpanan(window.localStorage.getItem(KUNCI_KELAS_PENDIDIK));
    } catch {
      /* storan disekat */
    }
    listMyClasses()
      .then((cs) => {
        if (alive) setUrutan(susunKelas(cs as KelasRingkas[]));
      })
      .catch(() => {
        if (alive) setUrutan([]);
      });
    return () => {
      alive = false;
    };
  }, [menuPendidik]);

  // Ingat kelas yang sedang dibuka supaya pautan kekal pada kelas itu.
  const dariLaluan = kelasDariLaluanPendidik(pathname);
  useEffect(() => {
    if (!dariLaluan || !urutan.some((k) => k.id === dariLaluan)) return;
    setSimpanan(dariLaluan);
    try {
      window.localStorage.setItem(KUNCI_KELAS_PENDIDIK, dariLaluan);
    } catch {
      /* abaikan */
    }
  }, [dariLaluan, urutan]);

  return useMemo(() => {
    if (!menuPendidik || urutan.length === 0) return tabs;
    const lalai = urutan.find((k) => statusKelas(k) === "aktif") ?? urutan[0];
    const classId = pilihKelasNav(
      pathname,
      simpanan,
      urutan.map((k) => k.id),
      lalai ? lalai.id : null,
      kelasDariLaluanPendidik,
    );
    if (!classId) return tabs;
    const p = pautanPapanKelasPendidik(classId);
    const rumah = tabs.find((t) => t.href === RUMAH_PENDIDIK);
    const papan = [
      { href: p.intro, label: "Intro Board", group: rumah?.group, icon: <ClipboardList className="w-5 h-5" /> },
      { href: p.learning, label: "Learning Board", group: rumah?.group, icon: <LayoutGrid className="w-5 h-5" /> },
    ] as T[];
    const i = tabs.findIndex((t) => t.href === RUMAH_PENDIDIK);
    return [...tabs.slice(0, i + 1), ...papan, ...tabs.slice(i + 1)];
  }, [menuPendidik, urutan, simpanan, pathname, tabs]);
}
