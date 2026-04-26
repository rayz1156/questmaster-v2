"use client";
import Shell from "@/components/Shell";
import { Home, ListChecks, Trophy as Tp, FileText, UserCircle } from "lucide-react";
import { getSession } from "@/lib/session";
import { demoHunts, demoChallenges } from "@/lib/demo";
import { useEffect, useState } from "react";
import { User } from "@/lib/types";
const tabs = [
  { href: "/participant/home", label: "Home", icon: <Home className="w-5 h-5"/> },
  { href: "/participant/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/participant/leaderboard", label: "Leaderboard", icon: <Tp className="w-5 h-5"/> },
  { href: "/participant/submissions", label: "Submissions", icon: <FileText className="w-5 h-5"/> },
  { href: "/participant/profile", label: "Profile", icon: <UserCircle className="w-5 h-5"/> },
];
export default function P() {
  const [u, setU] = useState<User|null>(null);
  useEffect(()=>setU(getSession()),[]);
  const hunt = demoHunts.find(h=>h.status==="active");
  const pct = u ? Math.min(100, (u.xp%500)/500*100) : 0;
  return (
    <Shell tabs={tabs}>
      {u && <>
      <div className="card mb-4">
        <div className="text-xs font-semibold text-gray-500 mb-1">LEVEL {u.level} • {u.xp} XP</div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-brand-gradient rounded-full" style={{width:`${pct}%`}}/></div>
        <div className="text-xs text-gray-400 mt-1">{500-u.xp%500} XP to level {u.level+1}</div>
      </div>
      {hunt && <div className="card mb-4"><div className="text-xs text-brand-purple font-semibold mb-1">ACTIVE HUNT</div><div className="font-bold text-lg">{hunt.name}</div><p className="text-sm text-gray-500">{hunt.description}</p><div className="mt-2 text-xs text-gray-400">{demoChallenges.filter(c=>c.hunt_id===hunt.id).length} challenges • {hunt.location}</div></div>}
      <div className="text-sm font-semibold text-gray-500 mb-2">ACHIEVEMENTS</div>
      <div className="grid grid-cols-3 gap-2">{["First Blood","Explorer","Solver","Team Player","Speed Run","Perfectionist"].map(a=><div key={a} className="card text-center py-3"><div className="text-2xl mb-1">{["\u2694","\ud83c\udf0d","\ud83e\udde9","\ud83e\udd1d","\u26a1","\u2b50"][Math.floor(Math.random()*6)]}</div><div className="text-xs font-medium">{a}</div></div>)}
      </div></>
      }
    </Shell>
  );
}
