"use client";
import Shell from "@/components/Shell";
import { Home, ListChecks, Trophy as Tp, FileText, UserCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { demoSubmissions, demoChallenges } from "@/lib/demo";
const tabs = [
  { href: "/participant/home", label: "Home", icon: <Home className="w-5 h-5"/> },
  { href: "/participant/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/participant/leaderboard", label: "Leaderboard", icon: <Tp className="w-5 h-5"/> },
  { href: "/participant/submissions", label: "Submissions", icon: <FileText className="w-5 h-5"/> },
  { href: "/participant/profile", label: "Profile", icon: <UserCircle className="w-5 h-5"/> },
];
export default function Submissions() {
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">My Submissions</h2>
      <div className="space-y-3">{demoSubmissions.map(s => {
        const ch = demoChallenges.find(c=>c.id===s.challenge_id);
        const icon = s.status==="approved"?<CheckCircle className="w-5 h-5 text-green-500"/>:s.status==="pending"?<Clock className="w-5 h-5 text-yellow-500"/>:<XCircle className="w-5 h-5 text-red-500"/>;
        return (<div key={s.id} className="card"><div className="flex items-center justify-between mb-1"><div className="font-semibold">{ch?.title}</div>{icon}</div><div className="text-sm text-gray-500">{s.content}</div>{s.feedback&&<div className="text-xs mt-1 text-green-600">Feedback: {s.feedback}</div>}</div>);
      })}</div>
    </Shell>
  );
}
