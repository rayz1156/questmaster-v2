"use client";
import Shell from "@/components/Shell";
import { ListChecks, ClipboardCheck, Users, BarChart3, Plus } from "lucide-react";
import Link from "next/link";
import { demoHunts } from "@/lib/demo";
const tabs = [
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/review", label: "Review", icon: <ClipboardCheck className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
];
export default function EduActivities() {
  return (
    <Shell tabs={tabs}>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-bold text-lg">Hunt Activities</h2>
        <Link href="/educator/activities/new" className="btn-primary flex items-center gap-1 py-2 px-3 text-sm"><Plus className="w-4 h-4"/>New Hunt</Link>
      </div>
      <div className="space-y-3">{demoHunts.map(h => (
        <div key={h.id} className="card">
          <div className="flex justify-between"><span className="font-semibold">{h.name}</span><span className={`text-xs px-2 py-1 rounded-full ${h.status==="active"?"bg-green-100 text-green-700":"bg-gray-100 text-gray-500"}`}>{h.status}</span></div>
          <p className="text-sm text-gray-500 mt-1">{h.description}</p>
        </div>
      ))}</div>
    </Shell>
  );
}
