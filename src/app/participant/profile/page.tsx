"use client";
import Shell from "@/components/Shell";
import ProfileView from "@/components/ProfileView";
import { Home, Compass, Trophy, Users, User as UserIcon, BookOpen } from "lucide-react";
import { teks } from "@/i18n/teks";

const tabs = [
  { href: "/participant/home",      label: teks.peserta.profilTabUtama,       icon: <Home className="w-5 h-5" /> },
      { href: '/participant/learning', label: teks.peserta.profilTabPembelajaran, icon: <BookOpen className="w-5 h-5" /> },
      { href: "/participant/activities",label: teks.peserta.profilTabAktiviti, icon: <Compass className="w-5 h-5" /> },
  { href: "/participant/teams",     label: teks.peserta.profilTabPasukan,      icon: <Users className="w-5 h-5" /> },
  { href: "/participant/leaderboard",  label: teks.peserta.profilTabKedudukan,    icon: <Trophy className="w-5 h-5" /> },
  { href: "/participant/profile",   label: teks.peserta.profilTabProfil,    icon: <UserIcon className="w-5 h-5" /> },
];

export default function Page() {
  return (
    <Shell tabs={tabs}>
      <ProfileView role="participant" />
    </Shell>
  );
}
