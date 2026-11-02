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
import type { KunciKamus } from "@/lib/i18n";

export type AdminTab = {
  href: string;
  label: string;
  /** Kumpulan bar sisi (KZ-021). */
  group?: string;
  /** Kunci i18n label (KZ-040); `label` kekal English sebagai fallback. */
  kunci: KunciKamus;
  /** Kunci i18n kumpulan bar sisi (KZ-040); `group` kekal English sebagai fallback. */
  kunciGroup?: KunciKamus;
  icon: React.ReactNode;
  /** Kunci kiraan lencana yang dimuat oleh AdminShell. */
  lencana?: "moderasi" | "maklumbalas";
};

export const adminTabs: AdminTab[] = [
  { href: "/admin/overview", label: "Overview", kunci: "nav.adminOverview", group: "Overview", kunciGroup: "nav.groupOverview", icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: "/admin/users", label: "Users", kunci: "nav.adminUsers", group: "Management", kunciGroup: "nav.groupManagement", icon: <Users className="w-5 h-5" /> },
  { href: "/admin/classes", label: "Classes", kunci: "nav.adminClasses", group: "Management", kunciGroup: "nav.groupManagement", icon: <GraduationCap className="w-5 h-5" /> },
  { href: "/admin/hunts", label: "Activities", kunci: "nav.adminActivities", group: "Management", kunciGroup: "nav.groupManagement", icon: <Map className="w-5 h-5" /> },
  { href: "/admin/teams", label: "Teams", kunci: "nav.adminTeams", group: "Management", kunciGroup: "nav.groupManagement", icon: <UsersRound className="w-5 h-5" /> },
  { href: "/admin/points", label: "Points", kunci: "nav.adminPoints", group: "Management", kunciGroup: "nav.groupManagement", icon: <Coins className="w-5 h-5" /> },
  { href: "/admin/leaderboard", label: "Leaderboard", kunci: "nav.adminLeaderboard", group: "Management", kunciGroup: "nav.groupManagement", icon: <Trophy className="w-5 h-5" /> },
  { href: "/admin/certificates", label: "Certificates", kunci: "nav.adminCertificates", group: "Management", kunciGroup: "nav.groupManagement", icon: <Award className="w-5 h-5" /> },
  { href: "/admin/moderation", label: "Moderation", kunci: "nav.adminModeration", group: "Security", kunciGroup: "nav.groupSecurity", icon: <ShieldCheck className="w-5 h-5" />, lencana: "moderasi" as const },
  { href: "/admin/audit", label: "Audit", kunci: "nav.adminAudit", group: "Security", kunciGroup: "nav.groupSecurity", icon: <ScrollText className="w-5 h-5" /> },
  { href: "/admin/feedback", label: "Feedback", kunci: "nav.adminFeedback", group: "Security", kunciGroup: "nav.groupSecurity", icon: <MessageSquare className="w-5 h-5" />, lencana: "maklumbalas" as const },
  { href: "/admin/settings", label: "Settings", kunci: "nav.adminSettings", group: "System", kunciGroup: "nav.groupSystem", icon: <Settings className="w-5 h-5" /> },
];
