"use client";
import Shell from "@/components/Shell";
import { ListChecks, ClipboardCheck, Users, BarChart3 } from "lucide-react";
import { demoTeams } from "@/lib/demo";
const tabs = [
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/review", label: "Review", icon: <ClipboardCheck className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
];
export default function Teams() {
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Teams</h2>
      <div className="space-y-3">{demoTeams.map(t => (
        <div key={t.id} className="card flex justify-between items-center">
          <div><div className="font-semibold">{t.name}</div><div className="text-xs text-gray-400">{t.members.length} members</div></div>
          <div className="text-brand-purple font-bold">{t.total_points} pts</div>
        </div>
      ))}</div>
    </Shell>
  );
}
