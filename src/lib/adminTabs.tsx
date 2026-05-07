import { LayoutDashboard, Users, Map, ShieldCheck, ScrollText, GraduationCap, UserCog, Coins, Trophy } from "lucide-react";
export const adminTabs = [
  { href: "/admin/overview", label: "Overview", icon: <LayoutDashboard className="w-5 h-5"/> },
  { href: "/admin/users", label: "Users", icon: <Users className="w-5 h-5"/> },
  { href: "/admin/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/admin/hunts", label: "Quests", icon: <Map className="w-5 h-5"/> },
  { href: "/admin/teams", label: "Teams", icon: <UserCog className="w-5 h-5"/> },
  { href: "/admin/points", label: "Points", icon: <Coins className="w-5 h-5"/> },
  { href: "/admin/moderation", label: "Mod", icon: <ShieldCheck className="w-5 h-5"/> },
  { href: "/admin/leaderboard", label: "Ranking", icon: <Trophy className="w-5 h-5"/> },
  { href: "/admin/audit", label: "Audit", icon: <ScrollText className="w-5 h-5"/> },
];
