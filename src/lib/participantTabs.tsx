import { Home, BookOpen, Compass, Users, Trophy, User as UserIcon } from "lucide-react";

// Single source of truth for the participant (student) sidebar navigation.
// Import this everywhere a page renders <Shell tabs={PARTICIPANT_TABS}>.
export const PARTICIPANT_TABS = [
  { href: "/participant/home",        label: "Home",       icon: <Home className="w-5 h-5" /> },
  { href: "/participant/learning",    label: "Learning",   icon: <BookOpen className="w-5 h-5" /> },
  { href: "/participant/activities",  label: "Activities", icon: <Compass className="w-5 h-5" /> },
  { href: "/participant/teams",       label: "Teams",      icon: <Users className="w-5 h-5" /> },
  { href: "/participant/leaderboard", label: "Ranking",    icon: <Trophy className="w-5 h-5" /> },
  { href: "/participant/profile",     label: "Profile",    icon: <UserIcon className="w-5 h-5" /> },
];
