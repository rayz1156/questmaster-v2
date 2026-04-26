"use client";
import Shell from "@/components/Shell";
import { Home, ListChecks, Trophy as Tp, FileText, UserCircle } from "lucide-react";
import { getSession } from "@/lib/session";
import { useEffect, useState } from "react";
import { User } from "@/lib/types";
const tabs = [
  { href: "/participant/home", label: "Home", icon: <Home className="w-5 h-5"/> },
  { href: "/participant/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/participant/leaderboard", label: "Leaderboard", icon: <Tp className="w-5 h-5"/> },
  { href: "/participant/submissions", label: "Submissions", icon: <FileText className="w-5 h-5"/> },
  { href: "/participant/profile", label: "Profile", icon: <UserCircle className="w-5 h-5"/> },
];
export default function Profile() {
  const [u,setU]=useState<User|null>(null);
  useEffect(()=>setU(getSession()),[]);
  if(!u) return null;
  return (
    <Shell tabs={tabs}>
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full bg-brand-gradient flex items-center justify-center text-white text-3xl font-bold mb-2">{u.display_name[0]}</div>
        <h2 className="text-xl font-bold">{u.display_name}</h2>
        <p className="text-sm text-gray-500">{u.email}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center"><div className="text-xl font-bold text-brand-purple">{u.level}</div><div className="text-xs text-gray-400">Level</div></div>
        <div className="card text-center"><div className="text-xl font-bold text-brand-purple">{u.xp}</div><div className="text-xs text-gray-400">Total XP</div></div>
        <div className="card text-center"><div className="text-xl font-bold text-brand-purple">6</div><div className="text-xs text-gray-400">Badges</div></div>
      </div>
    </Shell>
  );
}
