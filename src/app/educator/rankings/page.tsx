"use client";
import Shell from "@/components/Shell";
import { ListChecks, ClipboardCheck, Users, BarChart3 } from "lucide-react";
import { demoLeaderboard } from "@/lib/demo";
const tabs = [
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/review", label: "Review", icon: <ClipboardCheck className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
];
export default function Rankings() {
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Rankings</h2>
      <div className="space-y-2">{demoLeaderboard.map(r => (
        <div key={r.user_id} className="card flex items-center justify-between">
          <div className="flex items-center gap-3"><span className="font-bold text-gray-400">#{r.rank}</span><span className="font-medium">{r.display_name}</span><span className="text-xs text-gray-400">{r.team_name}</span></div>
          <span className="text-sm font-semibold text-brand-purple">{r.total_points} pts</span>
        </div>
      ))}</div>
    </Shell>
  );
}
