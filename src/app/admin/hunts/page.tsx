"use client";
import Shell from "@/components/Shell";
import { LayoutDashboard, Users, Map } from "lucide-react";
import { demoHunts } from "@/lib/demo";
const tabs = [
  { href: "/admin/overview", label: "Overview", icon: <LayoutDashboard className="w-5 h-5"/> },
  { href: "/admin/users", label: "Users", icon: <Users className="w-5 h-5"/> },
  { href: "/admin/hunts", label: "Hunts", icon: <Map className="w-5 h-5"/> },
];
export default function AdminHunts() {
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">All Hunts</h2>
      <div className="space-y-3">{demoHunts.map(h=>(
        <div key={h.id} className="card">
          <div className="flex justify-between mb-1"><span className="font-semibold">{h.name}</span><span className={`text-xs px-2 py-1 rounded-full ${h.status==="active"?"bg-green-100 text-green-700":h.status==="draft"?"bg-gray-100 text-gray-500":"bg-blue-100 text-blue-700"}`}>{h.status}</span></div>
          <p className="text-sm text-gray-500">{h.description}</p>
          <div className="text-xs text-gray-400 mt-1">{h.location} | Teams: {h.max_teams} | Size: {h.team_size}</div>
        </div>
      ))}</div>
    </Shell>
  );
}
