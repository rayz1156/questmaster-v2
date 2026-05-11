"use client";
import Shell from "@/components/Shell";
import ProfileView from "@/components/ProfileView";
import { Home, Compass, Trophy, Users, User as UserIcon } from "lucide-react";

const tabs = [
  { href: "/participant/home",      label: "Home",       icon: <Home className="w-5 h-5" /> },
  { href: "/participant/activities",label: "Activities", icon: <Compass className="w-5 h-5" /> },
  { href: "/participant/teams",     label: "Teams",      icon: <Users className="w-5 h-5" /> },
  { href: "/participant/rankings",  label: "Ranking",    icon: <Trophy className="w-5 h-5" /> },
  { href: "/participant/profile",   label: "Profile",    icon: <UserIcon className="w-5 h-5" /> },
];

export default function Page() {
  return (
    <Shell tabs={tabs}>
      <ProfileView role="participant" />
    </Shell>
  );
}
