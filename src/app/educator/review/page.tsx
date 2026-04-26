"use client";
import Shell from "@/components/Shell";
import { ListChecks, ClipboardCheck, Users, BarChart3, CheckCircle, XCircle } from "lucide-react";
import { demoSubmissions, demoChallenges } from "@/lib/demo";
const tabs = [
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/review", label: "Review", icon: <ClipboardCheck className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
];
export default function Review() {
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Review Submissions</h2>
      <div className="space-y-3">{demoSubmissions.filter(s=>s.status==="pending").map(s => {
        const ch = demoChallenges.find(c=>c.id===s.challenge_id);
        return (<div key={s.id} className="card"><div className="font-semibold mb-1">{ch?.title}</div><div className="text-sm text-gray-500 mb-3">{s.content}</div><div className="flex gap-2"><button className="flex-1 py-2 rounded-xl bg-green-500 text-white font-semibold flex items-center justify-center gap-1"><CheckCircle className="w-4 h-4"/>Approve</button><button className="flex-1 py-2 rounded-xl bg-red-500 text-white font-semibold flex items-center justify-center gap-1"><XCircle className="w-4 h-4"/>Reject</button></div></div>);
      })}</div>
    </Shell>
  );
}
