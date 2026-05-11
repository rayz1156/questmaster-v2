"use client";
import Shell from "@/components/Shell";
import ProfileView from "@/components/ProfileView";
import { GraduationCap, ListChecks, Users, BarChart3, User as UserIcon } from "lucide-react";

const tabs = [
  { href: "/educator/classes",   label: "Classes",    icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities",label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams",     label: "Teams",      icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings",  label: "Rankings",   icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/profile",   label: "Profile",    icon: <UserIcon className="w-5 h-5"/> },
];

export default function Page() {
  return (
    <Shell tabs={tabs}>
      <ProfileView role="educator" />
    </Shell>
  );
}
