"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListProfiles, adminListAllHunts, adminListAllSubmissions } from "@/lib/data";
export default function Page() {
  const [stats, setStats] = useState({ users: 0, educators: 0, hunts: 0, active: 0, subs: 0, pending: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  useEffect(() => { (async () => {
    const [profiles, hunts, subs] = await Promise.all([adminListProfiles(), adminListAllHunts(), adminListAllSubmissions()]);
    setStats({
      users: profiles.length,
      educators: profiles.filter(p => p.role === 'educator').length,
      hunts: hunts.length,
      active: hunts.filter(h => h.status === 'active').length,
      subs: subs.length,
      pending: subs.filter(s => s.status === 'pending').length,
    });
    setRecent(subs.slice(0, 8));
  })(); }, []);
  const Card = ({ label, value }: { label: string; value: number }) => (
    <div className="card text-center"><div className="text-2xl font-bold">{value}</div><div className="text-xs text-gray-500 mt-1">{label}</div></div>
  );
  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">Overview</h2>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card label="Users" value={stats.users}/>
        <Card label="Educators" value={stats.educators}/>
        <Card label="Activities" value={stats.hunts}/>
        <Card label="Active" value={stats.active}/>
        <Card label="Submissions" value={stats.subs}/>
        <Card label="Pending" value={stats.pending}/>
      </div>
      <h3 className="font-semibold text-sm text-gray-700 mb-2">Recent submissions</h3>
      <div className="space-y-2">{recent.map(s => (
        <div key={s.id} className="card text-sm flex justify-between">
          <span className="font-mono">{s.answer || '—'}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${s.status==='approved'?'bg-green-100 text-green-700':s.status==='rejected'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700'}`}>{s.status}</span>
        </div>))}</div>
    </Shell>
  );
}
