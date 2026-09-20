import { GraduationCap, ListChecks, Users, BarChart3, Activity, Zap, User as UserIcon } from 'lucide-react';

// Single source of truth for the educator sidebar navigation.
// Import this everywhere a page renders <Shell tabs={EDU_TABS}>.
export const EDU_TABS = [
  { href: "/educator/classes",    label: "Classes",    icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  // Live Quiz: top-level section, same rank as classes (Fasa 2).
  { href: "/educator/live",       label: "Quiz",       icon: <Zap className="w-5 h-5"/> },
  { href: "/educator/teams",      label: "Teams",      icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings",   label: "Rankings",   icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/analytics",  label: "Analytics",  icon: <Activity className="w-5 h-5"/> },
  { href: "/educator/profile",    label: "Profile",    icon: <UserIcon className="w-5 h-5"/> },
];
