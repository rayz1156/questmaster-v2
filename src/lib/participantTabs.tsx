"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Home,
  BookOpen,
  Compass,
  Users,
  Trophy,
  Award,
  User as UserIcon,
  ClipboardList,
  LayoutGrid,
} from "lucide-react";
import { listEnrolledClasses, listMyClassActivity } from "@/lib/data";
import { statusKelas, susunKelas, type AktivitiKelas } from "@/lib/kelasStatus";
import { KUNCI_KELAS_AKTIF, pilihKelasNav, pautanPapanKelas } from "@/lib/kelasNav";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import type { KunciKamus } from "@/lib/i18n";

export const LEADERBOARD_HREF = "/participant/leaderboard";

// Single source of truth for the participant (student) sidebar navigation.
// Prefer <ParticipantShell> over importing this directly: it menapis tab
// Ranking apabila educator menyembunyikan leaderboard.
//
// KZ-021: setiap tab membawa medan `group` supaya Shell memaparkan
// navigasi berkumpulan (KZ-DS-v3 bahagian 3) tanpa memecahkan pemanggil
// lama. Penapisan Ranking dalam useParticipantTabs TIDAK berubah.
//
// KZ-022c (permintaan Boss): Intro Board dan Learning Board kelas semasa
// dipaparkan di kumpulan Classes. Kelas dipilih oleh pilihKelasNav
// (laluan semasa, kemudian pilihan terakhir di Home, kemudian kelas lalai
// Home). Jika pelajar belum sertai kelas, kedua-dua item tidak dipaparkan.
//
// KZ-040: `label` kekal teks English sebagai fallback, tetapi paparan
// sebenar datang daripada `kunci` / `kunciGroup` kamus yang diterjemah
// di dalam useParticipantTabs mengikut bahasa pengguna.
export const PARTICIPANT_TABS: {
  href: string;
  label: string;
  kunci: KunciKamus;
  kunciGroup: KunciKamus;
  group: string;
  icon: React.ReactNode;
}[] = [
  { href: "/participant/home",        label: "Home",         kunci: "nav.home",         kunciGroup: "nav.groupMain",    group: "Main",    icon: <Home className="w-5 h-5" /> },
  { href: "/participant/learning",    label: "Learning",     kunci: "nav.learning",     kunciGroup: "nav.groupMain",    group: "Main",    icon: <BookOpen className="w-5 h-5" /> },
  { href: "/participant/activities",  label: "Activities",   kunci: "nav.activities",   kunciGroup: "nav.groupMain",    group: "Main",    icon: <Compass className="w-5 h-5" /> },
  { href: "/participant/teams",       label: "Teams",        kunci: "nav.teams",        kunciGroup: "nav.groupClasses", group: "Classes", icon: <Users className="w-5 h-5" /> },
  { href: LEADERBOARD_HREF,           label: "Ranking",       kunci: "nav.ranking",      kunciGroup: "nav.groupClasses", group: "Classes", icon: <Trophy className="w-5 h-5" /> },
  { href: "/participant/certificates", label: "Certificates", kunci: "nav.certificates", kunciGroup: "nav.groupClasses", group: "Classes", icon: <Award className="w-5 h-5" /> },
  { href: "/participant/profile",     label: "Profile",      kunci: "nav.profile",      kunciGroup: "nav.groupAccount", group: "Account", icon: <UserIcon className="w-5 h-5" /> },
];

const TABS_WITHOUT_LEADERBOARD = PARTICIPANT_TABS.filter((t) => t.href !== LEADERBOARD_HREF);

type KelasRingkas = Parameters<typeof susunKelas>[0][number];

function bacaSimpanan(): string | null {
  try {
    return window.localStorage.getItem(KUNCI_KELAS_AKTIF);
  } catch {
    return null;
  }
}

/**
 * Tab peserta dengan Ranking ditapis keluar apabila TIADA satu pun kelas
 * peserta ini membenarkan leaderboard.
 *
 * Bermula tanpa Ranking dan menambahnya hanya selepas data tiba. Arah ini
 * disengajakan: lebih baik tab muncul lewat sedikit daripada tab yang
 * sepatutnya tersembunyi berkelip muncul sekejap.
 */
export function useParticipantTabs() {
  const pathname = usePathname();
  const { t } = useBahasa();
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [urutan, setUrutan] = useState<KelasRingkas[]>([]);
  // Dinaikkan apabila Home menukar kelas, supaya pautan papan dikira semula.
  const [detik, setDetik] = useState(0);

  useEffect(() => {
    const naik = () => setDetik((d) => d + 1);
    window.addEventListener(KUNCI_KELAS_AKTIF, naik);
    return () => window.removeEventListener(KUNCI_KELAS_AKTIF, naik);
  }, []);

  useEffect(() => {
    let alive = true;
    listEnrolledClasses()
      .then((cs) => {
        if (!alive) return;
        // Kelas lama sebelum migrasi 0015 mungkin undefined; anggap ia nampak.
        setShowLeaderboard(cs.some((c) => c.leaderboard_visible !== false));
        // Susunan kelas sama seperti Home (pin dan aktiviti terkini).
        listMyClassActivity()
          .catch(() => [] as AktivitiKelas[])
          .then((ak) => {
            if (alive) setUrutan(susunKelas(cs as KelasRingkas[], ak as AktivitiKelas[]));
          });
      })
      .catch(() => {
        if (alive) setShowLeaderboard(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    // KZ-040: label dan kumpulan diterjemah mengikut bahasa semasa;
    // `label`/`group` asal pada pemalar kekal sebagai fallback English.
    const terjemahTab = <T extends { kunci: KunciKamus; kunciGroup: KunciKamus }>(tab: T) => ({
      ...tab,
      label: t(tab.kunci),
      group: t(tab.kunciGroup),
    });
    const asas = (showLeaderboard ? PARTICIPANT_TABS : TABS_WITHOUT_LEADERBOARD).map(terjemahTab);
    const lalai = urutan.find((k) => statusKelas(k) === "aktif") ?? urutan[0];
    const classId = pilihKelasNav(
      pathname,
      typeof window === "undefined" ? null : bacaSimpanan(),
      urutan.map((k) => k.id),
      lalai ? lalai.id : null,
    );
    if (!classId) return asas;
    const p = pautanPapanKelas(classId);
    const papan = [
      { href: p.intro, label: t("nav.introBoard"), kunci: "nav.introBoard" as KunciKamus, kunciGroup: "nav.groupClasses" as KunciKamus, group: t("nav.groupClasses"), icon: <ClipboardList className="w-5 h-5" /> },
      { href: p.learning, label: t("nav.learningBoard"), kunci: "nav.learningBoard" as KunciKamus, kunciGroup: "nav.groupClasses" as KunciKamus, group: t("nav.groupClasses"), icon: <LayoutGrid className="w-5 h-5" /> },
    ];
    // Letak di permulaan kumpulan Classes (sebelum Teams).
    const i = asas.findIndex((x) => x.group === t("nav.groupClasses"));
    return i < 0 ? [...asas, ...papan] : [...asas.slice(0, i), ...papan, ...asas.slice(i)];
    // `detik` sengaja menjadi kebergantungan: ia memaksa simpanan dibaca semula.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLeaderboard, urutan, pathname, detik, t]);
}
