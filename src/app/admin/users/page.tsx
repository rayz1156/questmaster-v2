"use client";
import Shell from "@/components/Shell";
import { LayoutDashboard, Users as UsersIcon, Map, Search } from "lucide-react";
import { useState } from "react";
import { demoLeaderboard } from "@/lib/demo";
const tabs = [
  { href: "/admin/overview", label: "Overview", icon: <LayoutDashboard className="w-5 h-5"/> },
  { href: "/admin/users", label: "Users", icon: <UsersIcon className="w-5 h-5"/> },
  { href: "/admin/hunts", label: "Hunts", icon: <Map className="w-5 h-5"/> },
];
export default function AdminUsers() {
  const [q, setQ] = useState("");
  const filtered = demoLeaderboard.filter(u=>u.display_name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Users</h2>
      <div className="relative mb-3"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400"/><input className="input pl-9" placeholder="Search users..." value={q} onChange={e=>setQ(e.target.value)}/></div>
      <div className="space-y-2">{filtered.map(u=>(
        <div key={u.user_id} className="card flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-brand-gradient text-white flex items-center justify-center text-sm font-bold">{u.display_name[0]}</div><div><div className="font-medium">{u.display_name}</div><div className="text-xs text-gray-400">{u.team_name}</div></div></div>
          <span className="text-sm text-brand-purple font-semibold">{u.total_points} pts</span>
        </div>
      ))}</div>
    </Shell>
  );
}
