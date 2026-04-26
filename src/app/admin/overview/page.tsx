"use client";
import Shell from "@/components/Shell";
import { LayoutDashboard, Users, Map } from "lucide-react";
import { demoHunts, demoLeaderboard, demoSubmissions, demoTeams } from "@/lib/demo";
const tabs = [
  { href: "/admin/overview", label: "Overview", icon: <LayoutDashboard className="w-5 h-5"/> },
  { href: "/admin/users", label: "Users", icon: <Users className="w-5 h-5"/> },
  { href: "/admin/hunts", label: "Hunts", icon: <Map className="w-5 h-5"/> },
];
export default function Overview() {
  const stats = [
    { label: "Total Users", value: demoLeaderboard.length },
    { label: "Active Hunts", value: demoHunts.filter(h=>h.status==="active").length },
    { label: "Teams", value: demoTeams.length },
    { label: "Submissions", value: demoSubmissions.length },
  ];
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Admin Overview</h2>
      <div className="grid grid-cols-2 gap-3 mb-4">{stats.map(s=>(
        <div key={s.label} className="card text-center"><div className="text-2xl font-bold text-brand-purple">{s.value}</div><div className="text-xs text-gray-400">{s.label}</div></div>
      ))}</div>
      <h3 className="font-semibold text-sm text-gray-500 mb-2">RECENT ACTIVITY</h3>
      <div className="space-y-2">
        <div className="card text-sm">Alex submitted for "Library riddle" <span className="text-gray-400">2 min ago</span></div>
        <div className="card text-sm">Prof. Smith approved "Find the bronze statue" <span className="text-gray-400">5 min ago</span></div>
        <div className="card text-sm">New team "Quest Squad" created <span className="text-gray-400">10 min ago</span></div>
      </div>
    </Shell>
  );
}
