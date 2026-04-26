"use client";
import Shell from "@/components/Shell";
import { Home, ListChecks, Trophy as Tp, FileText, UserCircle, Medal } from "lucide-react";
import { demoLeaderboard } from "@/lib/demo";
const tabs = [
  { href: "/participant/home", label: "Home", icon: <Home className="w-5 h-5"/> },
  { href: "/participant/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/participant/leaderboard", label: "Leaderboard", icon: <Tp className="w-5 h-5"/> },
  { href: "/participant/submissions", label: "Submissions", icon: <FileText className="w-5 h-5"/> },
  { href: "/participant/profile", label: "Profile", icon: <UserCircle className="w-5 h-5"/> },
];
export default function Leaderboard() {
  const top3 = demoLeaderboard.slice(0,3);
  const rest = demoLeaderboard.slice(3);
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Leaderboard</h2>
      <div className="flex justify-center items-end gap-4 mb-6">
        {[top3[1],top3[0],top3[2]].map((r,i) => r && (
          <div key={r.user_id} className="flex flex-col items-center">
            <div className={`w-12 h-12 rounded-full ${i===1?"bg-yellow-400 w-16 h-16":(i===0?"bg-gray-300":"bg-orange-300")} flex items-center justify-center text-white font-bold text-lg mb-1`}>{r.display_name[0]}</div>
            <div className="text-xs font-semibold">{r.display_name}</div>
            <div className="text-xs text-gray-400">{r.total_points} pts</div>
          </div>
        ))}
      </div>
      <div className="space-y-2">{rest.map(r => (
        <div key={r.user_id} className="card flex items-center justify-between">
          <div className="flex items-center gap-3"><span className="font-bold text-gray-400">#{r.rank}</span><span className="font-medium">{r.display_name}</span></div>
          <span className="text-sm font-semibold text-brand-purple">{r.total_points} pts</span>
        </div>
      ))}</div>
    </Shell>
  );
}
