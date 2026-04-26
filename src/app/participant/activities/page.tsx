"use client";
import Shell from "@/components/Shell";
import { Home, ListChecks, Trophy as Tp, FileText, UserCircle, ChevronRight } from "lucide-react";
import { demoChallenges, demoHunts } from "@/lib/demo";
const tabs = [
  { href: "/participant/home", label: "Home", icon: <Home className="w-5 h-5"/> },
  { href: "/participant/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/participant/leaderboard", label: "Leaderboard", icon: <Tp className="w-5 h-5"/> },
  { href: "/participant/submissions", label: "Submissions", icon: <FileText className="w-5 h-5"/> },
  { href: "/participant/profile", label: "Profile", icon: <UserCircle className="w-5 h-5"/> },
];
export default function Activities() {
  const hunt = demoHunts[0];
  const challenges = demoChallenges.filter(c => c.hunt_id === hunt.id);
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Challenges</h2>
      <div className="space-y-3">
        {challenges.map(c => (
          <div key={c.id} className="card flex items-center justify-between">
            <div><div className="font-semibold">{c.title}</div><div className="text-xs text-gray-400">{c.points} pts</div></div>
            <ChevronRight className="w-5 h-5 text-gray-300" />
          </div>
        ))}
      </div>
      <button className="btn-primary w-full mt-4">Submit Answer</button>
    </Shell>
  );
}
