// adminTabs.tsx
// Senarai destinasi ruang kerja admin, semakan Oktober 2026 (KZ-021).
//
// KZ-021 (KZ-DS-v3 bahagian 3): bar sisi admin berkumpulan. Setiap item
// membawa medan `group` dan `lencana` (kiraan moderasi/maklum balas yang
// dimuat oleh AdminShell). Struktur kumpulan mengikut spesifikasi:
//
//   OVERVIEW   Overview
//   MANAGEMENT Users, Classes, Activities, Teams, Points, Leaderboard,
//              Certificates
//   SECURITY   Moderation, Audit, Feedback
//   SYSTEM     Settings
//
// Semua laluan disahkan wujud (git ls-files src/app | grep page.tsx).
// Masih dieksport untuk keserasian dengan fail lama yang mengimportnya.
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Map,
  ShieldCheck,
  ScrollText,
  MessageSquare,
  Settings,
  UsersRound,
  Coins,
  Trophy,
  Award,
} from "lucide-react";

export type AdminTab = {
  href: string;
  label: string;
  /** Kumpulan bar sisi (KZ-021). */
  group?: string;
  icon: React.ReactNode;
  /** Kunci kiraan lencana yang dimuat oleh AdminShell. */
  lencana?: "moderasi" | "maklumbalas";
};

export const adminTabs: AdminTab[] = [
  { href: "/admin/overview", label: "Overview", group: "Overview", icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: "/admin/users", label: "Users", group: "Management", icon: <Users className="w-5 h-5" /> },
  { href: "/admin/classes", label: "Classes", group: "Management", icon: <GraduationCap className="w-5 h-5" /> },
  { href: "/admin/hunts", label: "Activities", group: "Management", icon: <Map className="w-5 h-5" /> },
  { href: "/admin/teams", label: "Teams", group: "Management", icon: <UsersRound className="w-5 h-5" /> },
  { href: "/admin/points", label: "Points", group: "Management", icon: <Coins className="w-5 h-5" /> },
  { href: "/admin/leaderboard", label: "Leaderboard", group: "Management", icon: <Trophy className="w-5 h-5" /> },
  { href: "/admin/certificates", label: "Certificates", group: "Management", icon: <Award className="w-5 h-5" /> },
  { href: "/admin/moderation", label: "Moderation", group: "Security", icon: <ShieldCheck className="w-5 h-5" />, lencana: "moderasi" as const },
  { href: "/admin/audit", label: "Audit", group: "Security", icon: <ScrollText className="w-5 h-5" /> },
  { href: "/admin/feedback", label: "Feedback", group: "Security", icon: <MessageSquare className="w-5 h-5" />, lencana: "maklumbalas" as const },
  { href: "/admin/settings", label: "Settings", group: "System", icon: <Settings className="w-5 h-5" /> },
];
