"use client";

import { useEffect, useState } from "react";
import { Home, BookOpen, Compass, Users, Trophy, User as UserIcon } from "lucide-react";
import { listEnrolledClasses } from "@/lib/data";

export const LEADERBOARD_HREF = "/participant/leaderboard";

// Single source of truth for the participant (student) sidebar navigation.
// Prefer <ParticipantShell> over importing this directly: it menapis tab
// Ranking apabila educator menyembunyikan leaderboard.
export const PARTICIPANT_TABS = [
  { href: "/participant/home",        label: "Home",       icon: <Home className="w-5 h-5" /> },
  { href: "/participant/learning",    label: "Learning",   icon: <BookOpen className="w-5 h-5" /> },
  { href: "/participant/activities",  label: "Activities", icon: <Compass className="w-5 h-5" /> },
  { href: "/participant/teams",       label: "Teams",      icon: <Users className="w-5 h-5" /> },
  { href: LEADERBOARD_HREF,           label: "Ranking",    icon: <Trophy className="w-5 h-5" /> },
  { href: "/participant/profile",     label: "Profile",    icon: <UserIcon className="w-5 h-5" /> },
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
