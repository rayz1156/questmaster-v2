"use client";

import { useEffect, useState } from "react";
import { Home, BookOpen, Compass, Users, Trophy, Award, User as UserIcon } from "lucide-react";
import { listEnrolledClasses } from "@/lib/data";

export const LEADERBOARD_HREF = "/participant/leaderboard";

// Single source of truth for the participant (student) sidebar navigation.
// Prefer <ParticipantShell> over importing this directly: it menapis tab
// Ranking apabila educator menyembunyikan leaderboard.
//
// KZ-021: setiap tab membawa medan `group` supaya Shell memaparkan
// navigasi berkumpulan (KZ-DS-v3 bahagian 3) tanpa memecahkan pemanggil
// lama. Penapisan Ranking dalam useParticipantTabs TIDAK berubah.
export const PARTICIPANT_TABS = [
  { href: "/participant/home",        label: "Home",       group: "Main",    icon: <Home className="w-5 h-5" /> },
  { href: "/participant/learning",    label: "Learning",   group: "Main",    icon: <BookOpen className="w-5 h-5" /> },
  { href: "/participant/activities",  label: "Activities", group: "Main",    icon: <Compass className="w-5 h-5" /> },
  { href: "/participant/teams",       label: "Teams",      group: "Classes", icon: <Users className="w-5 h-5" /> },
  { href: LEADERBOARD_HREF,           label: "Ranking",    group: "Classes", icon: <Trophy className="w-5 h-5" /> },
  { href: "/participant/certificates", label: "Certificates", group: "Classes", icon: <Award className="w-5 h-5" /> },
  { href: "/participant/profile",     label: "Profile",    group: "Account", icon: <UserIcon className="w-5 h-5" /> },
];

const TABS_WITHOUT_LEADERBOARD = PARTICIPANT_TABS.filter((t) => t.href !== LEADERBOARD_HREF);

/**
 * Tab peserta dengan Ranking ditapis keluar apabila TIADA satu pun kelas
 * peserta ini membenarkan leaderboard.
 *
 * Bermula tanpa Ranking dan menambahnya hanya selepas data tiba. Arah ini
 * disengajakan: lebih baik tab muncul lewat sedikit daripada tab yang
 * sepatutnya tersembunyi berkelip muncul sekejap.
 */
export function useParticipantTabs() {
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    let alive = true;
    listEnrolledClasses()
      .then((cs) => {
        if (!alive) return;
        // Kelas lama sebelum migrasi 0015 mungkin undefined; anggap ia nampak.
        setShowLeaderboard(cs.some((c) => c.leaderboard_visible !== false));
      })
      .catch(() => {
        if (alive) setShowLeaderboard(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return showLeaderboard ? PARTICIPANT_TABS : TABS_WITHOUT_LEADERBOARD;
}
